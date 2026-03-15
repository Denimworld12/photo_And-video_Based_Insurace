"""
Crop Damage Insurance Assessment Module (v2)
==============================================
Production module for insurance-grade crop damage assessment.

v2 Changes:
  - EfficientNet B3 backbone (research paper recommendation)
  - GradCAM heatmap generation for explainability
  - GradCAM-based area calculation (pixel-ratio method)
  - Temporal predictor support (DAS / DOY)
  - Hybrid scoring (CNN + RGB)

Output:
- Damage Type with confidence
- Damage Percentage (min/mean/max)
- Damaged Area in m² and acres
- GradCAM heatmaps for transparency
- Coverage Quality assessment
- Manual Review flag
"""

import os
import gc
import json
import pickle
from datetime import datetime, date
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
    def ssim(img1, img2):
        return float(np.corrcoef(img1.flatten(), img2.flatten())[0, 1])


# ============================================================================
# CONFIGURATION
# ============================================================================
class Config:
    """Default configuration — can be overridden by config.pkl"""

    IMG_SIZE = 224
    BACKBONE = 'efficientnet_b3'
    NUM_CLASSES = 5

    DAMAGE_CLASSES = ['DR', 'G', 'ND', 'WD', 'other']
    DAMAGE_NAMES = {
        'DR': 'Drought',
        'G': 'Good/Healthy',
        'ND': 'Nutrient Deficiency',
        'WD': 'Weed Damage',
        'other': 'Other Damage',
    }
    # Map CNN classes → PBI lossReason values
    CGIAR_TO_PBI = {
        'DR': 'drought',
        'G': 'healthy',
        'ND': 'disease',
        'WD': 'pest',
        'other': 'other',
    }

    # Area estimation
    DEFAULT_IMAGE_COVERAGE_M2 = 1500.0
    AREA_VARIANCE_FACTOR = 0.15

    # Overlap detection
    OVERLAP_SSIM_THRESHOLD = 0.6

    # GradCAM
    GRADCAM_THRESHOLD = 0.5  # activation threshold for "damaged" pixel

    # Hybrid scoring weights
    CNN_WEIGHT = 0.7
    RGB_WEIGHT = 0.3


# Load config from pkl if available (overrides defaults)
def _load_config_from_pkl():
    config_path = os.path.join(os.path.dirname(__file__), '..', 'config.pkl')
    if os.path.exists(config_path):
        try:
            with open(config_path, 'rb') as f:
                data = pickle.load(f)
            for key, val in data.items():
                if hasattr(Config, key):
                    setattr(Config, key, val)
        except Exception:
            pass

_load_config_from_pkl()

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD  = [0.229, 0.224, 0.225]


# ============================================================================
# RGB DAMAGE ANALYZER
# ============================================================================
class RGBDamageAnalyzer:
    """Physics-based damage detection using RGB vegetation indices"""

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
        exg = RGBDamageAnalyzer.calculate_exg(img_rgb)
        exr = RGBDamageAnalyzer.calculate_exr(img_rgb)

        # Infer damage type from RGB indices
        avg_exg = float(np.mean(exg))
        avg_exr = float(np.mean(exr))

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

        return {
            'damage_percentage': damage_pct,
            'damage_type_code': damage_type_code,
            'vegetation_index': avg_exg,
            'stress_index': avg_exr,
            'image_size': img.shape[:2],
        }


# ============================================================================
# CLASSIFIER MODEL
# ============================================================================
class CropDamageClassifier(nn.Module):
    """EfficientNet-based damage classifier (v2 — B3 default)"""

    def __init__(self, backbone=Config.BACKBONE,
                 num_classes=Config.NUM_CLASSES,
                 pretrained=False):
        super().__init__()
        self.backbone = timm.create_model(
            backbone, pretrained=pretrained,
            num_classes=0, global_pool='avg'
        )

        with torch.no_grad():
            dummy = torch.randn(1, 3, Config.IMG_SIZE, Config.IMG_SIZE)
            feat_dim = self.backbone(dummy).shape[1]

        self.classifier = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feat_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, num_classes),
        )

    def forward(self, x):
        return self.classifier(self.backbone(x))


# ============================================================================
# GRADCAM GENERATOR
# ============================================================================
class GradCAMGenerator:
    """
    Generate Grad-CAM heatmaps from the last convolutional layer.
    Provides explainability for insurance claims.
    """

    def __init__(self, model: CropDamageClassifier, device: torch.device):
        self.model = model
        self.device = device
        self.model.eval()
        self._activations = None
        self._gradients = None

        # Hook the last Conv2d
        target_layer = self._find_last_conv(model.backbone)
        target_layer.register_forward_hook(self._save_activation)
        target_layer.register_backward_hook(self._save_gradient)

    @staticmethod
    def _find_last_conv(module: nn.Module) -> nn.Module:
        last_conv = None
        for m in module.modules():
            if isinstance(m, nn.Conv2d):
                last_conv = m
        if last_conv is None:
            raise RuntimeError("No Conv2d found")
        return last_conv

    def _save_activation(self, _mod, _inp, output):
        self._activations = output.detach()

    def _save_gradient(self, _mod, _grad_in, grad_out):
        self._gradients = grad_out[0].detach()

    def generate(self, input_tensor: torch.Tensor,
                 target_class: int = None) -> np.ndarray:
        """Generate GradCAM heatmap. Returns (H, W) float32 in [0, 1]."""
        self.model.eval()
        input_tensor = input_tensor.clone().requires_grad_(True).to(self.device)
        output = self.model(input_tensor)

        if target_class is None:
            target_class = output.argmax(dim=1).item()

        self.model.zero_grad()
        output[0, target_class].backward()

        weights = self._gradients.mean(dim=[2, 3], keepdim=True)
        cam = (weights * self._activations).sum(dim=1, keepdim=True)
        cam = F.relu(cam).squeeze().cpu().numpy()

        if cam.max() > 0:
            cam = cam / cam.max()

        cam = cv2.resize(cam, (Config.IMG_SIZE, Config.IMG_SIZE))
        return cam

    def generate_overlay(self, img_path: str,
                         target_class: int = None) -> Tuple[np.ndarray, np.ndarray, float]:
        """
        Generate heatmap overlay for an image.

        Returns:
            (overlay_image, raw_heatmap, damage_ratio)
        """
        transform = transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ])

        img = Image.open(img_path).convert('RGB')
        img_tensor = transform(img).unsqueeze(0)
        img_np = np.array(img.resize((Config.IMG_SIZE, Config.IMG_SIZE)))

        heatmap = self.generate(img_tensor, target_class)

        # Create overlay
        heatmap_colored = cv2.applyColorMap(
            (heatmap * 255).astype(np.uint8), cv2.COLORMAP_JET
        )
        heatmap_colored = cv2.cvtColor(heatmap_colored, cv2.COLOR_BGR2RGB)
        overlay = (img_np * 0.5 + heatmap_colored * 0.5).astype(np.uint8)

        # Damage ratio from heatmap
        damage_ratio = float((heatmap >= Config.GRADCAM_THRESHOLD).sum()) / heatmap.size

        return overlay, heatmap, damage_ratio

    def save_heatmap(self, img_path: str, output_dir: str,
                     target_class: int = None) -> Dict:
        """Generate and save a GradCAM heatmap to disk."""
        try:
            overlay, heatmap, damage_ratio = self.generate_overlay(
                img_path, target_class)

            basename = os.path.splitext(os.path.basename(img_path))[0]
            heatmap_filename = f"{basename}_gradcam.png"
            heatmap_path = os.path.join(output_dir, heatmap_filename)

            os.makedirs(output_dir, exist_ok=True)
            overlay_bgr = cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR)
            cv2.imwrite(heatmap_path, overlay_bgr)

            return {
                'heatmap_path': heatmap_path,
                'damage_ratio': round(damage_ratio, 4),
                'success': True,
            }
        except Exception as e:
            return {
                'heatmap_path': None,
                'damage_ratio': 0.0,
                'success': False,
                'error': str(e),
            }


# ============================================================================
# TEMPORAL PREDICTOR
# ============================================================================
class TemporalPredictor:
    """
    Adjusts classification confidence based on temporal context.
    Based on research: damage detection accuracy varies with crop growth stage.

    - Early stage (DAS < 60): Higher false-positive risk → apply penalty
    - Mid stage (60-150 DAS): Standard detection
    - Late stage (DAS > 150): Large losses easier to detect → boost confidence
    """

    @staticmethod
    def compute_das(sowing_date: str, image_date: str = None) -> int:
        """Compute Days After Sowing (DAS)."""
        try:
            sow = datetime.fromisoformat(sowing_date).date()
            img = (datetime.fromisoformat(image_date).date()
                   if image_date else date.today())
            return (img - sow).days
        except (ValueError, TypeError):
            return -1  # unknown

    @staticmethod
    def compute_doy(image_date: str = None) -> int:
        """Compute Day of Year (DOY)."""
        try:
            d = (datetime.fromisoformat(image_date).date()
                 if image_date else date.today())
            return d.timetuple().tm_yday
        except (ValueError, TypeError):
            return -1

    @staticmethod
    def adjust_confidence(confidence: float, das: int) -> float:
        """Adjust confidence score based on DAS."""
        if das < 0:
            return confidence  # unknown DAS, no adjustment

        if das < 60:
            # Early stage: penalize (higher false-positive risk)
            return confidence * 0.85
        elif das > 150:
            # Late stage: boost (large losses easier to detect)
            return min(1.0, confidence * 1.1)
        else:
            return confidence  # mid stage: no adjustment

    @staticmethod
    def get_temporal_context(sowing_date: str = None,
                             image_date: str = None) -> Dict:
        """Build temporal context dict for pipeline output."""
        das = TemporalPredictor.compute_das(sowing_date, image_date) if sowing_date else -1
        doy = TemporalPredictor.compute_doy(image_date)

        if das >= 0:
            if das < 60:
                growth_stage = 'early'
            elif das < 150:
                growth_stage = 'mid'
            else:
                growth_stage = 'late'
        else:
            growth_stage = 'unknown'

        return {
            'sowing_date': sowing_date,
            'image_date': image_date or date.today().isoformat(),
            'days_after_sowing': das,
            'day_of_year': doy,
            'growth_stage': growth_stage,
        }


# ============================================================================
# INSURANCE FIELD ANALYZER  (v2)
# ============================================================================
class InsuranceFieldAnalyzer:
    """Main insurance assessment class — hybrid CNN + RGB analysis."""

    def __init__(self, model_path: str = None, device: str = 'cuda'):
        self.device = torch.device(
            device if torch.cuda.is_available() else 'cpu')
        self.rgb_analyzer = RGBDamageAnalyzer()
        self.classifier = None
        self.gradcam = None

        if model_path and os.path.exists(model_path):
            self.load_classifier(model_path)

    def load_classifier(self, model_path: str):
        """Load trained model and initialize GradCAM."""
        self.classifier = CropDamageClassifier().to(self.device)
        self.classifier.load_state_dict(
            torch.load(model_path, map_location=self.device,
                       weights_only=True)
        )
        self.classifier.eval()
        try:
            self.gradcam = GradCAMGenerator(self.classifier, self.device)
        except Exception:
            self.gradcam = None

    def preprocess_image(self, img_path: str) -> torch.Tensor:
        """Preprocess for classifier"""
        transform = transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ])
        img = Image.open(img_path).convert('RGB')
        return transform(img).unsqueeze(0)

    def calculate_image_similarity(self, img1: np.ndarray,
                                    img2: np.ndarray) -> float:
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
        """Classify damage type using CNN"""
        if self.classifier is None:
            return {'damage_type': 'unknown', 'confidence': 0.0,
                    'probabilities': {}, 'source': 'none'}

        img_tensor = self.preprocess_image(img_path).to(self.device)

        with torch.no_grad():
            outputs = self.classifier(img_tensor)
            probs = F.softmax(outputs, dim=1).cpu().numpy()[0]

        pred_idx = np.argmax(probs)

        return {
            'damage_type': Config.DAMAGE_CLASSES[pred_idx],
            'damage_name': Config.DAMAGE_NAMES[Config.DAMAGE_CLASSES[pred_idx]],
            'confidence': float(probs[pred_idx]),
            'probabilities': {
                c: float(probs[i])
                for i, c in enumerate(Config.DAMAGE_CLASSES)
            },
            'source': 'cnn',
        }

    def get_coverage_quality(self, num_images: int, overlap_score: float,
                              damage_consistency: float) -> str:
        """Calculate coverage quality"""
        score = 0
        score += 3 if num_images >= 8 else (2 if num_images >= 5 else 1)
        score += 3 if overlap_score < 0.3 else (2 if overlap_score < 0.5 else 1)
        score += 3 if damage_consistency > 0.8 else (2 if damage_consistency > 0.5 else 1)
        return "HIGH" if score >= 7 else ("MEDIUM" if score >= 5 else "LOW")

    def analyze_field(
        self,
        image_paths: List[str],
        manual_field_area_m2: Optional[float] = None,
        sowing_date: Optional[str] = None,
        image_date: Optional[str] = None,
        heatmap_output_dir: Optional[str] = None,
    ) -> Dict:
        """
        🔥 MAIN FUNCTION — Insurance-grade field assessment (v2).

        Now supports:
          - Hybrid CNN + RGB scoring
          - GradCAM heatmap generation
          - GradCAM-based area calculation
          - Temporal context (DAS / DOY)

        Args:
            image_paths: List of 4-10 image paths
            manual_field_area_m2: Optional known field size
            sowing_date: ISO date string for DAS calculation
            image_date: ISO date string (default: today)
            heatmap_output_dir: Directory to save GradCAM PNGs

        Returns:
            Insurance assessment report (dict)
        """
        if not image_paths:
            return {'error': 'No images provided'}

        # Temporal context
        temporal = TemporalPredictor.get_temporal_context(
            sowing_date, image_date)

        # Analyze individual images
        damage_percentages = []
        cnn_damage_percentages = []
        damage_votes = []
        image_results = []
        gradcam_results = []

        for path in image_paths:
            # RGB analysis (always runs)
            rgb_result = self.rgb_analyzer.analyze_single_image(path)
            if 'error' in rgb_result:
                continue

            damage_percentages.append(rgb_result['damage_percentage'])

            # CNN classification (if model loaded)
            dl_result = self.classify_damage_type(path)
            if dl_result['confidence'] > 0 and dl_result['source'] == 'cnn':
                damage_votes.append(dl_result['damage_type'])

            # GradCAM (if available)
            gradcam_info = {'damage_ratio': 0.0, 'heatmap_path': None}
            if self.gradcam is not None:
                if heatmap_output_dir:
                    gradcam_info = self.gradcam.save_heatmap(
                        path, heatmap_output_dir)
                else:
                    try:
                        _, heatmap, ratio = self.gradcam.generate_overlay(path)
                        gradcam_info = {
                            'damage_ratio': round(ratio, 4),
                            'heatmap_path': None,
                            'success': True,
                        }
                    except Exception:
                        pass

                if gradcam_info.get('damage_ratio', 0) > 0:
                    cnn_damage_percentages.append(
                        gradcam_info['damage_ratio'] * 100)

            gradcam_results.append(gradcam_info)

            image_results.append({
                'path': os.path.basename(path),
                'rgb_damage_pct': rgb_result['damage_percentage'],
                'rgb_damage_type': rgb_result.get('damage_type_code', 'unknown'),
                'dl_damage_type': dl_result['damage_type'],
                'dl_confidence': dl_result['confidence'],
                'dl_source': dl_result['source'],
                'gradcam_damage_ratio': gradcam_info.get('damage_ratio', 0),
                'gradcam_heatmap': gradcam_info.get('heatmap_path'),
            })

        if not damage_percentages:
            return {'error': 'No valid images processed'}

        # Overlap detection
        overlap_score, effective_images = self.detect_overlaps(image_paths)

        # Damage consensus
        damage_counts = Counter(damage_votes) if damage_votes else Counter()
        if damage_counts:
            primary_damage = damage_counts.most_common(1)[0][0]
            damage_consistency = (damage_counts[primary_damage]
                                  / len(damage_votes))
        else:
            primary_damage = 'unknown'
            damage_consistency = 0.0

        # Hybrid damage percentage (CNN GradCAM + RGB)
        rgb_mean = np.mean(damage_percentages)
        if cnn_damage_percentages:
            cnn_mean = np.mean(cnn_damage_percentages)
            # Weighted hybrid
            damage_mean = (Config.CNN_WEIGHT * cnn_mean
                           + Config.RGB_WEIGHT * rgb_mean)
            scoring_method = 'HYBRID_CNN_RGB'
        else:
            damage_mean = rgb_mean
            cnn_mean = None
            scoring_method = 'RGB_ONLY'

        damage_std = np.std(damage_percentages)
        damage_min = max(0, damage_mean - 2 * damage_std)
        damage_max = min(100, damage_mean + 2 * damage_std)

        # Area estimation (GradCAM-based if available)
        if manual_field_area_m2:
            total_area = manual_field_area_m2
            area_method = "MANUAL"
        else:
            total_area = effective_images * Config.DEFAULT_IMAGE_COVERAGE_M2
            area_method = "ESTIMATED"

        if cnn_damage_percentages:
            # Use GradCAM pixel ratio for more accurate area
            gradcam_avg_ratio = np.mean(cnn_damage_percentages) / 100
            damaged_area_mean = total_area * gradcam_avg_ratio
            area_method += "+GRADCAM"
        else:
            damaged_area_mean = total_area * (damage_mean / 100)

        variance = Config.AREA_VARIANCE_FACTOR
        damaged_area_min = damaged_area_mean * (1 - variance)
        damaged_area_max = damaged_area_mean * (1 + variance)

        # Coverage quality
        coverage_quality = self.get_coverage_quality(
            len(image_paths), overlap_score, damage_consistency)

        # Manual review flag
        requires_review = (
            coverage_quality == "LOW"
            or damage_consistency < 0.5
            or (damage_max - damage_min) > 30
        )

        # Overall confidence
        confidence_factors = [
            damage_consistency,
            1 - overlap_score,
            min(len(image_paths) / 8, 1.0),
            1 - (damage_std / 50) if damage_std < 50 else 0.0,
        ]
        overall_confidence = float(np.mean(confidence_factors))

        # Temporal adjustment
        if temporal['days_after_sowing'] >= 0:
            overall_confidence = TemporalPredictor.adjust_confidence(
                overall_confidence, temporal['days_after_sowing'])

        # Collect heatmap paths
        heatmap_paths = [
            r.get('heatmap_path') for r in gradcam_results
            if r.get('heatmap_path')
        ]

        return {
            "assessment_id": f"INS_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "timestamp": datetime.now().isoformat(),

            # Primary outputs
            "damage_type": primary_damage,
            "damage_type_name": Config.DAMAGE_NAMES.get(primary_damage, "Unknown"),
            "damage_type_pbi": Config.CGIAR_TO_PBI.get(primary_damage, "other"),
            "damage_type_confidence": round(damage_consistency, 3),

            "damage_percentage": {
                "min": round(damage_min, 1),
                "mean": round(damage_mean, 1),
                "max": round(damage_max, 1),
            },

            "damaged_area_m2": {
                "min": round(damaged_area_min, 1),
                "mean": round(damaged_area_mean, 1),
                "max": round(damaged_area_max, 1),
            },

            "damaged_area_acres": {
                "min": round(damaged_area_min / 4046.86, 4),
                "mean": round(damaged_area_mean / 4046.86, 4),
                "max": round(damaged_area_max / 4046.86, 4),
            },

            # Quality metrics
            "overall_confidence": round(overall_confidence, 3),
            "coverage_quality": coverage_quality,
            "requires_manual_review": requires_review,
            "scoring_method": scoring_method,

            # CNN details
            "cnn_classification": {
                "model_loaded": self.classifier is not None,
                "backbone": Config.BACKBONE,
                "rgb_damage_pct": round(rgb_mean, 1),
                "cnn_damage_pct": round(cnn_mean, 1) if cnn_mean is not None else None,
                "hybrid_weight": {
                    "cnn": Config.CNN_WEIGHT,
                    "rgb": Config.RGB_WEIGHT,
                },
            },

            # Temporal context
            "temporal_context": temporal,

            # GradCAM explainability
            "gradcam_heatmaps": heatmap_paths,

            # Analysis details
            "total_images": len(image_paths),
            "effective_images": effective_images,
            "overlap_score": round(overlap_score, 3),
            "area_estimation_method": area_method,
            "estimated_total_area_m2": round(total_area, 1),

            # Per-image results
            "image_details": image_results,
        }


# ============================================================================
# EASY-USE FUNCTIONS
# ============================================================================
def assess_field_damage(
    image_paths: List[str],
    manual_field_area_m2: Optional[float] = None,
    model_path: str = None,
    sowing_date: str = None,
    heatmap_output_dir: str = None,
) -> Dict:
    """
    🔥 MAIN FUNCTION — Use this in your application!

    Args:
        image_paths: List of 4-10 image file paths
        manual_field_area_m2: Optional known field size in m²
        model_path: Path to trained .pth model file
        sowing_date: ISO date (e.g. '2025-06-15') for temporal context
        heatmap_output_dir: Directory to save GradCAM PNGs

    Returns:
        Insurance assessment report (dict)
    """
    analyzer = InsuranceFieldAnalyzer(model_path=model_path)
    return analyzer.analyze_field(
        image_paths, manual_field_area_m2,
        sowing_date=sowing_date,
        heatmap_output_dir=heatmap_output_dir,
    )


def print_insurance_report(report: Dict):
    """Pretty print the report"""
    print("\n" + "=" * 60)
    print("🌾 CROP DAMAGE INSURANCE ASSESSMENT (v2)")
    print("=" * 60)

    print(f"\n📋 ID: {report['assessment_id']}")
    print(f"\nDamage Type: {report['damage_type_name']} ({report['damage_type']})")
    print(f"Confidence: {report['damage_type_confidence']:.1%}")
    print(f"Scoring: {report['scoring_method']}")

    pct = report['damage_percentage']
    print(f"\nDamage: {pct['min']:.1f}% - {pct['max']:.1f}% (mean: {pct['mean']:.1f}%)")

    area = report['damaged_area_m2']
    print(f"Area: {area['min']:.0f} - {area['max']:.0f} m² (mean: {area['mean']:.0f} m²)")

    tc = report.get('temporal_context', {})
    if tc.get('days_after_sowing', -1) >= 0:
        print(f"\n🕐 DAS: {tc['days_after_sowing']} | Stage: {tc['growth_stage']}")

    print(f"\nCoverage: {report['coverage_quality']}")
    print(f"Confidence: {report['overall_confidence']:.1%}")

    heatmaps = report.get('gradcam_heatmaps', [])
    if heatmaps:
        print(f"🔥 GradCAM: {len(heatmaps)} heatmap(s) generated")

    if report['requires_manual_review']:
        print("⚠️  REQUIRES MANUAL REVIEW")
    print("=" * 60)


# ============================================================================
# CLI USAGE
# ============================================================================
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python crop_damage_insurance.py image1.jpg image2.jpg ...")
        print("       python crop_damage_insurance.py --model model.pth image1.jpg ...")
        print("       python crop_damage_insurance.py --sowing-date 2025-06-15 img1.jpg ...")
        sys.exit(1)

    model_path = None
    sowing_date = None
    image_paths = []

    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == '--model' and i + 1 < len(sys.argv):
            model_path = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == '--sowing-date' and i + 1 < len(sys.argv):
            sowing_date = sys.argv[i + 1]
            i += 2
        else:
            image_paths.append(sys.argv[i])
            i += 1

    report = assess_field_damage(
        image_paths, model_path=model_path, sowing_date=sowing_date)
    print_insurance_report(report)

    with open('insurance_report.json', 'w') as f:
        json.dump(report, f, indent=2)
    print(f"\n✓ Report saved to: insurance_report.json")
