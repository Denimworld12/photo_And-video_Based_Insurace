#!/usr/bin/env python3
"""
MAIN PIPELINE - Crop Damage Insurance Assessment
=================================================
Single entry point for backend integration.
Uses config.pkl for model configuration.

Output Format:
{
    "damage_type": "Weed Damage",
    "damage_percentage": 34.5,
    "damaged_area_m2": 517.5,
    "damaged_area_acres": 0.128,
    "confidence": 0.82,
    "claim_decision": "APPROVE"
}
"""

import sys
import os
import json
import pickle
from datetime import datetime
from typing import List, Dict, Optional

# Add modules to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import cv2

# Load config from pkl
CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'config.pkl')

def load_config():
    """Load configuration from pkl file"""
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'rb') as f:
            return pickle.load(f)
    return {
        'DAMAGE_CLASSES': ['DR', 'G', 'ND', 'WD', 'other'],
        'DAMAGE_NAMES': {
            'DR': 'Drought',
            'G': 'Good/Healthy',
            'ND': 'Nutrient Deficiency',
            'WD': 'Weed Damage',
            'other': 'Other Damage'
        },
        'DEFAULT_IMAGE_COVERAGE_M2': 1500.0
    }

CONFIG = load_config()


# ============================================================================
# RGB DAMAGE ANALYZER (No ML required)
# ============================================================================
def analyze_damage_rgb(image_path: str) -> Dict:
    """
    Analyze crop damage using RGB vegetation indices.
    Returns damage percentage and type.
    """
    img = cv2.imread(image_path)
    if img is None:
        return {'error': f'Could not load image: {image_path}'}
    
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32)
    b, g, r = cv2.split(img_rgb)
    total = r + g + b + 1e-6
    
    # Excess Green Index (healthy vegetation = high)
    exg = 2 * (g / total) - (r / total) - (b / total)
    avg_exg = float(np.mean(exg))
    
    # Excess Red Index (stressed/brown = high)
    exr = 1.4 * (r / total) - (g / total)
    avg_exr = float(np.mean(exr))
    
    # Soil detection
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    soil_mask = ((gray > 80) & (gray < 180)).astype(np.float32)
    
    # Healthy vegetation mask
    healthy_mask = (exg > 0.05).astype(np.float32)
    
    # Stress mask
    stress_mask = (exr > 0.1).astype(np.float32)
    
    # Combined damage mask
    damage_mask = np.clip(stress_mask + soil_mask * (1 - healthy_mask), 0, 1)
    damage_percentage = float(np.mean(damage_mask) * 100)
    
    # Infer damage type from indices
    if avg_exg > 0.1:
        damage_type_code = 'G'  # Good/Healthy
    elif avg_exr > 0.15:
        damage_type_code = 'DR'  # Drought (brown/dead)
    elif avg_exg < -0.1:
        damage_type_code = 'ND'  # Nutrient Deficiency (yellowing)
    elif 0 < avg_exg < 0.1 and avg_exr > 0.05:
        damage_type_code = 'WD'  # Weed Damage (mixed patterns)
    else:
        damage_type_code = 'other'
    
    damage_names = CONFIG.get('DAMAGE_NAMES', {})
    damage_type_name = damage_names.get(damage_type_code, 'Unknown')
    
    return {
        'damage_percentage': round(damage_percentage, 1),
        'damage_type_code': damage_type_code,
        'damage_type_name': damage_type_name,
        'vegetation_index': round(avg_exg, 3),
        'stress_index': round(avg_exr, 3),
        'image_size': list(img.shape[:2])
    }


# ============================================================================
# EXIF AREA CALCULATOR
# ============================================================================
def get_exif_coordinates(image_path: str) -> Optional[Dict]:
    """Extract GPS coordinates from EXIF data"""
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS, GPSTAGS
        
        img = Image.open(image_path)
        exif_data = img._getexif()
        
        if not exif_data:
            return None
        
        gps_info = {}
        for tag_id, value in exif_data.items():
            tag = TAGS.get(tag_id, tag_id)
            if tag == 'GPSInfo':
                for gps_tag_id, gps_value in value.items():
                    gps_tag = GPSTAGS.get(gps_tag_id, gps_tag_id)
                    gps_info[gps_tag] = gps_value
        
        if not gps_info:
            return None
        
        def convert_to_degrees(value):
            d, m, s = value
            return float(d) + float(m) / 60 + float(s) / 3600
        
        lat = convert_to_degrees(gps_info.get('GPSLatitude', (0, 0, 0)))
        lon = convert_to_degrees(gps_info.get('GPSLongitude', (0, 0, 0)))
        
        if gps_info.get('GPSLatitudeRef', 'N') == 'S':
            lat = -lat
        if gps_info.get('GPSLongitudeRef', 'E') == 'W':
            lon = -lon
        
        return {'lat': lat, 'lon': lon}
    
    except Exception as e:
        return None


def calculate_area_from_coordinates(coordinates: List[Dict]) -> float:
    """
    Calculate area from GPS coordinates using Shoelace formula.
    Returns area in square meters.
    """
    if len(coordinates) < 3:
        return 0.0
    
    try:
        from math import radians, cos, sqrt
        
        # Convert to local coordinate system
        avg_lat = sum(c['lat'] for c in coordinates) / len(coordinates)
        m_per_deg_lat = 111320
        m_per_deg_lon = m_per_deg_lat * cos(radians(avg_lat))
        
        # Convert to meters
        points = []
        for c in coordinates:
            x = (c['lon'] - coordinates[0]['lon']) * m_per_deg_lon
            y = (c['lat'] - coordinates[0]['lat']) * m_per_deg_lat
            points.append((x, y))
        
        # Shoelace formula
        n = len(points)
        area = 0.0
        for i in range(n):
            j = (i + 1) % n
            area += points[i][0] * points[j][1]
            area -= points[j][0] * points[i][1]
        
        return abs(area) / 2.0
    
    except Exception:
        return 0.0


# ============================================================================
# MAIN ASSESSMENT FUNCTION
# ============================================================================
def assess_crop_damage(
    image_paths: List[str],
    field_size_m2: Optional[float] = None,
    farmer_claimed_damage: float = 50.0,
    sum_insured: float = 100000.0
) -> Dict:
    """
    🔥 MAIN FUNCTION - Assess crop damage from images.
    
    Args:
        image_paths: List of image file paths
        field_size_m2: Optional known field size in m²
        farmer_claimed_damage: Damage % claimed by farmer
        sum_insured: Insurance sum insured amount
    
    Returns:
        Complete assessment result
    """
    if not image_paths:
        return {'error': 'No images provided'}
    
    # Analyze each image
    results = []
    coordinates = []
    damage_percentages = []
    damage_types = []
    
    for path in image_paths:
        if not os.path.exists(path):
            continue
        
        # Analyze damage
        analysis = analyze_damage_rgb(path)
        if 'error' not in analysis:
            results.append(analysis)
            damage_percentages.append(analysis['damage_percentage'])
            damage_types.append(analysis['damage_type_code'])
        
        # Extract coordinates
        coords = get_exif_coordinates(path)
        if coords:
            coordinates.append(coords)
    
    if not results:
        return {'error': 'No valid images could be processed'}
    
    # Calculate average damage
    avg_damage = np.mean(damage_percentages)
    
    # Get consensus damage type
    from collections import Counter
    damage_type_code = Counter(damage_types).most_common(1)[0][0]
    damage_type_name = CONFIG.get('DAMAGE_NAMES', {}).get(damage_type_code, 'Unknown')
    
    # Calculate area
    if field_size_m2:
        total_area = field_size_m2
        area_method = 'MANUAL'
    elif len(coordinates) >= 3:
        total_area = calculate_area_from_coordinates(coordinates)
        area_method = 'EXIF_GPS'
    else:
        # Estimate from image count
        total_area = len(results) * CONFIG.get('DEFAULT_IMAGE_COVERAGE_M2', 1500.0)
        area_method = 'ESTIMATED'
    
    damaged_area_m2 = total_area * (avg_damage / 100)
    damaged_area_acres = damaged_area_m2 / 4046.86
    
    # Calculate confidence
    variance = np.std(damage_percentages) if len(damage_percentages) > 1 else 0
    confidence = max(0.3, min(0.95, 1.0 - (variance / 50)))
    
    # Calculate payout
    payout_amount = (avg_damage / 100) * sum_insured
    
    # Make decision
    if confidence >= 0.70:
        claim_decision = 'APPROVE'
        decision_reason = f'High confidence ({confidence:.1%}) - Claim approved'
    elif confidence >= 0.30:
        claim_decision = 'MANUAL_REVIEW'
        decision_reason = f'Moderate confidence ({confidence:.1%}) - Requires manual review'
    else:
        claim_decision = 'REJECT'
        decision_reason = f'Low confidence ({confidence:.1%}) - Insufficient evidence'
    
    return {
        # PRIMARY OUTPUT
        'damage_type': damage_type_name,
        'damage_type_code': damage_type_code,
        'damage_percentage': round(avg_damage, 1),
        'damaged_area_m2': round(damaged_area_m2, 1),
        'damaged_area_acres': round(damaged_area_acres, 4),
        
        # DECISION
        'confidence': round(confidence, 3),
        'claim_decision': claim_decision,
        'decision_reason': decision_reason,
        
        # PAYOUT
        'payout_calculation': {
            'sum_insured': sum_insured,
            'damage_percent': round(avg_damage, 1),
            'payout_amount': round(payout_amount, 2) if claim_decision == 'APPROVE' else 0,
            'currency': 'INR'
        },
        
        # METADATA
        'area_estimation_method': area_method,
        'total_field_area_m2': round(total_area, 1),
        'images_processed': len(results),
        'timestamp': datetime.now().isoformat(),
        
        # PER-IMAGE DETAILS (optional)
        'image_details': results
    }


# ============================================================================
# CLI INTERFACE (for backend server.js to call)
# ============================================================================
def main():
    """
    Command line interface for backend integration.
    
    Usage:
        python main_pipeline.py <image1> <image2> ... [--field-size M2] [--sum-insured AMT] [--claimed-damage PCT]
    
    Example:
        python main_pipeline.py img1.jpg img2.jpg img3.jpg --field-size 5000 --sum-insured 100000 --claimed-damage 50
    """
    if len(sys.argv) < 2:
        print(json.dumps({
            'error': 'Usage: python main_pipeline.py <image1> <image2> ... [options]',
            'options': {
                '--field-size': 'Field size in m²',
                '--sum-insured': 'Sum insured amount',
                '--claimed-damage': 'Farmer claimed damage %'
            }
        }))
        sys.exit(1)
    
    # Parse arguments
    image_paths = []
    field_size = None
    sum_insured = 100000.0
    claimed_damage = 50.0
    
    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]
        
        if arg == '--field-size' and i + 1 < len(sys.argv):
            field_size = float(sys.argv[i + 1])
            i += 2
        elif arg == '--sum-insured' and i + 1 < len(sys.argv):
            sum_insured = float(sys.argv[i + 1])
            i += 2
        elif arg == '--claimed-damage' and i + 1 < len(sys.argv):
            claimed_damage = float(sys.argv[i + 1])
            i += 2
        else:
            image_paths.append(arg)
            i += 1
    
    # Run assessment
    result = assess_crop_damage(
        image_paths=image_paths,
        field_size_m2=field_size,
        farmer_claimed_damage=claimed_damage,
        sum_insured=sum_insured
    )
    
    # Output JSON
    print(json.dumps(result, indent=2))
    sys.stdout.flush()


if __name__ == '__main__':
    main()
