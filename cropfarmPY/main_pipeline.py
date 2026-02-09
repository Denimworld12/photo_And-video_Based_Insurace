#!/usr/bin/env python3
"""
MAIN PIPELINE - Crop Damage Insurance Assessment
=================================================
Single entry point for backend integration.
Uses config.pkl for model configuration.

Output Format:
{
    "damage_assessment": { ... },
    "verification_results": { ... },
    "final_decision": { ... }
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

# Import Verifiers
from modules.weather_verifier import WeatherVerifier
from modules.geolocation_verifier import GeolocationVerifier
from modules.fraud_detector import FraudDetector

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
# EXIF COORDINATE EXTRACTOR
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

def get_exif_timestamp(image_path: str) -> Optional[str]:
    """Extract timestamp from EXIF"""
    try:
        from PIL import Image
        img = Image.open(image_path)
        exif = img._getexif()
        if exif:
            return exif.get(36867) # DateTimeOriginal
    except:
        pass
    return None


# ============================================================================
# MAIN ASSESSMENT FUNCTION
# ============================================================================
def assess_crop_damage(
    image_paths: List[str],
    user_coords: Optional[Dict] = None,
    field_size_m2: Optional[float] = None,
    farmer_claimed_damage: float = 50.0,
    sum_insured: float = 100000.0,
    api_key: Optional[str] = None
) -> Dict:
    """
    🔥 MAIN FUNCTION - Assess crop damage with Multi-Stage Verification.
    """
    if not image_paths:
        return {'error': 'No images provided'}
    
    # Initialize Verifiers
    weather_verifier = WeatherVerifier(api_key)
    geo_verifier = GeolocationVerifier()
    fraud_detector = FraudDetector()

    # 1. Analyze Images & Extract Metadata
    results = []
    coordinates = []
    damage_percentages = []
    damage_types = []
    image_details_for_fraud = []
    
    for path in image_paths:
        if not os.path.exists(path):
            continue
        
        # Analyze damage
        analysis = analyze_damage_rgb(path)
        if 'error' not in analysis:
            results.append(analysis)
            damage_percentages.append(analysis['damage_percentage'])
            damage_types.append(analysis['damage_type_code'])
        
        # Extract metadata
        coords = get_exif_coordinates(path)
        if coords:
            coordinates.append(coords)
            
        ts = get_exif_timestamp(path)
        image_details_for_fraud.append({
            'filename': os.path.basename(path),
            'exif_timestamp': ts,
            'software': '' # Can extract software tag if needed
        })
    
    if not results:
        return {'error': 'No valid images could be processed'}

    # 2. Geolocation Verification
    geo_result = geo_verifier.analyze_coordinate_cluster(coordinates)
    
    # 3. Damage Assessment
    avg_damage = np.mean(damage_percentages)
    from collections import Counter
    damage_type_code = Counter(damage_types).most_common(1)[0][0]
    damage_type_name = CONFIG.get('DAMAGE_NAMES', {}).get(damage_type_code, 'Unknown')
    
    # 4. Weather Verification
    # Use center of image coordinates or user coordinates
    target_coords = geo_result.get('center')
    if not target_coords and user_coords:
        target_coords = user_coords
    
    weather_result = {'status': 'SKIPPED', 'score': 0.5, 'details': ['No coordinates']}
    if target_coords:
        weather_data = weather_verifier.fetch_weather_data(target_coords['lat'], target_coords['lon'])
        weather_result = weather_verifier.verify_damage_correlation(weather_data, damage_type_code)

    # 5. Fraud Detection
    # TODO: Pass Exif software data
    exif_fraud_result = fraud_detector.verify_exif_timestamps(image_details_for_fraud, datetime.now())
    
    # 6. Final Fraud Risk Calculation
    fraud_risk = fraud_detector.calculate_fraud_risk(
        weather_score=weather_result.get('confidence_score', 0.5),
        geolocation_score=geo_result.get('score', 0.5),
        exif_score=exif_fraud_result.get('score', 0.5),
        tampering_score=1.0 # Placeholder
    )

    # 7. Area Calculation
    if field_size_m2:
        total_area = field_size_m2
        area_method = 'MANUAL'
    elif geo_result.get('max_spread_km', 0) > 0.05: # Use coordinate spread if significant
        # Simplified: area of bounding box of coordinates
        # Taking max spread as diagonal of a square
        spread_m = geo_result['max_spread_km'] * 1000
        total_area = (spread_m * spread_m) / 2 # Very rough estimate
        area_method = 'GPS_SPREAD' 
    else:
        # Estimate from image count
        total_area = len(results) * CONFIG.get('DEFAULT_IMAGE_COVERAGE_M2', 1500.0)
        area_method = 'ESTIMATED'
    
    damaged_area_m2 = total_area * (avg_damage / 100)
    
    # 8. Final Decision Logic
    verified_confidence = (
        (geo_result.get('score', 0.5) * 0.4) +
        (weather_result.get('confidence_score', 0.5) * 0.4) +
        (1.0 - fraud_risk.get('risk_score', 0.5)) * 0.2
    )

    if fraud_risk.get('auto_reject'):
        claim_decision = 'REJECT'
        decision_reason = f"High Fraud Risk ({fraud_risk['risk_score']}) - Auto Rejected"
    elif verified_confidence >= 0.75:
        claim_decision = 'APPROVE'
        decision_reason = f"High Verification Score ({verified_confidence:.2f}) - Approved"
    elif verified_confidence >= 0.40:
        claim_decision = 'MANUAL_REVIEW'
        decision_reason = f"Moderate Verification Score ({verified_confidence:.2f}) - Manual Review Required"
    else:
        claim_decision = 'REJECT'
        decision_reason = f"Low Verification Score ({verified_confidence:.2f}) - Rejected"

    payout = (avg_damage / 100) * sum_insured if claim_decision == 'APPROVE' else 0

    return {
        # CORE OUTPUT
        'damage_type': damage_type_name,
        'damage_type_code': damage_type_code,
        'damage_percentage': round(avg_damage, 1),
        'damaged_area_m2': round(damaged_area_m2, 1),
        
        # VERIFICATION RESULTS
        'verification_results': {
            'geolocation': geo_result,
            'weather': weather_result,
            'fraud_risk': fraud_risk,
            'exif': exif_fraud_result
        },
        
        # DECISION
        'overall_assessment': {
            'final_decision': claim_decision,
            'confidence_score': round(verified_confidence, 2),
            'risk_level': fraud_risk['risk_level'],
            'manual_review_required': claim_decision == 'MANUAL_REVIEW',
            'decision_reason': decision_reason
        },
        
        # PAYOUT
        'payout_calculation': {
            'sum_insured': sum_insured,
            'damage_percent': round(avg_damage, 1),
            'payout_amount': round(payout, 2),
            'currency': 'INR'
        },
        
        # METADATA
        'area_info': {
            'total_field_area_m2': round(total_area, 1),
            'estimation_method': area_method
        },
        'images_processed': len(results),
        'timestamp': datetime.now().isoformat()
    }


# ============================================================================
# CLI INTERFACE
# ============================================================================
def main():
    if len(sys.argv) < 2:
        # Print usage to stderr so it doesn't parse as invalid JSON
        print(json.dumps({'error': 'Usage: python main_pipeline.py <images> [options]'}), file=sys.stderr)
        sys.exit(1)
    
    try:
        # Parse arguments
        image_paths = []
        field_size = None
        sum_insured = 100000.0
        claimed_damage = 50.0
        user_lat = None
        user_lon = None
        api_key = None
        
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
            elif arg == '--user-lat' and i + 1 < len(sys.argv):
                user_lat = float(sys.argv[i + 1])
                i += 2
            elif arg == '--user-lon' and i + 1 < len(sys.argv):
                user_lon = float(sys.argv[i + 1])
                i += 2
            elif arg == '--api-key' and i + 1 < len(sys.argv):
                api_key = sys.argv[i + 1]
                i += 2
            else:
                image_paths.append(arg)
                i += 1
        
        user_coords = {'lat': user_lat, 'lon': user_lon} if user_lat is not None and user_lon is not None else None

        result = assess_crop_damage(
            image_paths=image_paths,
            user_coords=user_coords,
            field_size_m2=field_size,
            farmer_claimed_damage=claimed_damage,
            sum_insured=sum_insured,
            api_key=api_key
        )
        
        print(json.dumps(result, indent=2))
        sys.stdout.flush()

    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
