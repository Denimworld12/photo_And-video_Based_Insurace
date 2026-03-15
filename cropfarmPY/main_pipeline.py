#!/usr/bin/env python3
"""
MAIN PIPELINE v2 — Crop Damage Insurance Assessment
=====================================================
Single entry point for backend integration.

v2 Changes:
  - CNN classifier integration (hybrid CNN + RGB scoring)
  - GradCAM heatmap generation for explainability
  - Temporal context (sowing_date → DAS / DOY)
  - GradCAM-based area calculation
  - Backward compatible (falls back to RGB-only if no model)

Output Format:
{
    "damage_type": "...",
    "damage_percentage": ...,
    "verification_results": { ... },
    "overall_assessment": { ... },
    "cnn_classification": { ... },
    "temporal_context": { ... },
    "gradcam_heatmaps": [ ... ],
    ...
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

# Import CNN classifier + GradCAM + Temporal
from modules.crop_damage_insurance import (
    CropDamageClassifier,
    InsuranceFieldAnalyzer,
    GradCAMGenerator,
    TemporalPredictor,
    RGBDamageAnalyzer,
    Config as MLConfig,
)

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
            'other': 'Other Damage',
        },
        'CGIAR_TO_PBI': {
            'DR': 'drought',
            'G': 'healthy',
            'ND': 'disease',
            'WD': 'pest',
            'other': 'other',
        },
        'DEFAULT_IMAGE_COVERAGE_M2': 1500.0,
    }

CONFIG = load_config()


# ============================================================================
# MODEL SINGLETON (lazy-loaded)
# ============================================================================
_classifier_instance = None
_gradcam_instance = None

def _get_model_path():
    """Find the trained model file."""
    candidates = [
        os.path.join(os.path.dirname(__file__), 'models', 'classifier_model.pth'),
        os.path.join(os.path.dirname(__file__), 'classifier_model.pth'),
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None

def _get_classifier():
    """Lazy-load the CNN classifier singleton."""
    global _classifier_instance, _gradcam_instance
    if _classifier_instance is not None:
        return _classifier_instance, _gradcam_instance

    model_path = _get_model_path()
    if model_path is None:
        print("[MODEL] No trained model found — using RGB-only mode", file=sys.stderr)
        return None, None

    try:
        import torch
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        model = CropDamageClassifier().to(device)
        model.load_state_dict(
            torch.load(model_path, map_location=device, weights_only=True))
        model.eval()
        _classifier_instance = model

        try:
            _gradcam_instance = GradCAMGenerator(model, device)
        except Exception as e:
            print(f"[MODEL] GradCAM init failed: {e}", file=sys.stderr)
            _gradcam_instance = None

        print(f"[MODEL] Loaded classifier from {model_path}", file=sys.stderr)
    except Exception as e:
        print(f"[MODEL] Failed to load classifier: {e}", file=sys.stderr)
        _classifier_instance = None
        _gradcam_instance = None

    return _classifier_instance, _gradcam_instance


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
        damage_type_code = 'G'
    elif avg_exr > 0.15:
        damage_type_code = 'DR'
    elif avg_exg < -0.1:
        damage_type_code = 'ND'
    elif 0 < avg_exg < 0.1 and avg_exr > 0.05:
        damage_type_code = 'WD'
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
        'image_size': list(img.shape[:2]),
    }


# ============================================================================
# CNN DAMAGE ANALYZER
# ============================================================================
def analyze_damage_cnn(image_path: str, classifier, gradcam,
                       heatmap_dir: str = None) -> Dict:
    """
    Analyze crop damage using the CNN classifier + GradCAM.
    Returns damage type, confidence, and GradCAM damage ratio.
    """
    if classifier is None:
        return {
            'damage_type_code': 'unknown',
            'confidence': 0.0,
            'damage_ratio': 0.0,
            'source': 'none',
            'heatmap_path': None,
        }

    try:
        import torch
        from torchvision import transforms
        from PIL import Image

        device = next(classifier.parameters()).device

        transform = transforms.Compose([
            transforms.Resize((MLConfig.IMG_SIZE, MLConfig.IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])

        img = Image.open(image_path).convert('RGB')
        img_tensor = transform(img).unsqueeze(0).to(device)

        with torch.no_grad():
            outputs = classifier(img_tensor)
            import torch.nn.functional as F
            probs = F.softmax(outputs, dim=1).cpu().numpy()[0]

        pred_idx = int(np.argmax(probs))
        damage_classes = CONFIG.get('DAMAGE_CLASSES', MLConfig.DAMAGE_CLASSES)
        pred_class = damage_classes[pred_idx] if pred_idx < len(damage_classes) else 'other'

        # GradCAM damage ratio
        damage_ratio = 0.0
        heatmap_path = None
        if gradcam is not None:
            if heatmap_dir:
                result = gradcam.save_heatmap(image_path, heatmap_dir, pred_idx)
                damage_ratio = result.get('damage_ratio', 0.0)
                heatmap_path = result.get('heatmap_path')
            else:
                try:
                    _, heatmap, ratio = gradcam.generate_overlay(
                        image_path, pred_idx)
                    damage_ratio = ratio
                except Exception:
                    pass

        return {
            'damage_type_code': pred_class,
            'confidence': float(probs[pred_idx]),
            'probabilities': {
                damage_classes[i]: float(probs[i])
                for i in range(len(damage_classes))
                if i < len(probs)
            },
            'damage_ratio': round(damage_ratio, 4),
            'source': 'cnn',
            'heatmap_path': heatmap_path,
        }
    except Exception as e:
        print(f"[CNN] Error analyzing {image_path}: {e}", file=sys.stderr)
        return {
            'damage_type_code': 'unknown',
            'confidence': 0.0,
            'damage_ratio': 0.0,
            'source': 'error',
            'heatmap_path': None,
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

    except Exception:
        return None

def get_exif_timestamp(image_path: str) -> Optional[str]:
    """Extract timestamp from EXIF"""
    try:
        from PIL import Image
        img = Image.open(image_path)
        exif = img._getexif()
        if exif:
            return exif.get(36867)  # DateTimeOriginal
    except Exception:
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
    api_key: Optional[str] = None,
    sowing_date: Optional[str] = None,
    crop_type: Optional[str] = None,
) -> Dict:
    """
    🔥 MAIN FUNCTION — Assess crop damage with Multi-Stage Verification.

    v2: Now supports CNN classification, GradCAM, and temporal context.
    Backward compatible — if no model file exists, uses RGB-only.
    """
    if not image_paths:
        return {'error': 'No images provided'}

    # Initialize Verifiers
    weather_verifier = WeatherVerifier(api_key)
    geo_verifier = GeolocationVerifier()
    fraud_detector = FraudDetector()

    # Lazy-load CNN model
    classifier, gradcam = _get_classifier()
    has_cnn = classifier is not None

    # Set up heatmap output directory
    heatmap_dir = os.path.join(os.path.dirname(__file__), 'heatmaps')
    if has_cnn:
        os.makedirs(heatmap_dir, exist_ok=True)

    # Temporal context
    temporal = TemporalPredictor.get_temporal_context(sowing_date)

    # 1. Analyze Images & Extract Metadata
    results_rgb = []
    results_cnn = []
    coordinates = []
    damage_percentages_rgb = []
    damage_percentages_cnn = []
    damage_types_rgb = []
    damage_types_cnn = []
    image_details_for_fraud = []
    gradcam_heatmap_paths = []

    for path in image_paths:
        if not os.path.exists(path):
            continue

        # RGB analysis (always runs)
        rgb = analyze_damage_rgb(path)
        if 'error' not in rgb:
            results_rgb.append(rgb)
            damage_percentages_rgb.append(rgb['damage_percentage'])
            damage_types_rgb.append(rgb['damage_type_code'])

        # CNN analysis (if model available)
        cnn = analyze_damage_cnn(path, classifier, gradcam, heatmap_dir)
        if cnn['source'] == 'cnn':
            results_cnn.append(cnn)
            damage_types_cnn.append(cnn['damage_type_code'])
            if cnn['damage_ratio'] > 0:
                damage_percentages_cnn.append(cnn['damage_ratio'] * 100)
            if cnn.get('heatmap_path'):
                gradcam_heatmap_paths.append(cnn['heatmap_path'])

        # Extract metadata
        coords = get_exif_coordinates(path)
        if coords:
            coordinates.append(coords)

        ts = get_exif_timestamp(path)
        image_details_for_fraud.append({
            'filename': os.path.basename(path),
            'exif_timestamp': ts,
            'software': '',
        })

    if not results_rgb:
        return {'error': 'No valid images could be processed'}

    # 2. Geolocation Verification
    geo_result = geo_verifier.analyze_coordinate_cluster(coordinates)

    # 3. Damage Assessment — Hybrid Scoring
    avg_rgb = np.mean(damage_percentages_rgb)

    if damage_percentages_cnn:
        avg_cnn = np.mean(damage_percentages_cnn)
        avg_damage = (MLConfig.CNN_WEIGHT * avg_cnn
                      + MLConfig.RGB_WEIGHT * avg_rgb)
        scoring_method = 'HYBRID_CNN_RGB'
    else:
        avg_cnn = None
        avg_damage = avg_rgb
        scoring_method = 'RGB_ONLY'

    # Determine primary damage type
    from collections import Counter
    if damage_types_cnn:
        # Prefer CNN classification
        damage_type_code = Counter(damage_types_cnn).most_common(1)[0][0]
    else:
        damage_type_code = Counter(damage_types_rgb).most_common(1)[0][0]

    damage_type_name = CONFIG.get('DAMAGE_NAMES', {}).get(damage_type_code, 'Unknown')
    damage_type_pbi = CONFIG.get('CGIAR_TO_PBI', {}).get(damage_type_code, 'other')

    # 3b. Severity Classification
    if avg_damage <= 33:
        damage_severity = 'Minor'
        severity_range = '0-33%'
        severity_description = 'Minor crop losses detected'
    elif avg_damage <= 66:
        damage_severity = 'Moderate'
        severity_range = '33-66%'
        severity_description = 'Moderate crop losses detected'
    else:
        damage_severity = 'High'
        severity_range = '66-100%'
        severity_description = 'Severe/total crop losses detected'

    print(f"[DAMAGE] Method: {scoring_method} | "
          f"RGB: {avg_rgb:.1f}% | "
          f"CNN: {avg_cnn:.1f}% | " if avg_cnn is not None else f"[DAMAGE] Method: {scoring_method} | RGB: {avg_rgb:.1f}% | ",
          f"Final: {avg_damage:.1f}% → {damage_severity}",
          file=sys.stderr)

    # 4. Weather Verification
    target_coords = geo_result.get('center')
    if not target_coords and user_coords:
        target_coords = user_coords

    weather_result = {'status': 'SKIPPED', 'score': 0.5, 'details': ['No coordinates']}
    if target_coords:
        weather_data = weather_verifier.fetch_weather_data(
            target_coords['lat'], target_coords['lon'])
        weather_result = weather_verifier.verify_damage_correlation(
            weather_data, damage_type_code)

    # 5. Fraud Detection
    exif_fraud_result = fraud_detector.verify_exif_timestamps(
        image_details_for_fraud, datetime.now())

    duplicate_result = fraud_detector.detect_duplicate_images(image_paths)
    print(f"[FRAUD] Duplicate check: {duplicate_result['exact_duplicate_count']} exact, "
          f"{duplicate_result['near_duplicate_count']} near-duplicates, "
          f"score={duplicate_result['score']}", file=sys.stderr)

    # 6. Final Fraud Risk
    fraud_risk = fraud_detector.calculate_fraud_risk(
        weather_score=weather_result.get('confidence_score', 0.5),
        geolocation_score=geo_result.get('score', 0.5),
        exif_score=exif_fraud_result.get('score', 0.5),
        tampering_score=1.0,
        duplicate_score=duplicate_result.get('score', 1.0),
    )

    # 7. Area Calculation (use GradCAM if available)
    if field_size_m2:
        total_area = field_size_m2
        area_method = 'MANUAL'
    elif geo_result.get('max_spread_km', 0) > 0.05:
        spread_m = geo_result['max_spread_km'] * 1000
        total_area = (spread_m * spread_m) / 2
        area_method = 'GPS_SPREAD'
    else:
        effective_images = duplicate_result.get(
            'effective_unique_images', len(results_rgb))
        total_area = effective_images * CONFIG.get(
            'DEFAULT_IMAGE_COVERAGE_M2', 1500.0)
        area_method = 'ESTIMATED'

    if damage_percentages_cnn:
        # GradCAM-based area calculation (more accurate)
        gradcam_ratio = np.mean(damage_percentages_cnn) / 100
        damaged_area_m2 = total_area * gradcam_ratio
        area_method += '+GRADCAM'
    else:
        damaged_area_m2 = total_area * (avg_damage / 100)

    damaged_area_acres = round(damaged_area_m2 / 4046.86, 2)
    total_area_acres = round(total_area / 4046.86, 2)

    # 8. Final Decision Logic
    verified_confidence = (
        (geo_result.get('score', 0.5) * 0.4)
        + (weather_result.get('confidence_score', 0.5) * 0.4)
        + (1.0 - fraud_risk.get('risk_score', 0.5)) * 0.2
    )

    # Temporal adjustment
    if temporal.get('days_after_sowing', -1) >= 0:
        verified_confidence = TemporalPredictor.adjust_confidence(
            verified_confidence, temporal['days_after_sowing'])

    if fraud_risk.get('auto_reject'):
        claim_decision = 'REJECT'
        decision_reason = f"High Fraud Risk ({fraud_risk['risk_score']}) - Auto Rejected"
    elif (duplicate_result.get('exact_duplicate_count', 0) > 0
          and fraud_risk['risk_level'] == 'HIGH'):
        claim_decision = 'REJECT'
        decision_reason = (
            f"Duplicate images detected "
            f"({duplicate_result['exact_duplicate_count']} duplicates)"
            f" - High Fraud Risk")
    elif duplicate_result.get('exact_duplicate_count', 0) > 0:
        claim_decision = 'MANUAL_REVIEW'
        decision_reason = (
            f"Duplicate images detected "
            f"({duplicate_result['exact_duplicate_count']} duplicates)"
            f" - Requires Manual Review")
    elif verified_confidence >= 0.75:
        claim_decision = 'APPROVE'
        decision_reason = f"High Verification Score ({verified_confidence:.2f}) - Approved"
    elif verified_confidence >= 0.40:
        claim_decision = 'MANUAL_REVIEW'
        decision_reason = (
            f"Moderate Verification Score ({verified_confidence:.2f})"
            f" - Manual Review Required")
    else:
        claim_decision = 'REJECT'
        decision_reason = (
            f"Low Verification Score ({verified_confidence:.2f}) - Rejected")

    payout = (avg_damage / 100) * sum_insured if claim_decision == 'APPROVE' else 0

    return {
        # CORE OUTPUT
        'damage_type': damage_type_name,
        'damage_type_code': damage_type_code,
        'damage_type_pbi': damage_type_pbi,
        'damage_percentage': round(avg_damage, 1),
        'damage_severity': damage_severity,
        'severity_range': severity_range,
        'severity_description': severity_description,
        'damaged_area_m2': round(damaged_area_m2, 1),
        'damaged_area_acres': damaged_area_acres,
        'scoring_method': scoring_method,

        # CNN CLASSIFICATION DETAILS
        'cnn_classification': {
            'model_loaded': has_cnn,
            'backbone': MLConfig.BACKBONE,
            'rgb_damage_pct': round(avg_rgb, 1),
            'cnn_damage_pct': round(avg_cnn, 1) if avg_cnn is not None else None,
            'hybrid_weight': {
                'cnn': MLConfig.CNN_WEIGHT,
                'rgb': MLConfig.RGB_WEIGHT,
            },
        },

        # TEMPORAL CONTEXT
        'temporal_context': temporal,

        # GRADCAM EXPLAINABILITY
        'gradcam_heatmaps': gradcam_heatmap_paths,

        # VERIFICATION RESULTS
        'verification_results': {
            'geolocation': geo_result,
            'weather': weather_result,
            'fraud_risk': fraud_risk,
            'exif': exif_fraud_result,
            'duplicate_detection': {
                'score': duplicate_result['score'],
                'exact_duplicate_count': duplicate_result['exact_duplicate_count'],
                'near_duplicate_count': duplicate_result['near_duplicate_count'],
                'effective_unique_images': duplicate_result['effective_unique_images'],
                'total_images': duplicate_result['total_images'],
                'details': duplicate_result['details'],
            },
        },

        # DECISION
        'overall_assessment': {
            'final_decision': claim_decision,
            'confidence_score': round(verified_confidence, 2),
            'risk_level': fraud_risk['risk_level'],
            'manual_review_required': claim_decision == 'MANUAL_REVIEW',
            'decision_reason': decision_reason,
        },

        # PAYOUT
        'payout_calculation': {
            'sum_insured': sum_insured,
            'damage_percent': round(avg_damage, 1),
            'payout_amount': round(payout, 2),
            'currency': 'INR',
        },

        # METADATA
        'area_info': {
            'total_field_area_m2': round(total_area, 1),
            'total_field_area_acres': total_area_acres,
            'estimation_method': area_method,
        },
        'images_processed': len(results_rgb),
        'timestamp': datetime.now().isoformat(),
    }


# ============================================================================
# CLI INTERFACE
# ============================================================================
def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: python main_pipeline.py <images> [options]'}),
              file=sys.stderr)
        sys.exit(1)

    try:
        image_paths = []
        field_size = None
        sum_insured = 100000.0
        claimed_damage = 50.0
        user_lat = None
        user_lon = None
        api_key = None
        sowing_date = None
        crop_type = None

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
            elif arg == '--sowing-date' and i + 1 < len(sys.argv):
                sowing_date = sys.argv[i + 1]
                i += 2
            elif arg == '--crop-type' and i + 1 < len(sys.argv):
                crop_type = sys.argv[i + 1]
                i += 2
            else:
                image_paths.append(arg)
                i += 1

        user_coords = ({'lat': user_lat, 'lon': user_lon}
                       if user_lat is not None and user_lon is not None
                       else None)

        result = assess_crop_damage(
            image_paths=image_paths,
            user_coords=user_coords,
            field_size_m2=field_size,
            farmer_claimed_damage=claimed_damage,
            sum_insured=sum_insured,
            api_key=api_key,
            sowing_date=sowing_date,
            crop_type=crop_type,
        )

        print(json.dumps(result, indent=2))
        sys.stdout.flush()

    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
