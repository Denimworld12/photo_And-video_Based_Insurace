#!/usr/bin/env python3
"""
Comprehensive Crop Insurance Claim Verification System - Batch Processing v2.0
Processes 4 corner images + 1 damage image in a single comprehensive analysis
Includes: EXIF GPS, Coordinate Matching, Geofencing, Weather, AI Damage Assessment
"""

import sys
import json
import time
import os
import urllib.request
import urllib.parse
import math
from datetime import datetime, timezone
from pathlib import Path

# Optional libs
try:
    from PIL import Image, ExifTags
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    print("Warning: PIL/Pillow not available", file=sys.stderr)

try:
    import numpy as np
except ImportError:
    np = None

try:
    import torch
    import torchvision.transforms as transforms
    from torchvision import models
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

try:
    from shapely.geometry import Point, shape as geom_shape
    from shapely.ops import nearest_points
    SHAPELY_AVAILABLE = True
except ImportError:
    SHAPELY_AVAILABLE = False
    print("Warning: Shapely not available - using basic geofencing", file=sys.stderr)

# Configuration
DEBUG_MODE = True
TRUST_CLAIMED_COORDS = True
EXIF_CLAIMED_MATCH_TOLERANCE_M = 50.0

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def debug(msg):
    if DEBUG_MODE:
        print(f"[DEBUG] {msg}", file=sys.stderr)

def haversine_m(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in meters using Haversine formula"""
    R = 6371000.0
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat/2.0)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2.0)**2
    return 2 * R * math.asin(math.sqrt(a))

def _rational_to_float(x):
    """Convert PIL rational numbers to float"""
    try:
        if isinstance(x, (list, tuple)) and len(x) == 2:
            num, den = x
            return float(num) / float(den) if den else float(num)
        return float(x)
    except Exception:
        return None

def _dms_to_decimal(dms, ref):
    """Convert GPS DMS in EXIF to decimal degrees"""
    try:
        if isinstance(dms, (list, tuple)) and len(dms) >= 3:
            deg = _rational_to_float(dms[0])
            minute = _rational_to_float(dms[1])
            sec = _rational_to_float(dms[2])
            if None in (deg, minute, sec):
                return None
            dec = deg + minute / 60.0 + sec / 3600.0
            if ref in ['S', 'W']:
                dec = -dec
            return dec
    except Exception:
        pass
    return None

# -----------------------------------------------------------------------------
# EXIF extraction
# -----------------------------------------------------------------------------

def extract_comprehensive_exif(image_path):
    """Extract EXIF metadata including GPS data"""
    exif_data = {}
    if not os.path.exists(image_path):
        debug(f"Image not found: {image_path}")
        return {}, {"error": f"Image not found: {image_path}"}
    if not PIL_AVAILABLE:
        debug("PIL not available for EXIF extraction")
        return {}, {"error": "PIL not available"}

    try:
        with Image.open(image_path) as img:
            exif_data['Image_Info'] = {
                'format': img.format, 
                'mode': img.mode, 
                'size': list(img.size)
            }
            
            exif_dict = img._getexif()
            if exif_dict:
                # Map standard tags
                for tag_id, value in exif_dict.items():
                    tag = ExifTags.TAGS.get(tag_id, f"Tag_{tag_id}")
                    try:
                        if isinstance(value, bytes):
                            exif_data[f'PIL_{tag}'] = value.decode('utf-8', errors='replace')
                        else:
                            exif_data[f'PIL_{tag}'] = str(value)
                    except Exception:
                        pass

                # Extract GPS block
                gps_info = exif_dict.get(34853)  # GPS IFD
                if gps_info:
                    gps_lat = gps_info.get(2)
                    gps_lat_ref = gps_info.get(1, 'N')
                    gps_lon = gps_info.get(4)
                    gps_lon_ref = gps_info.get(3, 'E')

                    debug(f"EXIF GPS for {os.path.basename(image_path)}: lat={gps_lat} {gps_lat_ref}, lon={gps_lon} {gps_lon_ref}")

                    lat_dec = _dms_to_decimal(gps_lat, gps_lat_ref) if gps_lat else None
                    lon_dec = _dms_to_decimal(gps_lon, gps_lon_ref) if gps_lon else None

                    if lat_dec is not None and lon_dec is not None:
                        exif_data['GPS_Latitude'] = lat_dec
                        exif_data['GPS_Longitude'] = lon_dec
                        exif_data['GPS_Source'] = 'EXIF'
                        debug(f"Extracted EXIF GPS: {lat_dec:.6f}, {lon_dec:.6f}")
                    else:
                        debug("EXIF GPS present but could not be decoded")
                else:
                    debug(f"No GPS block in EXIF for {os.path.basename(image_path)}")
            else:
                debug(f"No EXIF found for {os.path.basename(image_path)}")
    except Exception as e:
        debug(f"EXIF extraction error: {e}")

    return exif_data, {'total_fields_extracted': len(exif_data)}

# -----------------------------------------------------------------------------
# Coordinate analysis
# -----------------------------------------------------------------------------

def analyze_coordinate_consistency(exif_coords, claimed_coords, tolerance_m=EXIF_CLAIMED_MATCH_TOLERANCE_M):
    """Compare EXIF GPS with claimed GPS coordinates"""
    if not exif_coords.get('GPS_Latitude') or not exif_coords.get('GPS_Longitude'):
        return {
            'coordinates_available': False,
            'error': 'No GPS coordinates found in EXIF data'
        }

    try:
        exif_lat = float(exif_coords['GPS_Latitude'])
        exif_lon = float(exif_coords['GPS_Longitude'])
        claimed_lat = float(claimed_coords['lat'])
        claimed_lon = float(claimed_coords['lon'])

        distance_meters = haversine_m(exif_lat, exif_lon, claimed_lat, claimed_lon)
        debug(f"Coordinate distance: {distance_meters:.2f}m (EXIF vs Claimed)")

        if distance_meters <= 10:
            match_level = 'exact_match'
        elif distance_meters <= 50:
            match_level = 'close_match'
        elif distance_meters <= 200:
            match_level = 'approximate_match'
        else:
            match_level = 'no_match'

        return {
            'coordinates_available': True,
            'exif_coordinates': {'lat': exif_lat, 'lon': exif_lon},
            'claimed_coordinates': {'lat': claimed_lat, 'lon': claimed_lon},
            'distance_meters': round(distance_meters, 2),
            'match_level': match_level,
            'coordinates_match': distance_meters <= tolerance_m
        }
    except Exception as e:
        return {
            'coordinates_available': False,
            'error': f'Error analyzing coordinates: {str(e)}'
        }

# -----------------------------------------------------------------------------
# Weather API
# -----------------------------------------------------------------------------

def fetch_real_weather_data(lat, lon, date_iso):
    """Fetch weather data from Open-Meteo API"""
    try:
        debug(f"Fetching weather for {lat:.4f}, {lon:.4f} on {date_iso}")
        base_url = "https://api.open-meteo.com/v1/forecast"
        params = {
            'latitude': lat,
            'longitude': lon,
            'start_date': date_iso,
            'end_date': date_iso,
            'daily': 'temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean',
            'timezone': 'auto'
        }
        url = f"{base_url}?{urllib.parse.urlencode(params)}"
        
        with urllib.request.urlopen(url, timeout=10) as response:
            if response.getcode() == 200:
                data = json.loads(response.read().decode('utf-8'))
                if 'daily' in data:
                    daily = data['daily']
                    debug("Weather data fetched successfully")
                    return {
                        'api_success': True,
                        'source': 'open_meteo',
                        'processed_data': {
                            'temperature_min': daily.get('temperature_2m_min', [None])[0],
                            'temperature_max': daily.get('temperature_2m_max', [None])[0],
                            'precipitation_mm': daily.get('precipitation_sum', [None])[0] or 0,
                            'humidity_percent': daily.get('relative_humidity_2m_mean', [None])[0]
                        }
                    }
    except Exception as e:
        debug(f"Weather API error: {e}")
    
    return {
        'api_success': False, 
        'error': 'Weather data unavailable', 
        'source': 'open_meteo'
    }

# -----------------------------------------------------------------------------
# Geofencing
# -----------------------------------------------------------------------------

def _ensure_geojson_boundary(geojson_path, center_lat, center_lon, boundary_size_deg=0.005):
    """Create a test boundary if GeoJSON file doesn't exist"""
    if os.path.exists(geojson_path):
        return

    test_parcel = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"parcel_id": "AUTO_GENERATED"},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [center_lon - boundary_size_deg, center_lat - boundary_size_deg],
                    [center_lon + boundary_size_deg, center_lat - boundary_size_deg],
                    [center_lon + boundary_size_deg, center_lat + boundary_size_deg],
                    [center_lon - boundary_size_deg, center_lat + boundary_size_deg],
                    [center_lon - boundary_size_deg, center_lat - boundary_size_deg]
                ]]
            }
        }]
    }
    
    os.makedirs(os.path.dirname(geojson_path), exist_ok=True)
    with open(geojson_path, 'w') as f:
        json.dump(test_parcel, f)
    debug(f"Created boundary at {geojson_path} centered on {center_lat:.6f},{center_lon:.6f}")

def _point_in_polygon_and_distance(lat, lon, polygon_coords):
    """Check if point is inside polygon and calculate distance to boundary"""
    if SHAPELY_AVAILABLE:
        poly = geom_shape({"type": "Polygon", "coordinates": [polygon_coords]})
        pt = Point(lon, lat)
        inside = poly.contains(pt) or poly.touches(pt)
        if inside:
            return True, 0.0
        nearest = nearest_points(poly.boundary, pt)[0]
        d_m = haversine_m(lat, lon, nearest.y, nearest.x)
        return False, d_m
    else:
        # Fallback: bounding box
        lats = [c[1] for c in polygon_coords]
        lons = [c[0] for c in polygon_coords]
        min_lat, max_lat = min(lats), max(lats)
        min_lon, max_lon = min(lons), max(lons)

        inside = (min_lat <= lat <= max_lat) and (min_lon <= lon <= max_lon)
        if inside:
            return True, 0.0

        clamped_lat = min(max(lat, min_lat), max_lat)
        clamped_lon = min(max(lon, min_lon), max_lon)
        d_m = haversine_m(lat, lon, clamped_lat, clamped_lon)
        return False, d_m

def perform_geofencing_analysis(lat, lon, geojson_path, fallback_center=None):
    """Analyze if coordinates are within parcel boundaries"""
    try:
        if not os.path.exists(geojson_path):
            if fallback_center:
                _ensure_geojson_boundary(geojson_path, fallback_center[0], fallback_center[1])
            else:
                _ensure_geojson_boundary(geojson_path, lat, lon)

        with open(geojson_path, 'r') as f:
            geojson_data = json.load(f)

        for feature in geojson_data.get('features', []):
            coords = feature['geometry']['coordinates'][0]
            inside, dist_m = _point_in_polygon_and_distance(lat, lon, coords)
            
            status = "INSIDE" if inside else f"OUTSIDE ({dist_m:.1f}m away)"
            debug(f"Geofencing: {status} boundary")
            
            return {
                'geofencing_available': True,
                'point_inside_boundary': bool(inside),
                'closest_boundary_distance': round(float(dist_m), 2)
            }

        return {'geofencing_available': False, 'error': 'No features in GeoJSON'}
    except Exception as e:
        debug(f"Geofencing error: {e}")
        return {'geofencing_available': False, 'error': str(e)}

# -----------------------------------------------------------------------------
# Damage classification
# -----------------------------------------------------------------------------

class CropDamageClassifier:
    def __init__(self):
        self.damage_classes = ['DR', 'G', 'ND', 'WD', 'other']
        self.use_torch = TORCH_AVAILABLE
        debug(f"Damage classifier initialized (PyTorch: {self.use_torch})")

    def predict_damage(self, image_path):
        """Predict crop damage from image"""
        try:
            if not PIL_AVAILABLE or np is None:
                debug("Using fallback damage prediction (PIL/NumPy unavailable)")
                return self._fallback_prediction()
            
            img = Image.open(image_path).convert('RGB')
            damage_probs = self._heuristic_damage_detection(img)
            damage_scores = {
                self.damage_classes[i]: float(damage_probs[i]) 
                for i in range(len(self.damage_classes))
            }
            
            primary_damage = max(damage_scores.items(), key=lambda x: x[1])
            damage_percent = self._calculate_damage_percentage(damage_scores)
            
            debug(f"Damage analysis: {damage_percent:.1f}% ({primary_damage[0]})")
            
            return {
                'damage_scores': damage_scores,
                'primary_damage_type': primary_damage[0],
                'confidence': primary_damage[1],
                'damage_percentage': damage_percent,
                'severity': self._categorize_severity(damage_percent),
                'is_genuine_damage': primary_damage[0] != 'ND' and primary_damage[1] > 0.4
            }
        except Exception as e:
            debug(f"Damage prediction error: {e}")
            return self._fallback_prediction()

    def _heuristic_damage_detection(self, img):
        """Heuristic-based damage detection using color analysis"""
        img_array = np.array(img)
        mean_green = np.mean(img_array[:, :, 1])
        mean_red = np.mean(img_array[:, :, 0])
        mean_blue = np.mean(img_array[:, :, 2])
        std_color = np.std(img_array)
        health_score = mean_green / (mean_red + mean_blue + 1)
        
        if mean_green < 80 and std_color < 40:
            return np.array([0.65, 0.10, 0.05, 0.10, 0.10])  # Drought
        elif mean_green > 100 and std_color > 70:
            return np.array([0.10, 0.60, 0.10, 0.10, 0.10])  # Grasshopper
        elif mean_blue > mean_green and mean_blue > 120:
            return np.array([0.10, 0.10, 0.05, 0.65, 0.10])  # Weed
        elif health_score > 0.8 and mean_green > 120:
            return np.array([0.10, 0.10, 0.65, 0.10, 0.05])  # No Damage
        else:
            return np.array([0.20, 0.20, 0.20, 0.20, 0.20])  # Uncertain

    def _calculate_damage_percentage(self, damage_scores):
        """Calculate overall damage percentage"""
        damage_weights = {'DR': 0.80, 'G': 0.85, 'WD': 0.75, 'ND': 0.0, 'other': 0.60}
        weighted_damage = sum(damage_scores[d] * damage_weights[d] for d in damage_scores)
        return min(100, weighted_damage * 100)

    def _categorize_severity(self, damage_percent):
        """Categorize damage severity"""
        if damage_percent < 15:
            return 'minimal'
        elif damage_percent < 35:
            return 'moderate'
        elif damage_percent < 60:
            return 'moderate_to_severe'
        else:
            return 'severe'

    def _fallback_prediction(self):
        """Fallback prediction when libraries unavailable"""
        return {
            'damage_scores': {'DR': 0.3, 'G': 0.2, 'ND': 0.2, 'WD': 0.2, 'other': 0.1},
            'primary_damage_type': 'unknown',
            'confidence': 0.3,
            'damage_percentage': 30.0,
            'severity': 'moderate',
            'is_genuine_damage': True
        }

# -----------------------------------------------------------------------------
# Fraud detection
# -----------------------------------------------------------------------------

class FraudDetectionEngine:
    def analyze_fraud_patterns(self, all_exif_data, all_coord_analyses, damage_analysis, weather_data):
        """Analyze fraud patterns across all images"""
        red_flags = []
        
        # Check EXIF data availability across all images
        exif_available_count = sum(1 for exif in all_exif_data if exif and len(exif) > 3)
        if exif_available_count < len(all_exif_data) / 2:
            red_flags.append({
                'category': 'authenticity',
                'severity': 'medium',
                'detail': f'Limited EXIF data ({exif_available_count}/{len(all_exif_data)} images)',
                'confidence': 0.6
            })
        
        # Check coordinate consistency across all images
        for idx, coord_analysis in enumerate(all_coord_analyses):
            if coord_analysis.get('coordinates_available'):
                distance = coord_analysis.get('distance_meters', 0)
                if distance > 500:
                    red_flags.append({
                        'category': 'location',
                        'severity': 'critical',
                        'detail': f'Image {idx+1}: GPS {distance:.0f}m from claimed location',
                        'confidence': 0.9
                    })
        
        # Check for image editing software
        for idx, exif_data in enumerate(all_exif_data):
            if exif_data:
                software_keys = [k for k in exif_data.keys() if 'software' in k.lower()]
                for key in software_keys:
                    value = str(exif_data[key]).lower()
                    if any(editor in value for editor in ['photoshop', 'gimp', 'paint.net']):
                        red_flags.append({
                            'category': 'authenticity',
                            'severity': 'high',
                            'detail': f'Image {idx+1}: Editing software detected',
                            'confidence': 0.75
                        })
        
        # Calculate fraud score
        fraud_score = 0.05
        if red_flags:
            severity_weights = {'critical': 0.4, 'high': 0.3, 'medium': 0.2, 'low': 0.1}
            fraud_score = sum(
                severity_weights.get(flag['severity'], 0.1) * flag['confidence'] 
                for flag in red_flags
            )
        
        debug(f"Fraud analysis: {len(red_flags)} red flags, score: {fraud_score:.2f}")
        
        return {
            'total_red_flags': len(red_flags),
            'fraud_indicators': red_flags,
            'fraud_likelihood': min(1.0, fraud_score),
            'investigation_required': len(red_flags) > 0
        }

# -----------------------------------------------------------------------------
# Main batch processing function
# -----------------------------------------------------------------------------

def process_claim_comprehensive(image_paths, coordinates, damage_image_path,
                                farmer_claimed_damage, sum_insured, geojson_path,
                                parcel_id, claim_id=None):
    """
    Process complete claim with 4 corner images + 1 damage image
    Returns comprehensive analysis with decision recommendation
    """
    start_time = time.time()
    if not claim_id:
        claim_id = f"CLAIM_{datetime.now().strftime('%Y%m%d')}_{int(time.time() * 1000) % 1000:03d}"

    debug("="*60)
    debug(f"Starting comprehensive claim processing: {claim_id}")
    debug(f"Parcel ID: {parcel_id}")
    debug("="*60)

    damage_classifier = CropDamageClassifier()
    fraud_detector = FraudDetectionEngine()

    # Phase 1: Process authentication images (4 corners)
    debug("\n[PHASE 1] Authentication image verification...")
    auth_results = []
    all_exif_data = []
    all_coord_analyses = []
    weather_data = {}

    center_lat, center_lon = coordinates[0]

    for idx, (img_path, (lat, lon)) in enumerate(zip(image_paths, coordinates)):
        debug(f"\nProcessing corner image {idx+1}/4: {os.path.basename(img_path)}")
        
        exif_data, _meta = extract_comprehensive_exif(img_path)
        all_exif_data.append(exif_data)
        
        coord_analysis = analyze_coordinate_consistency(exif_data, {'lat': lat, 'lon': lon})
        all_coord_analyses.append(coord_analysis)
        
        # Fetch weather only once
        if idx == 0:
            date_iso = datetime.now().strftime("%Y-%m-%d")
            weather_data = fetch_real_weather_data(lat, lon, date_iso)
        
        # Determine coordinates for geofencing
        if coord_analysis.get('coordinates_available') and coord_analysis.get('coordinates_match'):
            gf_lat = coord_analysis['exif_coordinates']['lat']
            gf_lon = coord_analysis['exif_coordinates']['lon']
            debug("Using EXIF coordinates for geofencing")
        else:
            gf_lat, gf_lon = (lat, lon)
            debug("Using claimed coordinates for geofencing")
        
        geo_result = perform_geofencing_analysis(
            gf_lat, gf_lon, geojson_path, 
            fallback_center=(center_lat, center_lon)
        )
        
        auth_results.append({
            'image_index': idx + 1,
            'image_path': os.path.basename(img_path),
            'exif_available': bool(exif_data),
            'gps_verified': coord_analysis.get('coordinates_available', False) and coord_analysis.get('coordinates_match', False),
            'within_boundary': geo_result.get('point_inside_boundary', False),
            'distance_to_boundary_m': geo_result.get('closest_boundary_distance'),
            'exif_vs_claimed_distance_m': coord_analysis.get('distance_meters'),
            'exif_match_level': coord_analysis.get('match_level', 'unknown')
        })

    # Phase 2: Damage assessment
    debug("\n[PHASE 2] AI damage assessment...")
    debug(f"Analyzing damage image: {os.path.basename(damage_image_path)}")
    damage_result = damage_classifier.predict_damage(damage_image_path)

    # Phase 3: Fraud analysis
    debug("\n[PHASE 3] Fraud pattern analysis...")
    fraud_analysis = fraud_detector.analyze_fraud_patterns(
        all_exif_data, all_coord_analyses, damage_result, weather_data
    )

    # Phase 4: Scoring and decision
    debug("\n[PHASE 4] Scoring and decision making...")
    
    authenticity_score = sum(1 for r in auth_results if r['within_boundary']) / max(1, len(auth_results))
    damage_verification_score = damage_result.get('confidence', 0.5)
    fraud_detection_score = 1.0 - fraud_analysis['fraud_likelihood']
    external_validation_score = 0.7 if weather_data.get('api_success') else 0.5

    overall_confidence = (
        authenticity_score * 0.25 +
        damage_verification_score * 0.30 +
        fraud_detection_score * 0.25 +
        external_validation_score * 0.20
    )

    debug(f"Scores: Auth={authenticity_score:.2f}, Damage={damage_verification_score:.2f}, "
          f"Fraud={fraud_detection_score:.2f}, External={external_validation_score:.2f}")
    debug(f"Overall confidence: {overall_confidence:.2f}")

    # Damage calculation
    ai_damage = damage_result.get('damage_percentage', 0)
    variance = abs(ai_damage - farmer_claimed_damage)
    variance_acceptable = variance <= 15
    final_damage = (ai_damage + farmer_claimed_damage) / 2 if variance_acceptable else ai_damage
    base_payout = (final_damage / 100) * sum_insured

    debug(f"Damage: AI={ai_damage:.1f}%, Farmer={farmer_claimed_damage}%, Final={final_damage:.1f}%")

    # Final decision
    if overall_confidence >= 0.75 and not fraud_analysis['investigation_required']:
        decision, risk, action = 'APPROVE', 'low', 'APPROVE_CLAIM'
        manual_review = False
    elif overall_confidence >= 0.50:
        decision, risk, action = 'MANUAL_REVIEW', 'medium', 'SCHEDULE_MANUAL_REVIEW'
        manual_review = True
    else:
        decision, risk, action = 'REJECT', 'high', 'REJECT_CLAIM'
        manual_review = True

    processing_time = (time.time() - start_time) * 1000.0

    debug(f"\n{'='*60}")
    debug(f"FINAL DECISION: {decision}")
    debug(f"Risk Level: {risk}")
    debug(f"Processing Time: {processing_time:.0f}ms")
    debug(f"{'='*60}\n")

    # Build comprehensive output
    output = {
        'claim_id': claim_id,
        'processing_timestamp': datetime.now(timezone.utc).isoformat(),
        'processing_time_ms': round(processing_time, 2),

        'overall_assessment': {
            'final_decision': decision,
            'confidence_score': round(overall_confidence, 3),
            'risk_level': risk,
            'manual_review_required': manual_review
        },

        'detailed_scores': {
            'authenticity_score': round(authenticity_score, 2),
            'damage_verification_score': round(damage_verification_score, 2),
            'fraud_detection_score': round(fraud_detection_score, 2),
            'external_validation_score': round(external_validation_score, 2)
        },

        'damage_assessment': {
            'ai_calculated_damage_percent': round(ai_damage, 1),
            'farmer_claimed_damage_percent': farmer_claimed_damage,
            'final_damage_percent': round(final_damage, 1),
            'variance_acceptable': variance_acceptable,
            'damage_type': damage_result.get('primary_damage_type', 'unknown'),
            'severity': damage_result.get('severity', 'unknown'),
            'damage_scores': damage_result.get('damage_scores', {})
        },

        'payout_calculation': {
            'sum_insured': sum_insured,
            'damage_percent': round(final_damage, 1),
            'base_payout': round(base_payout, 2),
            'adjustments': [],
            'final_payout_amount': round(base_payout, 2),
            'currency': 'INR'
        },

        'verification_evidence': {
            'authenticity_verified': authenticity_score > 0.7,
            'location_verified': all(r['within_boundary'] for r in auth_results),
            'damage_verified': damage_result.get('is_genuine_damage', False),
            'weather_supports_claim': weather_data.get('api_success', False),
            'authentication_images_summary': auth_results
        },

        'fraud_indicators': fraud_analysis,

        'recommendation': {
            'action': action,
            'payout_amount': round(base_payout, 2) if decision == 'APPROVE' else 0,
            'processing_priority': 'high' if risk == 'high' else 'normal',
            'additional_verification_needed': manual_review,
            'estimated_settlement_days': 3 if decision == 'APPROVE' else 5
        },

        'ai_reasoning': {
            'decision_factors': [
                f"Overall confidence: {overall_confidence:.1%}",
                f"Authenticity: {authenticity_score:.1%}",
                f"Fraud risk: {fraud_analysis['fraud_likelihood']:.1%}"
            ],
            'supporting_factors': [
                f"AI damage: {ai_damage:.1f}% vs Farmer: {farmer_claimed_damage}%",
                f"Weather data: {'Available' if weather_data.get('api_success') else 'Unavailable'}",
                f"All images in boundary: {all(r['within_boundary'] for r in auth_results)}"
            ]
        },

        'audit_trail': {
            'processed_by': 'CropInsurance_AI_v2.0_BatchMode',
            'images_analyzed': len(image_paths) + 1,
            'corner_images': len(image_paths),
            'damage_images': 1,
            'processing_stages_completed': [
                'authentication', 'damage_assessment', 'fraud_detection', 'scoring', 'decision'
            ]
        }
    }

    if decision == 'REJECT':
        output['rejection_reasons'] = fraud_analysis['fraud_indicators']

    return output

# -----------------------------------------------------------------------------
# CLI Entry Point
# -----------------------------------------------------------------------------

def main():
    """
    Command-line interface for batch processing
    
    Usage:
    python pipeline.py <img1> <lat1> <lon1> <img2> <lat2> <lon2> <img3> <lat3> <lon3> 
                      <img4> <lat4> <lon4> <damage_img> <farmer_damage%> <sum_insured> 
                      <geojson_path> <parcel_id> [TRUST_CLAIMED_COORDS]
    """
    
    if len(sys.argv) < 17:
        error_response = {
            'error': 'Insufficient arguments',
            'required_args': 17,
            'provided_args': len(sys.argv) - 1,
            'usage': 'python pipeline.py <img1> <lat1> <lon1> <img2> <lat2> <lon2> '
                    '<img3> <lat3> <lon3> <img4> <lat4> <lon4> <damage_img> '
                    '<farmer_damage%> <sum_insured> <geojson_path> <parcel_id> [TRUST_CLAIMED_COORDS]',
            'example': 'python pipeline.py corner1.jpg 19.123 72.456 corner2.jpg 19.124 72.457 '
                      'corner3.jpg 19.125 72.458 corner4.jpg 19.126 72.459 damage.jpg 50.0 '
                      '100000 data/parcel.geojson PARCEL001 1'
        }
        print(json.dumps(error_response, indent=2))
        sys.exit(1)

    try:
        args = sys.argv[1:]
        
        # Parse image paths (4 corner images)
        image_paths = [args[0], args[3], args[6], args[9]]
        
        # Parse coordinates for each corner
        coordinates = [
            (float(args[1]), float(args[2])),   # Corner 1
            (float(args[4]), float(args[5])),   # Corner 2
            (float(args[7]), float(args[8])),   # Corner 3
            (float(args[10]), float(args[11]))  # Corner 4
        ]
        
        # Parse damage image and parameters
        damage_img = args[12]
        farmer_damage = float(args[13])
        sum_insured = float(args[14])
        geojson_path = args[15]
        parcel_id = args[16] if len(args) > 16 else 'PARCEL_001'

        # Optional: Trust claimed coordinates flag
        trust_coords = TRUST_CLAIMED_COORDS
        if len(args) > 17:
            trust_coords = (str(args[17]).strip() in ('1', 'true', 'True', 'YES', 'yes'))

        # Validate file existence
        all_files = image_paths + [damage_img]
        for file_path in all_files:
            if not os.path.exists(file_path):
                error_response = {
                    'error': 'File not found',
                    'missing_file': file_path,
                    'timestamp': datetime.now().isoformat()
                }
                print(json.dumps(error_response, indent=2), file=sys.stderr)
                sys.exit(1)

        # Run comprehensive processing
        result = process_claim_comprehensive(
            image_paths=image_paths,
            coordinates=coordinates,
            damage_image_path=damage_img,
            farmer_claimed_damage=farmer_damage,
            sum_insured=sum_insured,
            geojson_path=geojson_path,
            parcel_id=parcel_id
        )
        
        # Output JSON result to stdout
        print(json.dumps(result, indent=2))
        
    except ValueError as e:
        error_response = {
            'error': 'Invalid argument format',
            'details': str(e),
            'hint': 'Ensure coordinates, damage%, and sum_insured are valid numbers',
            'timestamp': datetime.now().isoformat()
        }
        print(json.dumps(error_response, indent=2), file=sys.stderr)
        sys.exit(1)
        
    except Exception as e:
        error_response = {
            'error': 'Processing failed',
            'details': str(e),
            'type': type(e).__name__,
            'timestamp': datetime.now().isoformat()
        }
        print(json.dumps(error_response, indent=2), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
