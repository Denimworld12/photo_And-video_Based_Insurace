"""
Crop Damage Insurance Assessment Module
========================================
Standalone Python module for insurance-grade crop damage assessment.

Use this in your production application!

Output:
- Damage Type with confidence
- Damage Percentage (min/mean/max)
- Damaged Area in m² and acres
- Coverage Quality assessment
- Manual Review flag
"""

import os
import gc
import json
import pickle
from datetime import datetime
from collections import Counter
from typing import List, Dict, Tuple, Optional

import numpy as np
import cv2
from PIL import Image

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import transforms
import timm

try:
    from skimage.metrics import structural_similarity as ssim
except ImportError:
    # Fallback if skimage not installed
    def ssim(img1, img2):
        return float(np.corrcoef(img1.flatten(), img2.flatten())[0, 1])


# ============================================================================
# CONFIGURATION
# ============================================================================
class Config:
    """Default configuration - can be overridden"""
    
    IMG_SIZE = 224
    BACKBONE = 'efficientnet_b0'
    NUM_CLASSES = 5
    
    DAMAGE_CLASSES = ['DR', 'G', 'ND', 'WD', 'other']
    DAMAGE_NAMES = {
        'DR': 'Drought',
        'G': 'Good/Healthy',
        'ND': 'Nutrient Deficiency',
        'WD': 'Weed Damage',
        'other': 'Other Damage'
    }
    
    # Area estimation
    DEFAULT_IMAGE_COVERAGE_M2 = 1500.0
    AREA_VARIANCE_FACTOR = 0.15
    
    # Overlap detection
    OVERLAP_SSIM_THRESHOLD = 0.6


# ============================================================================
# RGB DAMAGE ANALYZER
# ============================================================================
class RGBDamageAnalyzer:
    """Physics-based damage detection using RGB indices"""
    
    @staticmethod
    def calculate_exg(img_rgb: np.ndarray) -> np.ndarray:
        """Excess Green Index"""
        b, g, r = cv2.split(img_rgb.astype(np.float32))
        total = r + g + b + 1e-6
        return 2 * (g / total) - (r / total) - (b / total)
    
    @staticmethod
    def calculate_exr(img_rgb: np.ndarray) -> np.ndarray:
        """Excess Red Index"""
        b, g, r = cv2.split(img_rgb.astype(np.float32))
        total = r + g + b + 1e-6
        return 1.4 * (r / total) - (g / total)
    
    @staticmethod
    def detect_soil(img_rgb: np.ndarray) -> np.ndarray:
        """Detect bare soil"""
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        return ((gray > 80) & (gray < 180)).astype(np.float32)
    
    @staticmethod
    def get_damage_mask(img_rgb: np.ndarray) -> Tuple[np.ndarray, float]:
        """Combined damage detection"""
        exg = RGBDamageAnalyzer.calculate_exg(img_rgb)
        exr = RGBDamageAnalyzer.calculate_exr(img_rgb)
        soil = RGBDamageAnalyzer.detect_soil(img_rgb)
        
        healthy_mask = (exg > 0.05).astype(np.float32)
        stress_mask = (exr > 0.1).astype(np.float32)
        damage_mask = np.clip(stress_mask + soil * (1 - healthy_mask), 0, 1)
        damage_pct = float(np.mean(damage_mask) * 100)
        
        return damage_mask, damage_pct
    
    @staticmethod
    def analyze_single_image(img_path: str) -> Dict:
        """Analyze single image"""
        img = cv2.imread(img_path)
        if img is None:
            return {'error': 'Could not load image'}
        
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mask, damage_pct = RGBDamageAnalyzer.get_damage_mask(img_rgb)
        
        return {
            'damage_percentage': damage_pct,
            'vegetation_index': float(np.mean(RGBDamageAnalyzer.calculate_exg(img_rgb))),
            'image_size': img.shape[:2]
        }


# ============================================================================
# CLASSIFIER MODEL
# ============================================================================
class CropDamageClassifier(nn.Module):
    """EfficientNet-based damage classifier"""
    
    def __init__(self, backbone=Config.BACKBONE, num_classes=Config.NUM_CLASSES):
        super().__init__()
        self.backbone = timm.create_model(
            backbone, pretrained=False, num_classes=0, global_pool='avg'
        )
        
        with torch.no_grad():
            dummy = torch.randn(1, 3, Config.IMG_SIZE, Config.IMG_SIZE)
            feat_dim = self.backbone(dummy).shape[1]
        
        self.classifier = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feat_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, num_classes)
        )
    
    def forward(self, x):
        return self.classifier(self.backbone(x))


# ============================================================================
# INSURANCE FIELD ANALYZER
# ============================================================================
class InsuranceFieldAnalyzer:
    """Main insurance assessment class"""
    
    def __init__(self, model_path: str = None, device: str = 'cuda'):
        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')
        self.rgb_analyzer = RGBDamageAnalyzer()
        self.classifier = None
        
        if model_path and os.path.exists(model_path):
            self.load_classifier(model_path)
    
    def load_classifier(self, model_path: str):
        """Load trained model"""
        self.classifier = CropDamageClassifier().to(self.device)
        self.classifier.load_state_dict(
            torch.load(model_path, map_location=self.device)
        )
        self.classifier.eval()
    
    def preprocess_image(self, img_path: str) -> torch.Tensor:
        """Preprocess for classifier"""
        transform = transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
        img = Image.open(img_path).convert('RGB')
        return transform(img).unsqueeze(0)
    
    def calculate_image_similarity(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """SSIM for overlap detection"""
        size = (256, 256)
        img1_resized = cv2.resize(img1, size)
        img2_resized = cv2.resize(img2, size)
        gray1 = cv2.cvtColor(img1_resized, cv2.COLOR_RGB2GRAY)
        gray2 = cv2.cvtColor(img2_resized, cv2.COLOR_RGB2GRAY)
        return ssim(gray1, gray2)
    
    def detect_overlaps(self, image_paths: List[str]) -> Tuple[float, int]:
        """Detect overlapping images"""
        if len(image_paths) <= 1:
            return 0.0, len(image_paths)
        
        images = []
        for path in image_paths:
            img = cv2.imread(path)
            if img is not None:
                images.append(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        
        if len(images) <= 1:
            return 0.0, len(images)
        
        similarities = []
        for i in range(len(images)):
            for j in range(i + 1, len(images)):
                sim = self.calculate_image_similarity(images[i], images[j])
                similarities.append(sim)
        
        avg_sim = np.mean(similarities) if similarities else 0.0
        overlap_factor = max(0.5, 1 - avg_sim)
        effective_count = max(1, int(len(images) * overlap_factor))
        
        return avg_sim, effective_count
    
    def classify_damage_type(self, img_path: str) -> Dict:
        """Classify damage type"""
        if self.classifier is None:
            return {'damage_type': 'unknown', 'confidence': 0.0, 'probabilities': {}}
        
        img_tensor = self.preprocess_image(img_path).to(self.device)
        
        with torch.no_grad():
            outputs = self.classifier(img_tensor)
            probs = F.softmax(outputs, dim=1).cpu().numpy()[0]
        
        pred_idx = np.argmax(probs)
        
        return {
            'damage_type': Config.DAMAGE_CLASSES[pred_idx],
            'damage_name': Config.DAMAGE_NAMES[Config.DAMAGE_CLASSES[pred_idx]],
            'confidence': float(probs[pred_idx]),
            'probabilities': {c: float(probs[i]) for i, c in enumerate(Config.DAMAGE_CLASSES)}
        }
    
    def get_coverage_quality(self, num_images: int, overlap_score: float,
                             damage_consistency: float) -> str:
        """Calculate coverage quality"""
        score = 0
        score += 3 if num_images >= 8 else (2 if num_images >= 5 else 1)
        score += 3 if overlap_score < 0.3 else (2 if overlap_score < 0.5 else 1)
        score += 3 if damage_consistency > 0.8 else (2 if damage_consistency > 0.5 else 1)
        
        return "HIGH" if score >= 7 else ("MEDIUM" if score >= 5 else "LOW")
    
    def analyze_field(self, image_paths: List[str],
                      manual_field_area_m2: Optional[float] = None) -> Dict:
        """
        🔥 MAIN FUNCTION - Insurance-grade field assessment
        
        Args:
            image_paths: List of 4-10 image paths
            manual_field_area_m2: Optional known field size
        
        Returns:
            Insurance assessment report
        """
        if not image_paths:
            return {'error': 'No images provided'}
        
        # Analyze individual images
        damage_percentages = []
        damage_votes = []
        image_results = []
        
        for path in image_paths:
            rgb_result = self.rgb_analyzer.analyze_single_image(path)
            if 'error' in rgb_result:
                continue
            
            damage_percentages.append(rgb_result['damage_percentage'])
            
            dl_result = self.classify_damage_type(path)
            if dl_result['confidence'] > 0:
                damage_votes.append(dl_result['damage_type'])
            
            image_results.append({
                'path': os.path.basename(path),
                'rgb_damage_pct': rgb_result['damage_percentage'],
                'dl_damage_type': dl_result['damage_type'],
                'dl_confidence': dl_result['confidence']
            })
        
        if not damage_percentages:
            return {'error': 'No valid images processed'}
        
        # Overlap detection
        overlap_score, effective_images = self.detect_overlaps(image_paths)
        
        # Damage consensus
        damage_counts = Counter(damage_votes) if damage_votes else Counter()
        if damage_counts:
            primary_damage = damage_counts.most_common(1)[0][0]
            damage_consistency = damage_counts[primary_damage] / len(damage_votes)
        else:
            primary_damage = 'unknown'
            damage_consistency = 0.0
        
        # Damage percentage range
        damage_mean = np.mean(damage_percentages)
        damage_std = np.std(damage_percentages)
        damage_min = max(0, damage_mean - 2 * damage_std)
        damage_max = min(100, damage_mean + 2 * damage_std)
        
        # Area estimation
        if manual_field_area_m2:
            total_area = manual_field_area_m2
            area_method = "MANUAL"
        else:
            total_area = effective_images * Config.DEFAULT_IMAGE_COVERAGE_M2
            area_method = "ESTIMATED"
        
        variance = Config.AREA_VARIANCE_FACTOR
        damaged_area_mean = total_area * (damage_mean / 100)
        damaged_area_min = total_area * (damage_min / 100) * (1 - variance)
        damaged_area_max = total_area * (damage_max / 100) * (1 + variance)
        
        # Coverage quality
        coverage_quality = self.get_coverage_quality(
            len(image_paths), overlap_score, damage_consistency
        )
        
        # Manual review flag
        requires_review = (
            coverage_quality == "LOW" or
            damage_consistency < 0.5 or
            (damage_max - damage_min) > 30
        )
        
        # Overall confidence
        confidence_factors = [
            damage_consistency,
            1 - overlap_score,
            min(len(image_paths) / 8, 1.0),
            1 - (damage_std / 50) if damage_std < 50 else 0.0
        ]
        overall_confidence = np.mean(confidence_factors)
        
        return {
            "assessment_id": f"INS_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "timestamp": datetime.now().isoformat(),
            
            "damage_type": primary_damage,
            "damage_type_name": Config.DAMAGE_NAMES.get(primary_damage, "Unknown"),
            "damage_type_confidence": round(damage_consistency, 3),
            
            "damage_percentage": {
                "min": round(damage_min, 1),
                "mean": round(damage_mean, 1),
                "max": round(damage_max, 1)
            },
            
            "damaged_area_m2": {
                "min": round(damaged_area_min, 1),
                "mean": round(damaged_area_mean, 1),
                "max": round(damaged_area_max, 1)
            },
            
            "damaged_area_acres": {
                "min": round(damaged_area_min / 4046.86, 4),
                "mean": round(damaged_area_mean / 4046.86, 4),
                "max": round(damaged_area_max / 4046.86, 4)
            },
            
            "overall_confidence": round(overall_confidence, 3),
            "coverage_quality": coverage_quality,
            "requires_manual_review": requires_review,
            
            "total_images": len(image_paths),
            "effective_images": effective_images,
            "overlap_score": round(overlap_score, 3),
            "area_estimation_method": area_method,
            "estimated_total_area_m2": round(total_area, 1),
            
            "image_details": image_results
        }


# ============================================================================
# EASY-USE FUNCTIONS
# ============================================================================
def assess_field_damage(image_paths: List[str],
                        manual_field_area_m2: Optional[float] = None,
                        model_path: str = None) -> Dict:
    """
    🔥 MAIN FUNCTION - Use this in your application!
    
    Args:
        image_paths: List of 4-10 image file paths
        manual_field_area_m2: Optional known field size in m²
        model_path: Path to trained .pth model file
    
    Returns:
        Insurance assessment report (dict)
    
    Example:
        report = assess_field_damage(
            ['img1.jpg', 'img2.jpg', 'img3.jpg', 'img4.jpg'],
            manual_field_area_m2=5000,
            model_path='classifier_model.pth'
        )
        print(report['damage_type'])       # 'WD'
        print(report['damage_percentage']) # {'min': 30.1, 'mean': 34.5, 'max': 38.9}
    """
    analyzer = InsuranceFieldAnalyzer(model_path=model_path)
    return analyzer.analyze_field(image_paths, manual_field_area_m2)


def print_insurance_report(report: Dict):
    """Pretty print the report"""
    print("\n" + "="*60)
    print("🌾 CROP DAMAGE INSURANCE ASSESSMENT")
    print("="*60)
    
    print(f"\n📋 ID: {report['assessment_id']}")
    print(f"\nDamage Type: {report['damage_type_name']} ({report['damage_type']})")
    print(f"Confidence: {report['damage_type_confidence']:.1%}")
    
    pct = report['damage_percentage']
    print(f"\nDamage: {pct['min']:.1f}% - {pct['max']:.1f}% (mean: {pct['mean']:.1f}%)")
    
    area = report['damaged_area_m2']
    print(f"Area: {area['min']:.0f} - {area['max']:.0f} m² (mean: {area['mean']:.0f} m²)")
    
    print(f"\nCoverage: {report['coverage_quality']}")
    print(f"Confidence: {report['overall_confidence']:.1%}")
    
    if report['requires_manual_review']:
        print("⚠️  REQUIRES MANUAL REVIEW")
    print("="*60)


# ============================================================================
# CLI USAGE
# ============================================================================
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python crop_damage_insurance.py image1.jpg image2.jpg ...")
        print("       python crop_damage_insurance.py --model model.pth image1.jpg ...")
        sys.exit(1)
    
    # Parse arguments
    model_path = None
    image_paths = []
    
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == '--model' and i + 1 < len(sys.argv):
            model_path = sys.argv[i + 1]
            i += 2
        else:
            image_paths.append(sys.argv[i])
            i += 1
    
    # Run assessment
    report = assess_field_damage(image_paths, model_path=model_path)
    print_insurance_report(report)
    
    # Save JSON
    with open('insurance_report.json', 'w') as f:
        json.dump(report, f, indent=2)
    print(f"\n✓ Report saved to: insurance_report.json")
