

# =========================================
# NOTEBOOK: CGIR.ipynb
# =========================================


# --- Cell 0 ---
import os
import json
import random
from pathlib import Path
from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional

import numpy as np
import pandas as pd
import cv2
from PIL import Image
import matplotlib.pyplot as plt
from tqdm.auto import tqdm

from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import log_loss, f1_score, classification_report

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models
import timm


# --- Cell 1 ---

# Segmentation for area calculation
try:
    from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor
    SEGFORMER_AVAILABLE = True
except ImportError:
    SEGFORMER_AVAILABLE = False
    print("[WARNING] Transformers not available. Using fallback segmentation.")

# ============================================================================
# CONFIGURATION
# ============================================================================
class Config:
    # Paths (update these for your environment)
    DRIVE_PATH = "/content/drive/MyDrive/crop_insurance"  # Google Drive mount
    DATASET_DIR = f"{DRIVE_PATH}/dataset"
    TRAIN_IMG_DIR = f"{DATASET_DIR}/train"
    TEST_IMG_DIR = f"{DATASET_DIR}/test"
    
    # Output
    OUTPUT_DIR = "outputs"
    MODELS_DIR = f"{OUTPUT_DIR}/models"
    RESULTS_DIR = f"{OUTPUT_DIR}/results"
    
    # Training settings
    SEED = 1032
    N_FOLDS = 3
    SAMPLE_SIZE = 1000  # Use 1000 images for faster training
    
    # Model hyperparameters
    BATCH_SIZE = 16
    IMG_SIZE = 384
    EPOCHS = 10
    LEARNING_RATE = 2e-4
    NUM_WORKERS = 4
    PATIENCE = 3
    
    # Model architecture
    BACKBONE = 'convnext_base.fb_in22k'
    
    # Damage categories
    DAMAGE_CLASSES = ['DR', 'G', 'ND', 'WD', 'other']
    
    # Area calculation
    PIXEL_TO_M2 = 0.01  # Rough estimate: 0.01 m² per pixel
    OVERLAP_THRESHOLD = 0.3  # 30% feature similarity = potential overlap

# Create directories
os.makedirs(Config.OUTPUT_DIR, exist_ok=True)
os.makedirs(Config.MODELS_DIR, exist_ok=True)
os.makedirs(Config.RESULTS_DIR, exist_ok=True)

# Set random seeds
def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

set_seed(Config.SEED)

# ============================================================================
# DATA LOADING & PREPROCESSING
# ============================================================================

def load_and_sample_data(train_csv_path: str, sample_size: int = 1000):
    """Load Train.csv and sample images for faster training"""
    df = pd.read_csv(train_csv_path)
    
    print(f"[DATA] Original dataset size: {len(df)}")
    print(f"[DATA] Columns: {df.columns.tolist()}")
    print(f"[DATA] Damage distribution:\n{df['damage'].value_counts()}")
    
    # Sample stratified by damage type
    if sample_size < len(df):
        df_sampled = df.groupby('damage', group_keys=False).apply(
            lambda x: x.sample(min(len(x), sample_size // len(df['damage'].unique())), 
                             random_state=Config.SEED)
        ).reset_index(drop=True)
    else:
        df_sampled = df
    
    print(f"[DATA] Sampled dataset size: {len(df_sampled)}")
    print(f"[DATA] Sampled damage distribution:\n{df_sampled['damage'].value_counts()}")
    
    return df_sampled

def prepare_multilabel_targets(df: pd.DataFrame):
    """Convert damage labels to multi-label binary encoding"""
    df = df.copy()
    
    # Create binary columns for each damage type
    for damage_type in Config.DAMAGE_CLASSES:
        df[damage_type] = 0
    
    # Set the corresponding damage column to 1
    for idx, row in df.iterrows():
        damage = row['damage']
        if damage in Config.DAMAGE_CLASSES:
            df.at[idx, damage] = 1
    
    return df

# ============================================================================
# VISUAL HEALTH INDEX (GPS-Free Mapping Alternative)
# ============================================================================

class VisualHealthAnalyzer:
    """Analyzes visual features of each image to estimate health without GPS"""
    
    @staticmethod
    def calculate_vegetation_index(img_rgb: np.ndarray) -> float:
        """Calculate ExG (Excess Green Index)"""
        b, g, r = cv2.split(img_rgb)
        b, g, r = b.astype(np.float32), g.astype(np.float32), r.astype(np.float32)
        sum_rgb = r + g + b + 1e-6
        g_norm, r_norm, b_norm = g / sum_rgb, r / sum_rgb, b / sum_rgb
        exg = 2 * g_norm - r_norm - b_norm
        return float(exg.mean())
    
    @staticmethod
    def calculate_brown_stress_index(img_rgb: np.ndarray) -> float:
        """Calculate ExR (Excess Red Index) for brown/stressed areas"""
        b, g, r = cv2.split(img_rgb)
        b, g, r = b.astype(np.float32), g.astype(np.float32), r.astype(np.float32)
        sum_rgb = r + g + b + 1e-6
        r_norm, g_norm = r / sum_rgb, g / sum_rgb
        exr = 1.4 * r_norm - g_norm
        return float(exr.mean())
    
    @staticmethod
    def calculate_soil_ratio(img_rgb: np.ndarray) -> float:
        """Estimate visible soil (bare patches)"""
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        # Soil is typically medium brightness
        soil_mask = ((gray > 80) & (gray < 160)).astype(np.uint8) * 255
        return float(soil_mask.sum() / (gray.shape[0] * gray.shape[1] * 255))
    
    @staticmethod
    def calculate_color_variance(img_rgb: np.ndarray) -> float:
        """High variance = inconsistent growth/damage patterns"""
        return float(np.std(img_rgb))
    
    @staticmethod
    def analyze_image(img_path: str) -> Dict:
        """Complete visual health analysis"""
        img = cv2.imread(img_path)
        if img is None:
            return None
        
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        return {
            'vegetation_index': VisualHealthAnalyzer.calculate_vegetation_index(img_rgb),
            'brown_stress_index': VisualHealthAnalyzer.calculate_brown_stress_index(img_rgb),
            'soil_ratio': VisualHealthAnalyzer.calculate_soil_ratio(img_rgb),
            'color_variance': VisualHealthAnalyzer.calculate_color_variance(img_rgb),
        }

def add_visual_features(df: pd.DataFrame, img_dir: str):
    """Add visual health features to dataframe"""
    print("[FEATURES] Calculating visual health indices...")
    
    features = []
    for idx, row in tqdm(df.iterrows(), total=len(df)):
        img_path = os.path.join(img_dir, row['filename'])
        visual_data = VisualHealthAnalyzer.analyze_image(img_path)
        
        if visual_data:
            features.append(visual_data)
        else:
            # Default values if image fails
            features.append({
                'vegetation_index': 0.0,
                'brown_stress_index': 0.0,
                'soil_ratio': 0.0,
                'color_variance': 0.0,
            })
    
    features_df = pd.DataFrame(features)
    df = pd.concat([df.reset_index(drop=True), features_df], axis=1)
    
    print("[FEATURES] Visual features added:")
    print(features_df.describe())
    
    return df

# ============================================================================
# OVERLAP DETECTION (Replaces GPS Distance Calculation)
# ============================================================================

class OverlapDetector:
    """Detects if consecutive images might overlap based on visual similarity"""
    
    @staticmethod
    def extract_features(img: np.ndarray) -> np.ndarray:
        """Extract ORB features for matching"""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        orb = cv2.ORB_create(nfeatures=500)
        keypoints, descriptors = orb.detectAndCompute(gray, None)
        return descriptors
    
    @staticmethod
    def calculate_overlap(img1_path: str, img2_path: str) -> float:
        """Calculate feature-based overlap between two images"""
        img1 = cv2.imread(img1_path)
        img2 = cv2.imread(img2_path)
        
        if img1 is None or img2 is None:
            return 0.0
        
        desc1 = OverlapDetector.extract_features(img1)
        desc2 = OverlapDetector.extract_features(img2)
        
        if desc1 is None or desc2 is None:
            return 0.0
        
        # Use BFMatcher to find matches
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = bf.match(desc1, desc2)
        
        # Overlap ratio = matches / min(features in both images)
        overlap = len(matches) / min(len(desc1), len(desc2))
        return min(overlap, 1.0)

# ============================================================================
# SEGMENTATION FOR AREA CALCULATION
# ============================================================================

class DamageSegmentationModel:
    """Segment damaged areas for precise area calculation"""
    
    def __init__(self):
        if SEGFORMER_AVAILABLE:
            self.processor = SegformerImageProcessor.from_pretrained(
                "nvidia/segformer-b0-finetuned-ade-512-512"
            )
            self.model = SegformerForSemanticSegmentation.from_pretrained(
                "nvidia/segformer-b0-finetuned-ade-512-512"
            )
            self.use_segformer = True
        else:
            self.use_segformer = False
    
    def segment_damaged_area(self, img_path: str, damage_type: str = 'all') -> Tuple[np.ndarray, float]:
        """
        Segment and calculate damaged area
        Returns: (segmentation_mask, area_ratio)
        """
        img = cv2.imread(img_path)
        if img is None:
            return None, 0.0
        
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        if self.use_segformer:
            # Use Segformer for advanced segmentation
            inputs = self.processor(images=img_rgb, return_tensors="pt")
            outputs = self.model(**inputs)
            logits = outputs.logits
            mask = logits.argmax(dim=1)[0].cpu().numpy()
        else:
            # Fallback: Rule-based segmentation
            mask = self._rule_based_segmentation(img_rgb, damage_type)
        
        # Calculate area ratio
        total_pixels = mask.shape[0] * mask.shape[1]
        damaged_pixels = np.sum(mask > 0)
        area_ratio = damaged_pixels / total_pixels
        
        return mask, area_ratio
    
    def _rule_based_segmentation(self, img_rgb: np.ndarray, damage_type: str) -> np.ndarray:
        """Fallback rule-based segmentation"""
        h, w = img_rgb.shape[:2]
        mask = np.zeros((h, w), dtype=np.uint8)
        
        # Vegetation mask
        b, g, r = cv2.split(img_rgb)
        vegetation = (g > r) & (g > b) & (g > 80)
        
        if damage_type in ['DR', 'brown', 'all']:
            # Brown/drought areas
            brown = (r > g) & (r > 100) & (g < 150)
            mask[brown] = 1
        
        if damage_type in ['ND', 'yellow', 'all']:
            # Yellow/nutrient deficient
            yellow = (r > 150) & (g > 150) & (b < 100)
            mask[yellow] = 2
        
        if damage_type in ['WD', 'weed', 'all']:
            # Excess green/weeds
            excess_green = (g > 150) & (g > r + 30)
            mask[excess_green] = 3
        
        if damage_type in ['soil', 'gap', 'all']:
            # Bare soil
            gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
            soil = ((gray > 80) & (gray < 160) & (~vegetation))
            mask[soil] = 4
        
        return mask

# ============================================================================
# DATASET
# ============================================================================

class CropDamageDataset(Dataset):
    """Dataset for multi-label crop damage classification"""
    
    def __init__(self, df: pd.DataFrame, img_dir: str, transform=None, is_test=False):
        self.df = df.reset_index(drop=True)
        self.img_dir = img_dir
        self.transform = transform
        self.is_test = is_test
        self.damage_cols = Config.DAMAGE_CLASSES
    
    def __len__(self):
        return len(self.df)
    
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = os.path.join(self.img_dir, row['filename'])
        
        # Load image
        img = Image.open(img_path).convert('RGB')
        
        if self.transform:
            img = self.transform(img)
        
        if self.is_test:
            return img, row['ID']
        else:
            # Multi-label targets
            labels = torch.tensor([row[col] for col in self.damage_cols], dtype=torch.float32)
            return img, labels

def get_transforms(is_train=True):
    """Get image transforms"""
    if is_train:
        return transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
    else:
        return transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])

# ============================================================================
# MODEL
# ============================================================================

class CropDamageModel(nn.Module):
    """Multi-label classification model with area estimation"""
    
    def __init__(self, num_classes=5, pretrained=True):
        super().__init__()
        
        # Backbone
        self.backbone = timm.create_model(
            Config.BACKBONE,
            pretrained=pretrained,
            num_classes=0,  # Remove classification head
            global_pool='avg'
        )
        
        # Get feature dimension
        with torch.no_grad():
            dummy_input = torch.randn(1, 3, Config.IMG_SIZE, Config.IMG_SIZE)
            features = self.backbone(dummy_input)
            feature_dim = features.shape[1]
        
        # Classification head
        self.classifier = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feature_dim, 512),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(512, num_classes)
        )
        
        # Area estimation head (optional - predicts damage percentage)
        self.area_estimator = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feature_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 1),
            nn.Sigmoid()  # Output between 0-1 (percentage)
        )
    
    def forward(self, x):
        features = self.backbone(x)
        class_logits = self.classifier(features)
        area_pred = self.area_estimator(features)
        return class_logits, area_pred

# ============================================================================
# TRAINING
# ============================================================================

class Trainer:
    def __init__(self, model, device):
        self.model = model.to(device)
        self.device = device
        self.best_loss = float('inf')
    
    def train_epoch(self, dataloader, optimizer, criterion):
        self.model.train()
        total_loss = 0
        
        for images, labels in tqdm(dataloader, desc="Training"):
            images = images.to(self.device)
            labels = labels.to(self.device)
            
            optimizer.zero_grad()
            
            class_logits, area_pred = self.model(images)
            
            # Multi-label classification loss
            loss = criterion(class_logits, labels)
            
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
        
        return total_loss / len(dataloader)
    
    def validate(self, dataloader, criterion):
        self.model.eval()
        total_loss = 0
        all_preds = []
        all_labels = []
        
        with torch.no_grad():
            for images, labels in tqdm(dataloader, desc="Validation"):
                images = images.to(self.device)
                labels = labels.to(self.device)
                
                class_logits, area_pred = self.model(images)
                
                loss = criterion(class_logits, labels)
                total_loss += loss.item()
                
                preds = torch.sigmoid(class_logits)
                all_preds.append(preds.cpu().numpy())
                all_labels.append(labels.cpu().numpy())
        
        all_preds = np.vstack(all_preds)
        all_labels = np.vstack(all_labels)
        
        return total_loss / len(dataloader), all_preds, all_labels

def train_model(train_df: pd.DataFrame, img_dir: str, fold: int):
    """Train model for one fold"""
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"\n[FOLD {fold}] Training on {device}")
    
    # Split data
    train_fold = train_df[train_df['fold'] != fold].reset_index(drop=True)
    val_fold = train_df[train_df['fold'] == fold].reset_index(drop=True)
    
    print(f"Train size: {len(train_fold)}, Val size: {len(val_fold)}")
    
    # Datasets
    train_dataset = CropDamageDataset(train_fold, img_dir, get_transforms(True))
    val_dataset = CropDamageDataset(val_fold, img_dir, get_transforms(False))
    
    train_loader = DataLoader(train_dataset, batch_size=Config.BATCH_SIZE, 
                             shuffle=True, num_workers=Config.NUM_WORKERS)
    val_loader = DataLoader(val_dataset, batch_size=Config.BATCH_SIZE, 
                           shuffle=False, num_workers=Config.NUM_WORKERS)
    
    # Model
    model = CropDamageModel(num_classes=len(Config.DAMAGE_CLASSES))
    trainer = Trainer(model, device)
    
    # Loss & Optimizer
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=Config.LEARNING_RATE)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=Config.EPOCHS)
    
    # Training loop
    best_val_loss = float('inf')
    patience_counter = 0
    
    for epoch in range(Config.EPOCHS):
        print(f"\n[Epoch {epoch+1}/{Config.EPOCHS}]")
        
        train_loss = trainer.train_epoch(train_loader, optimizer, criterion)
        val_loss, val_preds, val_labels = trainer.validate(val_loader, criterion)
        
        scheduler.step()
        
        print(f"Train Loss: {train_loss:.4f}, Val Loss: {val_loss:.4f}")
        
        # Early stopping
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            # Save best model
            torch.save(model.state_dict(), 
                      f"{Config.MODELS_DIR}/model_fold{fold}_best.pth")
        else:
            patience_counter += 1
            if patience_counter >= Config.PATIENCE:
                print(f"Early stopping at epoch {epoch+1}")
                break
    
    return model

# ============================================================================
# INFERENCE & AREA CALCULATION
# ============================================================================

def predict_with_area_estimation(model, test_df: pd.DataFrame, img_dir: str, device):
    """Generate predictions with area calculations"""
    model.eval()
    segmenter = DamageSegmentationModel()
    
    predictions = []
    area_results = []
    
    test_dataset = CropDamageDataset(test_df, img_dir, get_transforms(False), is_test=True)
    test_loader = DataLoader(test_dataset, batch_size=Config.BATCH_SIZE, 
                            shuffle=False, num_workers=Config.NUM_WORKERS)
    
    with torch.no_grad():
        for images, image_ids in tqdm(test_loader, desc="Prediction"):
            images = images.to(device)
            
            class_logits, area_pred = model(images)
            probs = torch.sigmoid(class_logits).cpu().numpy()
            areas = area_pred.cpu().numpy()
            
            predictions.extend(probs)
            
            # Per-image area calculation
            for idx, img_id in enumerate(image_ids):
                row = test_df[test_df['ID'] == img_id].iloc[0]
                img_path = os.path.join(img_dir, row['filename'])
                
                mask, area_ratio = segmenter.segment_damaged_area(img_path)
                
                area_results.append({
                    'ID': img_id,
                    'predicted_damage_area_ratio': float(areas[idx][0]),
                    'segmented_damage_area_ratio': area_ratio,
                    'estimated_area_m2': area_ratio * (Config.IMG_SIZE ** 2) * Config.PIXEL_TO_M2
                })
    
    return np.array(predictions), area_results

# ============================================================================
# MAIN PIPELINE
# ============================================================================

def main():
    print("\n" + "="*60)
    print("CROP DAMAGE INSURANCE ASSESSMENT")
    print("="*60)
    
    # 1. Load data
    print("\n[STEP 1] Loading data...")
    train_df = load_and_sample_data(
        f"{Config.DATASET_DIR}/Train.csv",
        sample_size=Config.SAMPLE_SIZE
    )
    
    # 2. Prepare multi-label targets
    print("\n[STEP 2] Preparing targets...")
    train_df = prepare_multilabel_targets(train_df)
    
    # 3. Add visual features
    print("\n[STEP 3] Extracting visual features...")
    train_df = add_visual_features(train_df, Config.TRAIN_IMG_DIR)
    
    # 4. Create folds
    print("\n[STEP 4] Creating folds...")
    skf = StratifiedKFold(n_splits=Config.N_FOLDS, shuffle=True, random_state=Config.SEED)
    train_df['fold'] = -1
    
    for fold, (_, val_idx) in enumerate(skf.split(train_df, train_df['damage'])):
        train_df.loc[val_idx, 'fold'] = fold
    
    print(train_df.groupby(['fold', 'damage']).size())
    
    # 5. Train models
    print("\n[STEP 5] Training models...")
    models = []
    for fold in range(Config.N_FOLDS):
        model = train_model(train_df, Config.TRAIN_IMG_DIR, fold)
        models.append(model)
    
    # 6. Load test data and predict
    print("\n[STEP 6] Generating predictions...")
    test_df = pd.read_csv(f"{Config.DATASET_DIR}/Test.csv")
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    all_predictions = []
    all_areas = []
    
    for fold, model in enumerate(models):
        print(f"\n[FOLD {fold}] Predicting...")
        preds, areas = predict_with_area_estimation(model, test_df, Config.TEST_IMG_DIR, device)
        all_predictions.append(preds)
        all_areas.extend(areas)
    
    # 7. Ensemble predictions
    print("\n[STEP 7] Ensembling...")
    final_predictions = np.mean(all_predictions, axis=0)
    
    # 8. Create submission
    print("\n[STEP 8] Creating submission...")
    submission = pd.DataFrame({
        'ID': test_df['ID'],
        **{damage: final_predictions[:, i] for i, damage in enumerate(Config.DAMAGE_CLASSES)}
    })
    
    submission.to_csv(f"{Config.RESULTS_DIR}/submission.csv", index=False)
    
    # 9. Save area calculations
    areas_df = pd.DataFrame(all_areas)
    areas_df.to_csv(f"{Config.RESULTS_DIR}/area_calculations.csv", index=False)
    
    # 10. Aggregate results
    print("\n[STEP 9] Calculating total damaged area...")
    total_damaged_area = areas_df['estimated_area_m2'].sum()
    total_images = len(areas_df)
    avg_damage_ratio = areas_df['segmented_damage_area_ratio'].mean()
    
    summary = {
        'total_images_processed': total_images,
        'total_estimated_damaged_area_m2': float(total_damaged_area),
        'total_estimated_damaged_area_acres': float(total_damaged_area / 4046.86),
        'average_damage_ratio': float(avg_damage_ratio),
        'damage_distribution': submission[Config.DAMAGE_CLASSES].mean().to_dict()
    }
    
    with open(f"{Config.RESULTS_DIR}/summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    
    print("\n" + "="*60)
    print("RESULTS SUMMARY")
    print("="*60)
    print(f"Total images: {total_images}")
    print(f"Total damaged area: {total_damaged_area:.2f} m² ({total_damaged_area/4046.86:.4f} acres)")
    print(f"Average damage ratio: {avg_damage_ratio:.2%}")
    print("\nDamage type distribution:")
    for damage_type, prob in summary['damage_distribution'].items():
        print(f"  {damage_type} ({DAMAGE_CATEGORIES.get(damage_type, damage_type)}): {prob:.2%}")
    print("="*60)
    
    print(f"\nFiles saved:")
    print(f"  - {Config.RESULTS_DIR}/submission.csv")
    print(f"  - {Config.RESULTS_DIR}/area_calculations.csv")
    print(f"  - {Config.RESULTS_DIR}/summary.json")

if __name__ == "__main__":
    # Mount Google Drive (if using Colab)
    try:
        from google.colab import drive
        drive.mount('/content/drive')
    except:
        print("Not running in Colab")
    
    main()

# ============================================================================
# ADDITIONAL UTILITIES
# ============================================================================

def analyze_overlaps(df: pd.DataFrame, img_dir: str, max_pairs: int = 100):
    """Analyze potential overlaps between consecutive images"""
    print("\n[OVERLAP ANALYSIS] Checking image overlaps...")
    
    overlaps = []
    detector = OverlapDetector()
    
    for i in range(min(len(df) - 1, max_pairs)):
        img1_path = os.path.join(img_dir, df.iloc[i]['filename'])
        img2_path = os.path.join(img_dir, df.iloc[i+1]['filename'])
        
        overlap = detector.calculate_overlap(img1_path, img2_path)
        
        if overlap > Config.OVERLAP_THRESHOLD:
            overlaps.append({
                'image1': df.iloc[i]['filename'],
                'image2': df.iloc[i+1]['filename'],
                'overlap_ratio': overlap
            })
    
    print(f"Found {len(overlaps)} potential overlapping pairs")
    
    if overlaps:
        overlaps_df = pd.DataFrame(overlaps

# --- Cell 2 ---

# Segmentation for area calculation
try:
    from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor
    SEGFORMER_AVAILABLE = True
except ImportError:
    SEGFORMER_AVAILABLE = False
    print("[WARNING] Transformers not available. Using fallback segmentation.")


# --- Cell 3 ---

# ============================================================================
# CONFIGURATION
# ============================================================================
class Config:
    # Paths (update these for your environment)
    DRIVE_PATH = "/content/drive/MyDrive/crop_insurance"  # Google Drive mount
    DATASET_DIR = f"{DRIVE_PATH}/dataset"
    TRAIN_IMG_DIR = f"{DATASET_DIR}/train"
    TEST_IMG_DIR = f"{DATASET_DIR}/test"
    
    # Output
    OUTPUT_DIR = "outputs"
    MODELS_DIR = f"{OUTPUT_DIR}/models"
    RESULTS_DIR = f"{OUTPUT_DIR}/results"
    
    # Training settings
    SEED = 1032
    N_FOLDS = 3
    SAMPLE_SIZE = 1000  # Use 1000 images for faster training
    
    # Model hyperparameters
    BATCH_SIZE = 16
    IMG_SIZE = 384
    EPOCHS = 10
    LEARNING_RATE = 2e-4
    NUM_WORKERS = 4
    PATIENCE = 3
    
    # Model architecture
    BACKBONE = 'convnext_base.fb_in22k'
    
    # Damage categories
    DAMAGE_CLASSES = ['DR', 'G', 'ND', 'WD', 'other']
    
    # Area calculation
    PIXEL_TO_M2 = 0.01  # Rough estimate: 0.01 m² per pixel
    OVERLAP_THRESHOLD = 0.3  # 30% feature similarity = potential overlap

# Create directories
os.makedirs(Config.OUTPUT_DIR, exist_ok=True)
os.makedirs(Config.MODELS_DIR, exist_ok=True)
os.makedirs(Config.RESULTS_DIR, exist_ok=True)


# --- Cell 4 ---

# Set random seeds
def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

set_seed(Config.SEED)


# --- Cell 5 ---

# ============================================================================
# DATA LOADING & PREPROCESSING
# ============================================================================

def load_and_sample_data(train_csv_path: str, sample_size: int = 1000):
    """Load Train.csv and sample images for faster training"""
    df = pd.read_csv(train_csv_path)
    
    print(f"[DATA] Original dataset size: {len(df)}")
    print(f"[DATA] Columns: {df.columns.tolist()}")
    print(f"[DATA] Damage distribution:\n{df['damage'].value_counts()}")
    
    # Sample stratified by damage type
    if sample_size < len(df):
        df_sampled = df.groupby('damage', group_keys=False).apply(
            lambda x: x.sample(min(len(x), sample_size // len(df['damage'].unique())), 
                             random_state=Config.SEED)
        ).reset_index(drop=True)
    else:
        df_sampled = df
    
    print(f"[DATA] Sampled dataset size: {len(df_sampled)}")
    print(f"[DATA] Sampled damage distribution:\n{df_sampled['damage'].value_counts()}")
    
    return df_sampled


# --- Cell 6 ---

def prepare_multilabel_targets(df: pd.DataFrame):
    """Convert damage labels to multi-label binary encoding"""
    df = df.copy()
    
    # Create binary columns for each damage type
    for damage_type in Config.DAMAGE_CLASSES:
        df[damage_type] = 0
    
    # Set the corresponding damage column to 1
    for idx, row in df.iterrows():
        damage = row['damage']
        if damage in Config.DAMAGE_CLASSES:
            df.at[idx, damage] = 1
    
    return df


# --- Cell 7 ---

# ============================================================================
# VISUAL HEALTH INDEX (GPS-Free Mapping Alternative)
# ============================================================================

class VisualHealthAnalyzer:
    """Analyzes visual features of each image to estimate health without GPS"""
    
    @staticmethod
    def calculate_vegetation_index(img_rgb: np.ndarray) -> float:
        """Calculate ExG (Excess Green Index)"""
        b, g, r = cv2.split(img_rgb)
        b, g, r = b.astype(np.float32), g.astype(np.float32), r.astype(np.float32)
        sum_rgb = r + g + b + 1e-6
        g_norm, r_norm, b_norm = g / sum_rgb, r / sum_rgb, b / sum_rgb
        exg = 2 * g_norm - r_norm - b_norm
        return float(exg.mean())
    
    @staticmethod
    def calculate_brown_stress_index(img_rgb: np.ndarray) -> float:
        """Calculate ExR (Excess Red Index) for brown/stressed areas"""
        b, g, r = cv2.split(img_rgb)
        b, g, r = b.astype(np.float32), g.astype(np.float32), r.astype(np.float32)
        sum_rgb = r + g + b + 1e-6
        r_norm, g_norm = r / sum_rgb, g / sum_rgb
        exr = 1.4 * r_norm - g_norm
        return float(exr.mean())
    
    @staticmethod
    def calculate_soil_ratio(img_rgb: np.ndarray) -> float:
        """Estimate visible soil (bare patches)"""
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        # Soil is typically medium brightness
        soil_mask = ((gray > 80) & (gray < 160)).astype(np.uint8) * 255
        return float(soil_mask.sum() / (gray.shape[0] * gray.shape[1] * 255))
    
    @staticmethod
    def calculate_color_variance(img_rgb: np.ndarray) -> float:
        """High variance = inconsistent growth/damage patterns"""
        return float(np.std(img_rgb))
    
    @staticmethod
    def analyze_image(img_path: str) -> Dict:
        """Complete visual health analysis"""
        img = cv2.imread(img_path)
        if img is None:
            return None
        
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        return {
            'vegetation_index': VisualHealthAnalyzer.calculate_vegetation_index(img_rgb),
            'brown_stress_index': VisualHealthAnalyzer.calculate_brown_stress_index(img_rgb),
            'soil_ratio': VisualHealthAnalyzer.calculate_soil_ratio(img_rgb),
            'color_variance': VisualHealthAnalyzer.calculate_color_variance(img_rgb),
        }


# --- Cell 8 ---

def add_visual_features(df: pd.DataFrame, img_dir: str):
    """Add visual health features to dataframe"""
    print("[FEATURES] Calculating visual health indices...")
    
    features = []
    for idx, row in tqdm(df.iterrows(), total=len(df)):
        img_path = os.path.join(img_dir, row['filename'])
        visual_data = VisualHealthAnalyzer.analyze_image(img_path)
        
        if visual_data:
            features.append(visual_data)
        else:
            # Default values if image fails
            features.append({
                'vegetation_index': 0.0,
                'brown_stress_index': 0.0,
                'soil_ratio': 0.0,
                'color_variance': 0.0,
            })
    
    features_df = pd.DataFrame(features)
    df = pd.concat([df.reset_index(drop=True), features_df], axis=1)
    
    print("[FEATURES] Visual features added:")
    print(features_df.describe())
    
    return df


# --- Cell 9 ---

# ============================================================================
# OVERLAP DETECTION (Replaces GPS Distance Calculation)
# ============================================================================

class OverlapDetector:
    """Detects if consecutive images might overlap based on visual similarity"""
    
    @staticmethod
    def extract_features(img: np.ndarray) -> np.ndarray:
        """Extract ORB features for matching"""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        orb = cv2.ORB_create(nfeatures=500)
        keypoints, descriptors = orb.detectAndCompute(gray, None)
        return descriptors
    
    @staticmethod
    def calculate_overlap(img1_path: str, img2_path: str) -> float:
        """Calculate feature-based overlap between two images"""
        img1 = cv2.imread(img1_path)
        img2 = cv2.imread(img2_path)
        
        if img1 is None or img2 is None:
            return 0.0
        
        desc1 = OverlapDetector.extract_features(img1)
        desc2 = OverlapDetector.extract_features(img2)
        
        if desc1 is None or desc2 is None:
            return 0.0
        
        # Use BFMatcher to find matches
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = bf.match(desc1, desc2)
        
        # Overlap ratio = matches / min(features in both images)
        overlap = len(matches) / min(len(desc1), len(desc2))
        return min(overlap, 1.0)


# --- Cell 10 ---

# ============================================================================
# SEGMENTATION FOR AREA CALCULATION
# ============================================================================

class DamageSegmentationModel:
    """Segment damaged areas for precise area calculation"""
    
    def __init__(self):
        if SEGFORMER_AVAILABLE:
            self.processor = SegformerImageProcessor.from_pretrained(
                "nvidia/segformer-b0-finetuned-ade-512-512"
            )
            self.model = SegformerForSemanticSegmentation.from_pretrained(
                "nvidia/segformer-b0-finetuned-ade-512-512"
            )
            self.use_segformer = True
        else:
            self.use_segformer = False
    
    def segment_damaged_area(self, img_path: str, damage_type: str = 'all') -> Tuple[np.ndarray, float]:
        """
        Segment and calculate damaged area
        Returns: (segmentation_mask, area_ratio)
        """
        img = cv2.imread(img_path)
        if img is None:
            return None, 0.0
        
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        if self.use_segformer:
            # Use Segformer for advanced segmentation
            inputs = self.processor(images=img_rgb, return_tensors="pt")
            outputs = self.model(**inputs)
            logits = outputs.logits
            mask = logits.argmax(dim=1)[0].cpu().numpy()
        else:
            # Fallback: Rule-based segmentation
            mask = self._rule_based_segmentation(img_rgb, damage_type)
        
        # Calculate area ratio
        total_pixels = mask.shape[0] * mask.shape[1]
        damaged_pixels = np.sum(mask > 0)
        area_ratio = damaged_pixels / total_pixels
        
        return mask, area_ratio
    
    def _rule_based_segmentation(self, img_rgb: np.ndarray, damage_type: str) -> np.ndarray:
        """Fallback rule-based segmentation"""
        h, w = img_rgb.shape[:2]
        mask = np.zeros((h, w), dtype=np.uint8)
        
        # Vegetation mask
        b, g, r = cv2.split(img_rgb)
        vegetation = (g > r) & (g > b) & (g > 80)
        
        if damage_type in ['DR', 'brown', 'all']:
            # Brown/drought areas
            brown = (r > g) & (r > 100) & (g < 150)
            mask[brown] = 1
        
        if damage_type in ['ND', 'yellow', 'all']:
            # Yellow/nutrient deficient
            yellow = (r > 150) & (g > 150) & (b < 100)
            mask[yellow] = 2
        
        if damage_type in ['WD', 'weed', 'all']:
            # Excess green/weeds
            excess_green = (g > 150) & (g > r + 30)
            mask[excess_green] = 3
        
        if damage_type in ['soil', 'gap', 'all']:
            # Bare soil
            gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
            soil = ((gray > 80) & (gray < 160) & (~vegetation))
            mask[soil] = 4
        
        return mask


# --- Cell 11 ---

# ============================================================================
# DATASET
# ============================================================================

class CropDamageDataset(Dataset):
    """Dataset for multi-label crop damage classification"""
    
    def __init__(self, df: pd.DataFrame, img_dir: str, transform=None, is_test=False):
        self.df = df.reset_index(drop=True)
        self.img_dir = img_dir
        self.transform = transform
        self.is_test = is_test
        self.damage_cols = Config.DAMAGE_CLASSES
    
    def __len__(self):
        return len(self.df)
    
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = os.path.join(self.img_dir, row['filename'])
        
        # Load image
        img = Image.open(img_path).convert('RGB')
        
        if self.transform:
            img = self.transform(img)
        
        if self.is_test:
            return img, row['ID']
        else:
            # Multi-label targets
            labels = torch.tensor([row[col] for col in self.damage_cols], dtype=torch.float32)
            return img, labels


# --- Cell 12 ---

def get_transforms(is_train=True):
    """Get image transforms"""
    if is_train:
        return transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
    else:
        return transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])


# --- Cell 13 ---

# ============================================================================
# MODEL
# ============================================================================

class CropDamageModel(nn.Module):
    """Multi-label classification model with area estimation"""
    
    def __init__(self, num_classes=5, pretrained=True):
        super().__init__()
        
        # Backbone
        self.backbone = timm.create_model(
            Config.BACKBONE,
            pretrained=pretrained,
            num_classes=0,  # Remove classification head
            global_pool='avg'
        )
        
        # Get feature dimension
        with torch.no_grad():
            dummy_input = torch.randn(1, 3, Config.IMG_SIZE, Config.IMG_SIZE)
            features = self.backbone(dummy_input)
            feature_dim = features.shape[1]
        
        # Classification head
        self.classifier = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feature_dim, 512),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(512, num_classes)
        )
        
        # Area estimation head (optional - predicts damage percentage)
        self.area_estimator = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feature_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 1),
            nn.Sigmoid()  # Output between 0-1 (percentage)
        )
    
    def forward(self, x):
        features = self.backbone(x)
        class_logits = self.classifier(features)
        area_pred = self.area_estimator(features)
        return class_logits, area_pred


# --- Cell 14 ---

# ============================================================================
# TRAINING
# ============================================================================

class Trainer:
    def __init__(self, model, device):
        self.model = model.to(device)
        self.device = device
        self.best_loss = float('inf')
    
    def train_epoch(self, dataloader, optimizer, criterion):
        self.model.train()
        total_loss = 0
        
        for images, labels in tqdm(dataloader, desc="Training"):
            images = images.to(self.device)
            labels = labels.to(self.device)
            
            optimizer.zero_grad()
            
            class_logits, area_pred = self.model(images)
            
            # Multi-label classification loss
            loss = criterion(class_logits, labels)
            
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
        
        return total_loss / len(dataloader)
    
    def validate(self, dataloader, criterion):
        self.model.eval()
        total_loss = 0
        all_preds = []
        all_labels = []
        
        with torch.no_grad():
            for images, labels in tqdm(dataloader, desc="Validation"):
                images = images.to(self.device)
                labels = labels.to(self.device)
                
                class_logits, area_pred = self.model(images)
                
                loss = criterion(class_logits, labels)
                total_loss += loss.item()
                
                preds = torch.sigmoid(class_logits)
                all_preds.append(preds.cpu().numpy())
                all_labels.append(labels.cpu().numpy())
        
        all_preds = np.vstack(all_preds)
        all_labels = np.vstack(all_labels)
        
        return total_loss / len(dataloader), all_preds, all_labels


# --- Cell 15 ---

def train_model(train_df: pd.DataFrame, img_dir: str, fold: int):
    """Train model for one fold"""
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"\n[FOLD {fold}] Training on {device}")
    
    # Split data
    train_fold = train_df[train_df['fold'] != fold].reset_index(drop=True)
    val_fold = train_df[train_df['fold'] == fold].reset_index(drop=True)
    
    print(f"Train size: {len(train_fold)}, Val size: {len(val_fold)}")
    
    # Datasets
    train_dataset = CropDamageDataset(train_fold, img_dir, get_transforms(True))
    val_dataset = CropDamageDataset(val_fold, img_dir, get_transforms(False))
    
    train_loader = DataLoader(train_dataset, batch_size=Config.BATCH_SIZE, 
                             shuffle=True, num_workers=Config.NUM_WORKERS)
    val_loader = DataLoader(val_dataset, batch_size=Config.BATCH_SIZE, 
                           shuffle=False, num_workers=Config.NUM_WORKERS)
    
    # Model
    model = CropDamageModel(num_classes=len(Config.DAMAGE_CLASSES))
    trainer = Trainer(model, device)
    
    # Loss & Optimizer
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=Config.LEARNING_RATE)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=Config.EPOCHS)
    
    # Training loop
    best_val_loss = float('inf')
    patience_counter = 0
    
    for epoch in range(Config.EPOCHS):
        print(f"\n[Epoch {epoch+1}/{Config.EPOCHS}]")
        
        train_loss = trainer.train_epoch(train_loader, optimizer, criterion)
        val_loss, val_preds, val_labels = trainer.validate(val_loader, criterion)
        
        scheduler.step()
        
        print(f"Train Loss: {train_loss:.4f}, Val Loss: {val_loss:.4f}")
        
        # Early stopping
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            # Save best model
            torch.save(model.state_dict(), 
                      f"{Config.MODELS_DIR}/model_fold{fold}_best.pth")
        else:
            patience_counter += 1
            if patience_counter >= Config.PATIENCE:
                print(f"Early stopping at epoch {epoch+1}")
                break
    
    return model

# ============================================================================
# INFERENCE & AREA CALCULATION
# ============================================================================


# --- Cell 16 ---

def predict_with_area_estimation(model, test_df: pd.DataFrame, img_dir: str, device):
    """Generate predictions with area calculations"""
    model.eval()
    segmenter = DamageSegmentationModel()
    
    predictions = []
    area_results = []
    
    test_dataset = CropDamageDataset(test_df, img_dir, get_transforms(False), is_test=True)
    test_loader = DataLoader(test_dataset, batch_size=Config.BATCH_SIZE, 
                            shuffle=False, num_workers=Config.NUM_WORKERS)
    
    with torch.no_grad():
        for images, image_ids in tqdm(test_loader, desc="Prediction"):
            images = images.to(device)
            
            class_logits, area_pred = model(images)
            probs = torch.sigmoid(class_logits).cpu().numpy()
            areas = area_pred.cpu().numpy()
            
            predictions.extend(probs)
            
            # Per-image area calculation
            for idx, img_id in enumerate(image_ids):
                row = test_df[test_df['ID'] == img_id].iloc[0]
                img_path = os.path.join(img_dir, row['filename'])
                
                mask, area_ratio = segmenter.segment_damaged_area(img_path)
                
                area_results.append({
                    'ID': img_id,
                    'predicted_damage_area_ratio': float(areas[idx][0]),
                    'segmented_damage_area_ratio': area_ratio,
                    'estimated_area_m2': area_ratio * (Config.IMG_SIZE ** 2) * Config.PIXEL_TO_M2
                })
    
    return np.array(predictions), area_results


# --- Cell 17 ---

# ============================================================================
# MAIN PIPELINE
# ============================================================================

def main():
    print("\n" + "="*60)
    print("CROP DAMAGE INSURANCE ASSESSMENT")
    print("="*60)
    
    # 1. Load data
    print("\n[STEP 1] Loading data...")
    train_df = load_and_sample_data(
        f"{Config.DATASET_DIR}/Train.csv",
        sample_size=Config.SAMPLE_SIZE
    )
    
    # 2. Prepare multi-label targets
    print("\n[STEP 2] Preparing targets...")
    train_df = prepare_multilabel_targets(train_df)
    
    # 3. Add visual features
    print("\n[STEP 3] Extracting visual features...")
    train_df = add_visual_features(train_df, Config.TRAIN_IMG_DIR)
    
    # 4. Create folds
    print("\n[STEP 4] Creating folds...")
    skf = StratifiedKFold(n_splits=Config.N_FOLDS, shuffle=True, random_state=Config.SEED)
    train_df['fold'] = -1
    
    for fold, (_, val_idx) in enumerate(skf.split(train_df, train_df['damage'])):
        train_df.loc[val_idx, 'fold'] = fold
    
    print(train_df.groupby(['fold', 'damage']).size())
    
    # 5. Train models
    print("\n[STEP 5] Training models...")
    models = []
    for fold in range(Config.N_FOLDS):
        model = train_model(train_df, Config.TRAIN_IMG_DIR, fold)
        models.append(model)
    
    # 6. Load test data and predict
    print("\n[STEP 6] Generating predictions...")
    test_df = pd.read_csv(f"{Config.DATASET_DIR}/Test.csv")
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    all_predictions = []
    all_areas = []
    
    for fold, model in enumerate(models):
        print(f"\n[FOLD {fold}] Predicting...")
        preds, areas = predict_with_area_estimation(model, test_df, Config.TEST_IMG_DIR, device)
        all_predictions.append(preds)
        all_areas.extend(areas)
    
    # 7. Ensemble predictions
    print("\n[STEP 7] Ensembling...")
    final_predictions = np.mean(all_predictions, axis=0)
    
    # 8. Create submission
    print("\n[STEP 8] Creating submission...")
    submission = pd.DataFrame({
        'ID': test_df['ID'],
        **{damage: final_predictions[:, i] for i, damage in enumerate(Config.DAMAGE_CLASSES)}
    })
    
    submission.to_csv(f"{Config.RESULTS_DIR}/submission.csv", index=False)
    
    # 9. Save area calculations
    areas_df = pd.DataFrame(all_areas)
    areas_df.to_csv(f"{Config.RESULTS_DIR}/area_calculations.csv", index=False)
    
    # 10. Aggregate results
    print("\n[STEP 9] Calculating total damaged area...")
    total_damaged_area = areas_df['estimated_area_m2'].sum()
    total_images = len(areas_df)
    avg_damage_ratio = areas_df['segmented_damage_area_ratio'].mean()
    
    summary = {
        'total_images_processed': total_images,
        'total_estimated_damaged_area_m2': float(total_damaged_area),
        'total_estimated_damaged_area_acres': float(total_damaged_area / 4046.86),
        'average_damage_ratio': float(avg_damage_ratio),
        'damage_distribution': submission[Config.DAMAGE_CLASSES].mean().to_dict()
    }
    
    with open(f"{Config.RESULTS_DIR}/summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    
    print("\n" + "="*60)
    print("RESULTS SUMMARY")
    print("="*60)
    print(f"Total images: {total_images}")
    print(f"Total damaged area: {total_damaged_area:.2f} m² ({total_damaged_area/4046.86:.4f} acres)")
    print(f"Average damage ratio: {avg_damage_ratio:.2%}")
    print("\nDamage type distribution:")
    for damage_type, prob in summary['damage_distribution'].items():
        print(f"  {damage_type} ({DAMAGE_CATEGORIES.get(damage_type, damage_type)}): {prob:.2%}")
    print("="*60)
    
    print(f"\nFiles saved:")
    print(f"  - {Config.RESULTS_DIR}/submission.csv")
    print(f"  - {Config.RESULTS_DIR}/area_calculations.csv")
    print(f"  - {Config.RESULTS_DIR}/summary.json")

if __name__ == "__main__":
    # Mount Google Drive (if using Colab)
    try:
        from google.colab import drive
        drive.mount('/content/drive')
    except:
        print("Not running in Colab")
    
    main()


# --- Cell 18 ---

# ============================================================================
# ADDITIONAL UTILITIES
# ============================================================================

def analyze_overlaps(df: pd.DataFrame, img_dir: str, max_pairs: int = 100):
    """Analyze potential overlaps between consecutive images"""
    print("\n[OVERLAP ANALYSIS] Checking image overlaps...")
    
    overlaps = []
    detector = OverlapDetector()
    
    for i in range(min(len(df) - 1, max_pairs)):
        img1_path = os.path.join(img_dir, df.iloc[i]['filename'])
        img2_path = os.path.join(img_dir, df.iloc[i+1]['filename'])
        
        overlap = detector.calculate_overlap(img1_path, img2_path)
        
        if overlap > Config.OVERLAP_THRESHOLD:
            overlaps.append({
                'image1': df.iloc[i]['filename'],
                'image2': df.iloc[i+1]['filename'],
                'overlap_ratio': overlap
            })
    
    print(f"Found {len(overlaps)} potential overlapping pairs")
    
    if overlaps:
        overlaps_df = pd.DataFrame(overlaps)

# --- Cell 19 ---
    
    def segment_damaged_area(self, img_path: str, damage_type: str = 'all') -> Tuple[np.ndarray, float]:
        """
        Segment and calculate damaged area
        Returns: (segmentation_mask, area_ratio)
        """
        img = cv2.imread(img_path)
        if img is None:
            return None, 0.0
        
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        if self.use_segformer:
            # Use Segformer for advanced segmentation
            inputs = self.processor(images=img_rgb, return_tensors="pt")
            outputs = self.model(**inputs)
            logits = outputs.logits
            mask = logits.argmax(dim=1)[0].cpu().numpy()
        else:
            # Fallback: Rule-based segmentation
            mask = self._rule_based_segmentation(img_rgb, damage_type)
        
        # Calculate area ratio
        total_pixels = mask.shape[0] * mask.shape[1]
        damaged_pixels = np.sum(mask > 0)
        area_ratio = damaged_pixels / total_pixels
        
        return mask, area_ratio
    
    def _rule_based_segmentation(self, img_rgb: np.ndarray, damage_type: str) -> np.ndarray:
        """Fallback rule-based segmentation"""
        h, w = img_rgb.shape[:2]
        mask = np.zeros((h, w), dtype=np.uint8)
        
        # Vegetation mask
        b, g, r = cv2.split(img_rgb)
        vegetation = (g > r) & (g > b) & (g > 80)
        
        if damage_type in ['DR', 'brown', 'all']:
            # Brown/drought areas
            brown = (r > g) & (r > 100) & (g < 150)
            mask[brown] = 1
        
        if damage_type in ['ND', 'yellow', 'all']:
            # Yellow/nutrient deficient
            yellow = (r > 150) & (g > 150) & (b < 100)
            mask[yellow] = 2
        
        if damage_type in ['WD', 'weed', 'all']:
            # Excess green/weeds
            excess_green = (g > 150) & (g > r + 30)
            mask[excess_green] = 3
        
        if damage_type in ['soil', 'gap', 'all']:
            # Bare soil
            gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
            soil = ((gray > 80) & (gray < 160) & (~vegetation))
            mask[soil] = 4
        
        return mask

# ============================================================================
# DATASET
# ============================================================================


# --- Cell 20 ---

class CropDamageDataset(Dataset):
    """Dataset for multi-label crop damage classification"""
    
    def __init__(self, df: pd.DataFrame, img_dir: str, transform=None, is_test=False):
        self.df = df.reset_index(drop=True)
        self.img_dir = img_dir
        self.transform = transform
        self.is_test = is_test
        self.damage_cols = Config.DAMAGE_CLASSES
    
    def __len__(self):
        return len(self.df)
    
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = os.path.join(self.img_dir, row['filename'])
        
        # Load image
        img = Image.open(img_path).convert('RGB')
        
        if self.transform:
            img = self.transform(img)
        
        if self.is_test:
            return img, row['ID']
        else:
            # Multi-label targets
            labels = torch.tensor([row[col] for col in self.damage_cols], dtype=torch.float32)
            return img, labels


# --- Cell 21 ---

def get_transforms(is_train=True):
    """Get image transforms"""
    if is_train:
        return transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
    else:
        return transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])

# ============================================================================
# MODEL
# ============================================================================


# --- Cell 22 ---

class CropDamageModel(nn.Module):
    """Multi-label classification model with area estimation"""
    
    def __init__(self, num_classes=5, pretrained=True):
        super().__init__()
        
        # Backbone
        self.backbone = timm.create_model(
            Config.BACKBONE,
            pretrained=pretrained,
            num_classes=0,  # Remove classification head
            global_pool='avg'
        )
        
        # Get feature dimension
        with torch.no_grad():
            dummy_input = torch.randn(1, 3, Config.IMG_SIZE, Config.IMG_SIZE)
            features = self.backbone(dummy_input)
            feature_dim = features.shape[1]
        
        # Classification head
        self.classifier = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feature_dim, 512),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(512, num_classes)
        )
        
        # Area estimation head (optional - predicts damage percentage)
        self.area_estimator = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feature_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 1),
            nn.Sigmoid()  # Output between 0-1 (percentage)
        )
    
    def forward(self, x):
        features = self.backbone(x)
        class_logits = self.classifier(features)
        area_pred = self.area_estimator(features)
        return class_logits, area_pred

# ============================================================================
# TRAINING
# ============================================================================


# --- Cell 23 ---

class Trainer:
    def __init__(self, model, device):
        self.model = model.to(device)
        self.device = device
        self.best_loss = float('inf')
    
    def train_epoch(self, dataloader, optimizer, criterion):
        self.model.train()
        total_loss = 0
        
        for images, labels in tqdm(dataloader, desc="Training"):
            images = images.to(self.device)
            labels = labels.to(self.device)
            
            optimizer.zero_grad()
            
            class_logits, area_pred = self.model(images)
            
            # Multi-label classification loss
            loss = criterion(class_logits, labels)
            
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
        
        return total_loss / len(dataloader)
    
    def validate(self, dataloader, criterion):
        self.model.eval()
        total_loss = 0
        all_preds = []
        all_labels = []
        
        with torch.no_grad():
            for images, labels in tqdm(dataloader, desc="Validation"):
                images = images.to(self.device)
                labels = labels.to(self.device)
                
                class_logits, area_pred = self.model(images)
                
                loss = criterion(class_logits, labels)
                total_loss += loss.item()
                
                preds = torch.sigmoid(class_logits)
                all_preds.append(preds.cpu().numpy())
                all_labels.append(labels.cpu().numpy())
        
        all_preds = np.vstack(all_preds)
        all_labels = np.vstack(all_labels)
        
        return total_loss / len(dataloader), all_preds, all_labels


# --- Cell 24 ---

def train_model(train_df: pd.DataFrame, img_dir: str, fold: int):
    """Train model for one fold"""
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"\n[FOLD {fold}] Training on {device}")
    
    # Split data
    train_fold = train_df[train_df['fold'] != fold].reset_index(drop=True)
    val_fold = train_df[train_df['fold'] == fold].reset_index(drop=True)
    
    print(f"Train size: {len(train_fold)}, Val size: {len(val_fold)}")
    
    # Datasets
    train_dataset = CropDamageDataset(train_fold, img_dir, get_transforms(True))
    val_dataset = CropDamageDataset(val_fold, img_dir, get_transforms(False))
    
    train_loader = DataLoader(train_dataset, batch_size=Config.BATCH_SIZE, 
                             shuffle=True, num_workers=Config.NUM_WORKERS)
    val_loader = DataLoader(val_dataset, batch_size=Config.BATCH_SIZE, 
                           shuffle=False, num_workers=Config.NUM_WORKERS)
    
    # Model
    model = CropDamageModel(num_classes=len(Config.DAMAGE_CLASSES))
    trainer = Trainer(model, device)
    
    # Loss & Optimizer
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=Config.LEARNING_RATE)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=Config.EPOCHS)
    
    # Training loop
    best_val_loss = float('inf')
    patience_counter = 0
    
    for epoch in range(Config.EPOCHS):
        print(f"\n[Epoch {epoch+1}/{Config.EPOCHS}]")
        
        train_loss = trainer.train_epoch(train_loader, optimizer, criterion)
        val_loss, val_preds, val_labels = trainer.validate(val_loader, criterion)
        
        scheduler.step()
        
        print(f"Train Loss: {train_loss:.4f}, Val Loss: {val_loss:.4f}")
        
        # Early stopping
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            # Save best model
            torch.save(model.state_dict(), 
                      f"{Config.MODELS_DIR}/model_fold{fold}_best.pth")
        else:
            patience_counter += 1
            if patience_counter >= Config.PATIENCE:
                print(f"Early stopping at epoch {epoch+1}")
                break
    
    return model


# --- Cell 25 ---

# ============================================================================
# INFERENCE & AREA CALCULATION
# ============================================================================

def predict_with_area_estimation(model, test_df: pd.DataFrame, img_dir: str, device):
    """Generate predictions with area calculations"""
    model.eval()
    segmenter = DamageSegmentationModel()
    
    predictions = []
    area_results = []
    
    test_dataset = CropDamageDataset(test_df, img_dir, get_transforms(False), is_test=True)
    test_loader = DataLoader(test_dataset, batch_size=Config.BATCH_SIZE, 
                            shuffle=False, num_workers=Config.NUM_WORKERS)
    
    with torch.no_grad():
        for images, image_ids in tqdm(test_loader, desc="Prediction"):
            images = images.to(device)
            
            class_logits, area_pred = model(images)
            probs = torch.sigmoid(class_logits).cpu().numpy()
            areas = area_pred.cpu().numpy()
            
            predictions.extend(probs)
            
            # Per-image area calculation
            for idx, img_id in enumerate(image_ids):
                row = test_df[test_df['ID'] == img_id].iloc[0]
                img_path = os.path.join(img_dir, row['filename'])
                
                mask, area_ratio = segmenter.segment_damaged_area(img_path)
                
                area_results.append({
                    'ID': img_id,
                    'predicted_damage_area_ratio': float(areas[idx][0]),
                    'segmented_damage_area_ratio': area_ratio,
                    'estimated_area_m2': area_ratio * (Config.IMG_SIZE ** 2) * Config.PIXEL_TO_M2
                })
    
    return np.array(predictions), area_results


# --- Cell 26 ---

# ============================================================================
# MAIN PIPELINE
# ============================================================================

def main():
    print("\n" + "="*60)
    print("CROP DAMAGE INSURANCE ASSESSMENT")
    print("="*60)
    
    # 1. Load data
    print("\n[STEP 1] Loading data...")
    train_df = load_and_sample_data(
        f"{Config.DATASET_DIR}/Train.csv",
        sample_size=Config.SAMPLE_SIZE
    )
    
    # 2. Prepare multi-label targets
    print("\n[STEP 2] Preparing targets...")
    train_df = prepare_multilabel_targets(train_df)
    
    # 3. Add visual features
    print("\n[STEP 3] Extracting visual features...")
    train_df = add_visual_features(train_df, Config.TRAIN_IMG_DIR)
    
    # 4. Create folds
    print("\n[STEP 4] Creating folds...")
    skf = StratifiedKFold(n_splits=Config.N_FOLDS, shuffle=True, random_state=Config.SEED)
    train_df['fold'] = -1
    
    for fold, (_, val_idx) in enumerate(skf.split(train_df, train_df['damage'])):
        train_df.loc[val_idx, 'fold'] = fold
    
    print(train_df.groupby(['fold', 'damage']).size())
    
    # 5. Train models
    print("\n[STEP 5] Training models...")
    models = []
    for fold in range(Config.N_FOLDS):
        model = train_model(train_df, Config.TRAIN_IMG_DIR, fold)
        models.append(model)
    
    # 6. Load test data and predict
    print("\n[STEP 6] Generating predictions...")
    test_df = pd.read_csv(f"{Config.DATASET_DIR}/Test.csv")
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    all_predictions = []
    all_areas = []
    
    for fold, model in enumerate(models):
        print(f"\n[FOLD {fold}] Predicting...")
        preds, areas = predict_with_area_estimation(model, test_df, Config.TEST_IMG_DIR, device)
        all_predictions.append(preds)
        all_areas.extend(areas)
    
    # 7. Ensemble predictions
    print("\n[STEP 7] Ensembling...")
    final_predictions = np.mean(all_predictions, axis=0)
    
    # 8. Create submission
    print("\n[STEP 8] Creating submission...")
    submission = pd.DataFrame({
        'ID': test_df['ID'],
        **{damage: final_predictions[:, i] for i, damage in enumerate(Config.DAMAGE_CLASSES)}
    })
    
    submission.to_csv(f"{Config.RESULTS_DIR}/submission.csv", index=False)
    
    # 9. Save area calculations
    areas_df = pd.DataFrame(all_areas)
    areas_df.to_csv(f"{Config.RESULTS_DIR}/area_calculations.csv", index=False)
    
    # 10. Aggregate results
    print("\n[STEP 9] Calculating total damaged area...")
    total_damaged_area = areas_df['estimated_area_m2'].sum()
    total_images = len(areas_df)
    avg_damage_ratio = areas_df['segmented_damage_area_ratio'].mean()
    
    summary = {
        'total_images_processed': total_images,
        'total_estimated_damaged_area_m2': float(total_damaged_area),
        'total_estimated_damaged_area_acres': float(total_damaged_area / 4046.86),
        'average_damage_ratio': float(avg_damage_ratio),
        'damage_distribution': submission[Config.DAMAGE_CLASSES].mean().to_dict()
    }
    
    with open(f"{Config.RESULTS_DIR}/summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    
    print("\n" + "="*60)
    print("RESULTS SUMMARY")
    print("="*60)
    print(f"Total images: {total_images}")
    print(f"Total damaged area: {total_damaged_area:.2f} m² ({total_damaged_area/4046.86:.4f} acres)")
    print(f"Average damage ratio: {avg_damage_ratio:.2%}")
    print("\nDamage type distribution:")
    for damage_type, prob in summary['damage_distribution'].items():
        print(f"  {damage_type} ({DAMAGE_CATEGORIES.get(damage_type, damage_type)}): {prob:.2%}")
    print("="*60)
    
    print(f"\nFiles saved:")
    print(f"  - {Config.RESULTS_DIR}/submission.csv")
    print(f"  - {Config.RESULTS_DIR}/area_calculations.csv")
    print(f"  - {Config.RESULTS_DIR}/summary.json")


# --- Cell 27 ---

if __name__ == "__main__":
    # Mount Google Drive (if using Colab)
    try:
        from google.colab import drive
        drive.mount('/content/drive')
    except:
        print("Not running in Colab")
    
    main()


# --- Cell 28 ---

# ============================================================================
# ADDITIONAL UTILITIES
# ============================================================================

def analyze_overlaps(df: pd.DataFrame, img_dir: str, max_pairs: int = 100):
    """Analyze potential overlaps between consecutive images"""
    print("\n[OVERLAP ANALYSIS] Checking image overlaps...")
    
    overlaps = []
    detector = OverlapDetector()
    
    for i in range(min(len(df) - 1, max_pairs)):
        img1_path = os.path.join(img_dir, df.iloc[i]['filename'])
        img2_path = os.path.join(img_dir, df.iloc[i+1]['filename'])
        
        overlap = detector.calculate_overlap(img1_path, img2_path)
        
        if overlap > Config.OVERLAP_THRESHOLD:
            overlaps.append({
                'image1': df.iloc[i]['filename'],
                'image2': df.iloc[i+1]['filename'],
                'overlap_ratio': overlap
            })
    
    print(f"Found {len(overlaps)} potential overlapping pairs")
    
    if overlaps:
        overlaps_df = pd.DataFrame(overlaps

# --- Cell 29 ---
    def _rule_based_segmentation(self, img_rgb: np.ndarray, damage_type: str) -> np.ndarray:
        """Fallback rule-based segmentation"""
        h, w = img_rgb.shape[:2]
        mask = np.zeros((h, w), dtype=np.uint8)
        
        # Vegetation mask
        b, g, r = cv2.split(img_rgb)
        vegetation = (g > r) & (g > b) & (g > 80)
        
        if damage_type in ['DR', 'brown', 'all']:
            # Brown/drought areas
            brown = (r > g) & (r > 100) & (g < 150)
            mask[brown] = 1
        
        if damage_type in ['ND', 'yellow', 'all']:
            # Yellow/nutrient deficient
            yellow = (r > 150) & (g > 150) & (b < 100)
            mask[yellow] = 2
        
        if damage_type in ['WD', 'weed', 'all']:
            # Excess green/weeds
            excess_green = (g > 150) & (g > r + 30)
            mask[excess_green] = 3
        
        if damage_type in ['soil', 'gap', 'all']:
            # Bare soil
            gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
            soil = ((gray > 80) & (gray < 160) & (~vegetation))
            mask[soil] = 4
        
        return mask


# --- Cell 30 ---

# ============================================================================
# DATASET
# ============================================================================

class CropDamageDataset(Dataset):
    """Dataset for multi-label crop damage classification"""
    
    def __init__(self, df: pd.DataFrame, img_dir: str, transform=None, is_test=False):
        self.df = df.reset_index(drop=True)
        self.img_dir = img_dir
        self.transform = transform
        self.is_test = is_test
        self.damage_cols = Config.DAMAGE_CLASSES
    
    def __len__(self):
        return len(self.df)
    
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = os.path.join(self.img_dir, row['filename'])
        
        # Load image
        img = Image.open(img_path).convert('RGB')
        
        if self.transform:
            img = self.transform(img)
        
        if self.is_test:
            return img, row['ID']
        else:
            # Multi-label targets
            labels = torch.tensor([row[col] for col in self.damage_cols], dtype=torch.float32)
            return img, labels

def get_transforms(is_train=True):
    """Get image transforms"""
    if is_train:
        return transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
    else:
        return transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])

# ============================================================================
# MODEL
# ============================================================================

class CropDamageModel(nn.Module):
    """Multi-label classification model with area estimation"""
    
    def __init__(self, num_classes=5, pretrained=True):
        super().__init__()
        
        # Backbone
        self.backbone = timm.create_model(
            Config.BACKBONE,
            pretrained=pretrained,
            num_classes=0,  # Remove classification head
            global_pool='avg'
        )
        
        # Get feature dimension
        with torch.no_grad():
            dummy_input = torch.randn(1, 3, Config.IMG_SIZE, Config.IMG_SIZE)
            features = self.backbone(dummy_input)
            feature_dim = features.shape[1]
        
        # Classification head
        self.classifier = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feature_dim, 512),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(512, num_classes)
        )
        
        # Area estimation head (optional - predicts damage percentage)
        self.area_estimator = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feature_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 1),
            nn.Sigmoid()  # Output between 0-1 (percentage)
        )
    
    def forward(self, x):
        features = self.backbone(x)
        class_logits = self.classifier(features)
        area_pred = self.area_estimator(features)
        return class_logits, area_pred

# ============================================================================
# TRAINING
# ============================================================================

class Trainer:
    def __init__(self, model, device):
        self.model = model.to(device)
        self.device = device
        self.best_loss = float('inf')
    
    def train_epoch(self, dataloader, optimizer, criterion):
        self.model.train()
        total_loss = 0
        
        for images, labels in tqdm(dataloader, desc="Training"):
            images = images.to(self.device)
            labels = labels.to(self.device)
            
            optimizer.zero_grad()
            
            class_logits, area_pred = self.model(images)
            
            # Multi-label classification loss
            loss = criterion(class_logits, labels)
            
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
        
        return total_loss / len(dataloader)
    
    def validate(self, dataloader, criterion):
        self.model.eval()
        total_loss = 0
        all_preds = []
        all_labels = []
        
        with torch.no_grad():
            for images, labels in tqdm(dataloader, desc="Validation"):
                images = images.to(self.device)
                labels = labels.to(self.device)
                
                class_logits, area_pred = self.model(images)
                
                loss = criterion(class_logits, labels)
                total_loss += loss.item()
                
                preds = torch.sigmoid(class_logits)
                all_preds.append(preds.cpu().numpy())
                all_labels.append(labels.cpu().numpy())
        
        all_preds = np.vstack(all_preds)
        all_labels = np.vstack(all_labels)
        
        return total_loss / len(dataloader), all_preds, all_labels

def train_model(train_df: pd.DataFrame, img_dir: str, fold: int):
    """Train model for one fold"""
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"\n[FOLD {fold}] Training on {device}")
    
    # Split data
    train_fold = train_df[train_df['fold'] != fold].reset_index(drop=True)
    val_fold = train_df[train_df['fold'] == fold].reset_index(drop=True)
    
    print(f"Train size: {len(train_fold)}, Val size: {len(val_fold)}")
    
    # Datasets
    train_dataset = CropDamageDataset(train_fold, img_dir, get_transforms(True))
    val_dataset = CropDamageDataset(val_fold, img_dir, get_transforms(False))
    
    train_loader = DataLoader(train_dataset, batch_size=Config.BATCH_SIZE, 
                             shuffle=True, num_workers=Config.NUM_WORKERS)
    val_loader = DataLoader(val_dataset, batch_size=Config.BATCH_SIZE, 
                           shuffle=False, num_workers=Config.NUM_WORKERS)
    
    # Model
    model = CropDamageModel(num_classes=len(Config.DAMAGE_CLASSES))
    trainer = Trainer(model, device)
    
    # Loss & Optimizer
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=Config.LEARNING_RATE)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=Config.EPOCHS)
    
    # Training loop
    best_val_loss = float('inf')
    patience_counter = 0
    
    for epoch in range(Config.EPOCHS):
        print(f"\n[Epoch {epoch+1}/{Config.EPOCHS}]")
        
        train_loss = trainer.train_epoch(train_loader, optimizer, criterion)
        val_loss, val_preds, val_labels = trainer.validate(val_loader, criterion)
        
        scheduler.step()
        
        print(f"Train Loss: {train_loss:.4f}, Val Loss: {val_loss:.4f}")
        
        # Early stopping
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            # Save best model
            torch.save(model.state_dict(), 
                      f"{Config.MODELS_DIR}/model_fold{fold}_best.pth")
        else:
            patience_counter += 1
            if patience_counter >= Config.PATIENCE:
                print(f"Early stopping at epoch {epoch+1}")
                break
    
    return model

# ============================================================================
# INFERENCE & AREA CALCULATION
# ============================================================================

def predict_with_area_estimation(model, test_df: pd.DataFrame, img_dir: str, device):
    """Generate predictions with area calculations"""
    model.eval()
    segmenter = DamageSegmentationModel()
    
    predictions = []
    area_results = []
    
    test_dataset = CropDamageDataset(test_df, img_dir, get_transforms(False), is_test=True)
    test_loader = DataLoader(test_dataset, batch_size=Config.BATCH_SIZE, 
                            shuffle=False, num_workers=Config.NUM_WORKERS)
    
    with torch.no_grad():
        for images, image_ids in tqdm(test_loader, desc="Prediction"):
            images = images.to(device)
            
            class_logits, area_pred = model(images)
            probs = torch.sigmoid(class_logits).cpu().numpy()
            areas = area_pred.cpu().numpy()
            
            predictions.extend(probs)
            
            # Per-image area calculation
            for idx, img_id in enumerate(image_ids):
                row = test_df[test_df['ID'] == img_id].iloc[0]
                img_path = os.path.join(img_dir, row['filename'])
                
                mask, area_ratio = segmenter.segment_damaged_area(img_path)
                
                area_results.append({
                    'ID': img_id,
                    'predicted_damage_area_ratio': float(areas[idx][0]),
                    'segmented_damage_area_ratio': area_ratio,
                    'estimated_area_m2': area_ratio * (Config.IMG_SIZE ** 2) * Config.PIXEL_TO_M2
                })
    
    return np.array(predictions), area_results

# ============================================================================
# MAIN PIPELINE
# ============================================================================

def main():
    print("\n" + "="*60)
    print("CROP DAMAGE INSURANCE ASSESSMENT")
    print("="*60)
    
    # 1. Load data
    print("\n[STEP 1] Loading data...")
    train_df = load_and_sample_data(
        f"{Config.DATASET_DIR}/Train.csv",
        sample_size=Config.SAMPLE_SIZE
    )
    
    # 2. Prepare multi-label targets
    print("\n[STEP 2] Preparing targets...")
    train_df = prepare_multilabel_targets(train_df)
    
    # 3. Add visual features
    print("\n[STEP 3] Extracting visual features...")
    train_df = add_visual_features(train_df, Config.TRAIN_IMG_DIR)
    
    # 4. Create folds
    print("\n[STEP 4] Creating folds...")
    skf = StratifiedKFold(n_splits=Config.N_FOLDS, shuffle=True, random_state=Config.SEED)
    train_df['fold'] = -1
    
    for fold, (_, val_idx) in enumerate(skf.split(train_df, train_df['damage'])):
        train_df.loc[val_idx, 'fold'] = fold
    
    print(train_df.groupby(['fold', 'damage']).size())
    
    # 5. Train models
    print("\n[STEP 5] Training models...")
    models = []
    for fold in range(Config.N_FOLDS):
        model = train_model(train_df, Config.TRAIN_IMG_DIR, fold)
        models.append(model)
    
    # 6. Load test data and predict
    print("\n[STEP 6] Generating predictions...")
    test_df = pd.read_csv(f"{Config.DATASET_DIR}/Test.csv")
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    all_predictions = []
    all_areas = []
    
    for fold, model in enumerate(models):
        print(f"\n[FOLD {fold}] Predicting...")
        preds, areas = predict_with_area_estimation(model, test_df, Config.TEST_IMG_DIR, device)
        all_predictions.append(preds)
        all_areas.extend(areas)
    
    # 7. Ensemble predictions
    print("\n[STEP 7] Ensembling...")
    final_predictions = np.mean(all_predictions, axis=0)
    
    # 8. Create submission
    print("\n[STEP 8] Creating submission...")
    submission = pd.DataFrame({
        'ID': test_df['ID'],
        **{damage: final_predictions[:, i] for i, damage in enumerate(Config.DAMAGE_CLASSES)}
    })
    
    submission.to_csv(f"{Config.RESULTS_DIR}/submission.csv", index=False)
    
    # 9. Save area calculations
    areas_df = pd.DataFrame(all_areas)
    areas_df.to_csv(f"{Config.RESULTS_DIR}/area_calculations.csv", index=False)
    
    # 10. Aggregate results
    print("\n[STEP 9] Calculating total damaged area...")
    total_damaged_area = areas_df['estimated_area_m2'].sum()
    total_images = len(areas_df)
    avg_damage_ratio = areas_df['segmented_damage_area_ratio'].mean()
    
    summary = {
        'total_images_processed': total_images,
        'total_estimated_damaged_area_m2': float(total_damaged_area),
        'total_estimated_damaged_area_acres': float(total_damaged_area / 4046.86),
        'average_damage_ratio': float(avg_damage_ratio),
        'damage_distribution': submission[Config.DAMAGE_CLASSES].mean().to_dict()
    }
    
    with open(f"{Config.RESULTS_DIR}/summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    
    print("\n" + "="*60)
    print("RESULTS SUMMARY")
    print("="*60)
    print(f"Total images: {total_images}")
    print(f"Total damaged area: {total_damaged_area:.2f} m² ({total_damaged_area/4046.86:.4f} acres)")
    print(f"Average damage ratio: {avg_damage_ratio:.2%}")
    print("\nDamage type distribution:")
    for damage_type, prob in summary['damage_distribution'].items():
        print(f"  {damage_type} ({DAMAGE_CATEGORIES.get(damage_type, damage_type)}): {prob:.2%}")
    print("="*60)
    
    print(f"\nFiles saved:")
    print(f"  - {Config.RESULTS_DIR}/submission.csv")
    print(f"  - {Config.RESULTS_DIR}/area_calculations.csv")
    print(f"  - {Config.RESULTS_DIR}/summary.json")

if __name__ == "__main__":
    # Mount Google Drive (if using Colab)
    try:
        from google.colab import drive
        drive.mount('/content/drive')
    except:
        print("Not running in Colab")
    
    main()

# ============================================================================
# ADDITIONAL UTILITIES
# ============================================================================

def analyze_overlaps(df: pd.DataFrame, img_dir: str, max_pairs: int = 100):
    """Analyze potential overlaps between consecutive images"""
    print("\n[OVERLAP ANALYSIS] Checking image overlaps...")
    
    overlaps = []
    detector = OverlapDetector()
    
    for i in range(min(len(df) - 1, max_pairs)):
        img1_path = os.path.join(img_dir, df.iloc[i]['filename'])
        img2_path = os.path.join(img_dir, df.iloc[i+1]['filename'])
        
        overlap = detector.calculate_overlap(img1_path, img2_path)
        
        if overlap > Config.OVERLAP_THRESHOLD:
            overlaps.append({
                'image1': df.iloc[i]['filename'],
                'image2': df.iloc[i+1]['filename'],
                'overlap_ratio': overlap
            })
    
    print(f"Found {len(overlaps)} potential overlapping pairs")
    
    if overlaps:
        overlaps_df = pd.DataFrame(overlaps

# --- Cell 31 ---
        }

def add_visual_features(df: pd.DataFrame, img_dir: str):
    """Add visual health features to dataframe"""
    print("[FEATURES] Calculating visual health indices...")
    
    features = []
    for idx, row in tqdm(df.iterrows(), total=len(df)):
        img_path = os.path.join(img_dir, row['filename'])
        visual_data = VisualHealthAnalyzer.analyze_image(img_path)
        
        if visual_data:
            features.append(visual_data)
        else:
            # Default values if image fails
            features.append({
                'vegetation_index': 0.0,
                'brown_stress_index': 0.0,
                'soil_ratio': 0.0,
                'color_variance': 0.0,
            })
    
    features_df = pd.DataFrame(features)
    df = pd.concat([df.reset_index(drop=True), features_df], axis=1)
    
    print("[FEATURES] Visual features added:")
    print(features_df.describe())
    
    return df

# ============================================================================
# OVERLAP DETECTION (Replaces GPS Distance Calculation)
# ============================================================================

class OverlapDetector:
    """Detects if consecutive images might overlap based on visual similarity"""
    
    @staticmethod
    def extract_features(img: np.ndarray) -> np.ndarray:
        """Extract ORB features for matching"""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        orb = cv2.ORB_create(nfeatures=500)
        keypoints, descriptors = orb.detectAndCompute(gray, None)
        return descriptors
    
    @staticmethod
    def calculate_overlap(img1_path: str, img2_path: str) -> float:
        """Calculate feature-based overlap between two images"""
        img1 = cv2.imread(img1_path)
        img2 = cv2.imread(img2_path)
        
        if img1 is None or img2 is None:
            return 0.0
        
        desc1 = OverlapDetector.extract_features(img1)
        desc2 = OverlapDetector.extract_features(img2)
        
        if desc1 is None or desc2 is None:
            return 0.0
        
        # Use BFMatcher to find matches
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = bf.match(desc1, desc2)
        
        # Overlap ratio = matches / min(features in both images)
        overlap = len(matches) / min(len(desc1), len(desc2))
        return min(overlap, 1.0)

# ============================================================================
# SEGMENTATION FOR AREA CALCULATION
# ============================================================================

class DamageSegmentationModel:
    """Segment damaged areas for precise area calculation"""
    
    def __init__(self):
        if SEGFORMER_AVAILABLE:
            self.processor = SegformerImageProcessor.from_pretrained(
                "nvidia/segformer-b0-finetuned-ade-512-512"
            )
            self.model = SegformerForSemanticSegmentation.from_pretrained(
                "nvidia/segformer-b0-finetuned-ade-512-512"
            )
            self.use_segformer = True
        else:
            self.use_segformer = False
    
    def segment_damaged_area(self, img_path: str, damage_type: str = 'all') -> Tuple[np.ndarray, float]:
        """
        Segment and calculate damaged area
        Returns: (segmentation_mask, area_ratio)
        """
        img = cv2.imread(img_path)
        if img is None:
            return None, 0.0
        
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        if self.use_segformer:
            # Use Segformer for advanced segmentation
            inputs = self.processor(images=img_rgb, return_tensors="pt")
            outputs = self.model(**inputs)
            logits = outputs.logits
            mask = logits.argmax(dim=1)[0].cpu().numpy()
        else:
            # Fallback: Rule-based segmentation
            mask = self._rule_based_segmentation(img_rgb, damage_type)
        
        # Calculate area ratio
        total_pixels = mask.shape[0] * mask.shape[1]
        damaged_pixels = np.sum(mask > 0)
        area_ratio = damaged_pixels / total_pixels
        
        return mask, area_ratio
    
    def _rule_based_segmentation(self, img_rgb: np.ndarray, damage_type: str) -> np.ndarray:
        """Fallback rule-based segmentation"""
        h, w = img_rgb.shape[:2]
        mask = np.zeros((h, w), dtype=np.uint8)
        
        # Vegetation mask
        b, g, r = cv2.split(img_rgb)
        vegetation = (g > r) & (g > b) & (g > 80)
        
        if damage_type in ['DR', 'brown', 'all']:
            # Brown/drought areas
            brown = (r > g) & (r > 100) & (g < 150)
            mask[brown] = 1
        
        if damage_type in ['ND', 'yellow', 'all']:
            # Yellow/nutrient deficient
            yellow = (r > 150) & (g > 150) & (b < 100)
            mask[yellow] = 2
        
        if damage_type in ['WD', 'weed', 'all']:
            # Excess green/weeds
            excess_green = (g > 150) & (g > r + 30)
            mask[excess_green] = 3
        
        if damage_type in ['soil', 'gap', 'all']:
            # Bare soil
            gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
            soil = ((gray > 80) & (gray < 160) & (~vegetation))
            mask[soil] = 4
        
        return mask

# ============================================================================
# DATASET
# ============================================================================

class CropDamageDataset(Dataset):
    """Dataset for multi-label crop damage classification"""
    
    def __init__(self, df: pd.DataFrame, img_dir: str, transform=None, is_test=False):
        self.df = df.reset_index(drop=True)
        self.img_dir = img_dir
        self.transform = transform
        self.is_test = is_test
        self.damage_cols = Config.DAMAGE_CLASSES
    
    def __len__(self):
        return len(self.df)
    
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = os.path.join(self.img_dir, row['filename'])
        
        # Load image
        img = Image.open(img_path).convert('RGB')
        
        if self.transform:
            img = self.transform(img)
        
        if self.is_test:
            return img, row['ID']
        else:
            # Multi-label targets
            labels = torch.tensor([row[col] for col in self.damage_cols], dtype=torch.float32)
            return img, labels

def get_transforms(is_train=True):
    """Get image transforms"""
    if is_train:
        return transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
    else:
        return transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])

# ============================================================================
# MODEL
# ============================================================================

class CropDamageModel(nn.Module):
    """Multi-label classification model with area estimation"""
    
    def __init__(self, num_classes=5, pretrained=True):
        super().__init__()
        
        # Backbone
        self.backbone = timm.create_model(
            Config.BACKBONE,
            pretrained=pretrained,
            num_classes=0,  # Remove classification head
            global_pool='avg'
        )
        
        # Get feature dimension
        with torch.no_grad():
            dummy_input = torch.randn(1, 3, Config.IMG_SIZE, Config.IMG_SIZE)
            features = self.backbone(dummy_input)
            feature_dim = features.shape[1]
        
        # Classification head
        self.classifier = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feature_dim, 512),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(512, num_classes)
        )
        
        # Area estimation head (optional - predicts damage percentage)
        self.area_estimator = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feature_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 1),
            nn.Sigmoid()  # Output between 0-1 (percentage)
        )
    
    def forward(self, x):
        features = self.backbone(x)
        class_logits = self.classifier(features)
        area_pred = self.area_estimator(features)
        return class_logits, area_pred

# ============================================================================
# TRAINING
# ============================================================================

class Trainer:
    def __init__(self, model, device):
        self.model = model.to(device)
        self.device = device
        self.best_loss = float('inf')
    
    def train_epoch(self, dataloader, optimizer, criterion):
        self.model.train()
        total_loss = 0
        
        for images, labels in tqdm(dataloader, desc="Training"):
            images = images.to(self.device)
            labels = labels.to(self.device)
            
            optimizer.zero_grad()
            
            class_logits, area_pred = self.model(images)
            
            # Multi-label classification loss
            loss = criterion(class_logits, labels)
            
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
        
        return total_loss / len(dataloader)
    
    def validate(self, dataloader, criterion):
        self.model.eval()
        total_loss = 0
        all_preds = []
        all_labels = []
        
        with torch.no_grad():
            for images, labels in tqdm(dataloader, desc="Validation"):
                images = images.to(self.device)
                labels = labels.to(self.device)
                
                class_logits, area_pred = self.model(images)
                
                loss = criterion(class_logits, labels)
                total_loss += loss.item()
                
                preds = torch.sigmoid(class_logits)
                all_preds.append(preds.cpu().numpy())
                all_labels.append(labels.cpu().numpy())
        
        all_preds = np.vstack(all_preds)
        all_labels = np.vstack(all_labels)
        
        return total_loss / len(dataloader), all_preds, all_labels

def train_model(train_df: pd.DataFrame, img_dir: str, fold: int):
    """Train model for one fold"""
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"\n[FOLD {fold}] Training on {device}")
    
    # Split data
    train_fold = train_df[train_df['fold'] != fold].reset_index(drop=True)
    val_fold = train_df[train_df['fold'] == fold].reset_index(drop=True)
    
    print(f"Train size: {len(train_fold)}, Val size: {len(val_fold)}")
    
    # Datasets
    train_dataset = CropDamageDataset(train_fold, img_dir, get_transforms(True))
    val_dataset = CropDamageDataset(val_fold, img_dir, get_transforms(False))
    
    train_loader = DataLoader(train_dataset, batch_size=Config.BATCH_SIZE, 
                             shuffle=True, num_workers=Config.NUM_WORKERS)
    val_loader = DataLoader(val_dataset, batch_size=Config.BATCH_SIZE, 
                           shuffle=False, num_workers=Config.NUM_WORKERS)
    
    # Model
    model = CropDamageModel(num_classes=len(Config.DAMAGE_CLASSES))
    trainer = Trainer(model, device)
    
    # Loss & Optimizer
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=Config.LEARNING_RATE)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=Config.EPOCHS)
    
    # Training loop
    best_val_loss = float('inf')
    patience_counter = 0
    
    for epoch in range(Config.EPOCHS):
        print(f"\n[Epoch {epoch+1}/{Config.EPOCHS}]")
        
        train_loss = trainer.train_epoch(train_loader, optimizer, criterion)
        val_loss, val_preds, val_labels = trainer.validate(val_loader, criterion)
        
        scheduler.step()
        
        print(f"Train Loss: {train_loss:.4f}, Val Loss: {val_loss:.4f}")
        
        # Early stopping
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            # Save best model
            torch.save(model.state_dict(), 
                      f"{Config.MODELS_DIR}/model_fold{fold}_best.pth")
        else:
            patience_counter += 1
            if patience_counter >= Config.PATIENCE:
                print(f"Early stopping at epoch {epoch+1}")
                break
    
    return model

# ============================================================================
# INFERENCE & AREA CALCULATION
# ============================================================================

def predict_with_area_estimation(model, test_df: pd.DataFrame, img_dir: str, device):
    """Generate predictions with area calculations"""
    model.eval()
    segmenter = DamageSegmentationModel()
    
    predictions = []
    area_results = []
    
    test_dataset = CropDamageDataset(test_df, img_dir, get_transforms(False), is_test=True)
    test_loader = DataLoader(test_dataset, batch_size=Config.BATCH_SIZE, 
                            shuffle=False, num_workers=Config.NUM_WORKERS)
    
    with torch.no_grad():
        for images, image_ids in tqdm(test_loader, desc="Prediction"):
            images = images.to(device)
            
            class_logits, area_pred = model(images)
            probs = torch.sigmoid(class_logits).cpu().numpy()
            areas = area_pred.cpu().numpy()
            
            predictions.extend(probs)
            
            # Per-image area calculation
            for idx, img_id in enumerate(image_ids):
                row = test_df[test_df['ID'] == img_id].iloc[0]
                img_path = os.path.join(img_dir, row['filename'])
                
                mask, area_ratio = segmenter.segment_damaged_area(img_path)
                
                area_results.append({
                    'ID': img_id,
                    'predicted_damage_area_ratio': float(areas[idx][0]),
                    'segmented_damage_area_ratio': area_ratio,
                    'estimated_area_m2': area_ratio * (Config.IMG_SIZE ** 2) * Config.PIXEL_TO_M2
                })
    
    return np.array(predictions), area_results

# ============================================================================
# MAIN PIPELINE
# ============================================================================

def main():
    print("\n" + "="*60)
    print("CROP DAMAGE INSURANCE ASSESSMENT")
    print("="*60)
    
    # 1. Load data
    print("\n[STEP 1] Loading data...")
    train_df = load_and_sample_data(
        f"{Config.DATASET_DIR}/Train.csv",
        sample_size=Config.SAMPLE_SIZE
    )
    
    # 2. Prepare multi-label targets
    print("\n[STEP 2] Preparing targets...")
    train_df = prepare_multilabel_targets(train_df)
    
    # 3. Add visual features
    print("\n[STEP 3] Extracting visual features...")
    train_df = add_visual_features(train_df, Config.TRAIN_IMG_DIR)
    
    # 4. Create folds
    print("\n[STEP 4] Creating folds...")
    skf = StratifiedKFold(n_splits=Config.N_FOLDS, shuffle=True, random_state=Config.SEED)
    train_df['fold'] = -1
    
    for fold, (_, val_idx) in enumerate(skf.split(train_df, train_df['damage'])):
        train_df.loc[val_idx, 'fold'] = fold
    
    print(train_df.groupby(['fold', 'damage']).size())
    
    # 5. Train models
    print("\n[STEP 5] Training models...")
    models = []
    for fold in range(Config.N_FOLDS):
        model = train_model(train_df, Config.TRAIN_IMG_DIR, fold)
        models.append(model)
    
    # 6. Load test data and predict
    print("\n[STEP 6] Generating predictions...")
    test_df = pd.read_csv(f"{Config.DATASET_DIR}/Test.csv")
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    all_predictions = []
    all_areas = []
    
    for fold, model in enumerate(models):
        print(f"\n[FOLD {fold}] Predicting...")
        preds, areas = predict_with_area_estimation(model, test_df, Config.TEST_IMG_DIR, device)
        all_predictions.append(preds)
        all_areas.extend(areas)
    
    # 7. Ensemble predictions
    print("\n[STEP 7] Ensembling...")
    final_predictions = np.mean(all_predictions, axis=0)
    
    # 8. Create submission
    print("\n[STEP 8] Creating submission...")
    submission = pd.DataFrame({
        'ID': test_df['ID'],
        **{damage: final_predictions[:, i] for i, damage in enumerate(Config.DAMAGE_CLASSES)}
    })
    
    submission.to_csv(f"{Config.RESULTS_DIR}/submission.csv", index=False)
    
    # 9. Save area calculations
    areas_df = pd.DataFrame(all_areas)
    areas_df.to_csv(f"{Config.RESULTS_DIR}/area_calculations.csv", index=False)
    
    # 10. Aggregate results
    print("\n[STEP 9] Calculating total damaged area...")
    total_damaged_area = areas_df['estimated_area_m2'].sum()
    total_images = len(areas_df)
    avg_damage_ratio = areas_df['segmented_damage_area_ratio'].mean()
    
    summary = {
        'total_images_processed': total_images,
        'total_estimated_damaged_area_m2': float(total_damaged_area),
        'total_estimated_damaged_area_acres': float(total_damaged_area / 4046.86),
        'average_damage_ratio': float(avg_damage_ratio),
        'damage_distribution': submission[Config.DAMAGE_CLASSES].mean().to_dict()
    }
    
    with open(f"{Config.RESULTS_DIR}/summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    
    print("\n" + "="*60)
    print("RESULTS SUMMARY")
    print("="*60)
    print(f"Total images: {total_images}")
    print(f"Total damaged area: {total_damaged_area:.2f} m² ({total_damaged_area/4046.86:.4f} acres)")
    print(f"Average damage ratio: {avg_damage_ratio:.2%}")
    print("\nDamage type distribution:")
    for damage_type, prob in summary['damage_distribution'].items():
        print(f"  {damage_type} ({DAMAGE_CATEGORIES.get(damage_type, damage_type)}): {prob:.2%}")
    print("="*60)
    
    print(f"\nFiles saved:")
    print(f"  - {Config.RESULTS_DIR}/submission.csv")
    print(f"  - {Config.RESULTS_DIR}/area_calculations.csv")
    print(f"  - {Config.RESULTS_DIR}/summary.json")

if __name__ == "__main__":
    # Mount Google Drive (if using Colab)
    try:
        from google.colab import drive
        drive.mount('/content/drive')
    except:
        print("Not running in Colab")
    
    main()

# ============================================================================
# ADDITIONAL UTILITIES
# ============================================================================

def analyze_overlaps(df: pd.DataFrame, img_dir: str, max_pairs: int = 100):
    """Analyze potential overlaps between consecutive images"""
    print("\n[OVERLAP ANALYSIS] Checking image overlaps...")
    
    overlaps = []
    detector = OverlapDetector()
    
    for i in range(min(len(df) - 1, max_pairs)):
        img1_path = os.path.join(img_dir, df.iloc[i]['filename'])
        img2_path = os.path.join(img_dir, df.iloc[i+1]['filename'])
        
        overlap = detector.calculate_overlap(img1_path, img2_path)
        
        if overlap > Config.OVERLAP_THRESHOLD:
            overlaps.append({
                'image1': df.iloc[i]['filename'],
                'image2': df.iloc[i+1]['filename'],
                'overlap_ratio': overlap
            })
    
    print(f"Found {len(overlaps)} potential overlapping pairs")
    
    if overlaps:
        overlaps_df = pd.DataFrame(overlaps

# --- Cell 32 ---
try:
    from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor
    SEGFORMER_AVAILABLE = True
except ImportError:
    SEGFORMER_AVAILABLE = False
    print("[WARNING] Transformers not available. Using fallback segmentation.")

# ============================================================================
# CONFIGURATION
# ============================================================================
class Config:
    # Paths (update these for your environment)
    DRIVE_PATH = "/content/drive/MyDrive/crop_insurance"  # Google Drive mount
    DATASET_DIR = f"{DRIVE_PATH}/dataset"
    TRAIN_IMG_DIR = f"{DATASET_DIR}/train"
    TEST_IMG_DIR = f"{DATASET_DIR}/test"
    
    # Output
    OUTPUT_DIR = "outputs"
    MODELS_DIR = f"{OUTPUT_DIR}/models"
    RESULTS_DIR = f"{OUTPUT_DIR}/results"
    
    # Training settings
    SEED = 1032
    N_FOLDS = 3
    SAMPLE_SIZE = 1000  # Use 1000 images for faster training
    
    # Model hyperparameters
    BATCH_SIZE = 16
    IMG_SIZE = 384
    EPOCHS = 10
    LEARNING_RATE = 2e-4
    NUM_WORKERS = 4
    PATIENCE = 3
    
    # Model architecture
    BACKBONE = 'convnext_base.fb_in22k'
    
    # Damage categories
    DAMAGE_CLASSES = ['DR', 'G', 'ND', 'WD', 'other']
    
    # Area calculation
    PIXEL_TO_M2 = 0.01  # Rough estimate: 0.01 m² per pixel
    OVERLAP_THRESHOLD = 0.3  # 30% feature similarity = potential overlap

# Create directories
os.makedirs(Config.OUTPUT_DIR, exist_ok=True)
os.makedirs(Config.MODELS_DIR, exist_ok=True)
os.makedirs(Config.RESULTS_DIR, exist_ok=True)

# Set random seeds
def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

set_seed(Config.SEED)

# ============================================================================
# DATA LOADING & PREPROCESSING
# ============================================================================

def load_and_sample_data(train_csv_path: str, sample_size: int = 1000):
    """Load Train.csv and sample images for faster training"""
    df = pd.read_csv(train_csv_path)
    
    print(f"[DATA] Original dataset size: {len(df)}")
    print(f"[DATA] Columns: {df.columns.tolist()}")
    print(f"[DATA] Damage distribution:\n{df['damage'].value_counts()}")
    
    # Sample stratified by damage type
    if sample_size < len(df):
        df_sampled = df.groupby('damage', group_keys=False).apply(
            lambda x: x.sample(min(len(x), sample_size // len(df['damage'].unique())), 
                             random_state=Config.SEED)
        ).reset_index(drop=True)
    else:
        df_sampled = df
    
    print(f"[DATA] Sampled dataset size: {len(df_sampled)}")
    print(f"[DATA] Sampled damage distribution:\n{df_sampled['damage'].value_counts()}")
    
    return df_sampled

def prepare_multilabel_targets(df: pd.DataFrame):
    """Convert damage labels to multi-label binary encoding"""
    df = df.copy()
    
    # Create binary columns for each damage type
    for damage_type in Config.DAMAGE_CLASSES:
        df[damage_type] = 0
    
    # Set the corresponding damage column to 1
    for idx, row in df.iterrows():
        damage = row['damage']
        if damage in Config.DAMAGE_CLASSES:
            df.at[idx, damage] = 1
    
    return df

# ============================================================================
# VISUAL HEALTH INDEX (GPS-Free Mapping Alternative)
# ============================================================================

class VisualHealthAnalyzer:
    """Analyzes visual features of each image to estimate health without GPS"""
    
    @staticmethod
    def calculate_vegetation_index(img_rgb: np.ndarray) -> float:
        """Calculate ExG (Excess Green Index)"""
        b, g, r = cv2.split(img_rgb)
        b, g, r = b.astype(np.float32), g.astype(np.float32), r.astype(np.float32)
        sum_rgb = r + g + b + 1e-6
        g_norm, r_norm, b_norm = g / sum_rgb, r / sum_rgb, b / sum_rgb
        exg = 2 * g_norm - r_norm - b_norm
        return float(exg.mean())
    
    @staticmethod
    def calculate_brown_stress_index(img_rgb: np.ndarray) -> float:
        """Calculate ExR (Excess Red Index) for brown/stressed areas"""
        b, g, r = cv2.split(img_rgb)
        b, g, r = b.astype(np.float32), g.astype(np.float32), r.astype(np.float32)
        sum_rgb = r + g + b + 1e-6
        r_norm, g_norm = r / sum_rgb, g / sum_rgb
        exr = 1.4 * r_norm - g_norm
        return float(exr.mean())
    
    @staticmethod
    def calculate_soil_ratio(img_rgb: np.ndarray) -> float:
        """Estimate visible soil (bare patches)"""
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        # Soil is typically medium brightness
        soil_mask = ((gray > 80) & (gray < 160)).astype(np.uint8) * 255
        return float(soil_mask.sum() / (gray.shape[0] * gray.shape[1] * 255))
    
    @staticmethod
    def calculate_color_variance(img_rgb: np.ndarray) -> float:
        """High variance = inconsistent growth/damage patterns"""
        return float(np.std(img_rgb))
    
    @staticmethod
    def analyze_image(img_path: str) -> Dict:
        """Complete visual health analysis"""
        img = cv2.imread(img_path)
        if img is None:
            return None
        
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        return {
            'vegetation_index': VisualHealthAnalyzer.calculate_vegetation_index(img_rgb),
            'brown_stress_index': VisualHealthAnalyzer.calculate_brown_stress_index(img_rgb),
            'soil_ratio': VisualHealthAnalyzer.calculate_soil_ratio(img_rgb),
            'color_variance': VisualHealthAnalyzer.calculate_color_variance(img_rgb),
        }

def add_visual_features(df: pd.DataFrame, img_dir: str):
    """Add visual health features to dataframe"""
    print("[FEATURES] Calculating visual health indices...")
    
    features = []
    for idx, row in tqdm(df.iterrows(), total=len(df)):
        img_path = os.path.join(img_dir, row['filename'])
        visual_data = VisualHealthAnalyzer.analyze_image(img_path)
        
        if visual_data:
            features.append(visual_data)
        else:
            # Default values if image fails
            features.append({
                'vegetation_index': 0.0,
                'brown_stress_index': 0.0,
                'soil_ratio': 0.0,
                'color_variance': 0.0,
            })
    
    features_df = pd.DataFrame(features)
    df = pd.concat([df.reset_index(drop=True), features_df], axis=1)
    
    print("[FEATURES] Visual features added:")
    print(features_df.describe())
    
    return df

# ============================================================================
# OVERLAP DETECTION (Replaces GPS Distance Calculation)
# ============================================================================

class OverlapDetector:
    """Detects if consecutive images might overlap based on visual similarity"""
    
    @staticmethod
    def extract_features(img: np.ndarray) -> np.ndarray:
        """Extract ORB features for matching"""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        orb = cv2.ORB_create(nfeatures=500)
        keypoints, descriptors = orb.detectAndCompute(gray, None)
        return descriptors
    
    @staticmethod
    def calculate_overlap(img1_path: str, img2_path: str) -> float:
        """Calculate feature-based overlap between two images"""
        img1 = cv2.imread(img1_path)
        img2 = cv2.imread(img2_path)
        
        if img1 is None or img2 is None:
            return 0.0
        
        desc1 = OverlapDetector.extract_features(img1)
        desc2 = OverlapDetector.extract_features(img2)
        
        if desc1 is None or desc2 is None:
            return 0.0
        
        # Use BFMatcher to find matches
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = bf.match(desc1, desc2)
        
        # Overlap ratio = matches / min(features in both images)
        overlap = len(matches) / min(len(desc1), len(desc2))
        return min(overlap, 1.0)

# ============================================================================
# SEGMENTATION FOR AREA CALCULATION
# ============================================================================

class DamageSegmentationModel:
    """Segment damaged areas for precise area calculation"""
    
    def __init__(self):
        if SEGFORMER_AVAILABLE:
            self.processor = SegformerImageProcessor.from_pretrained(
                "nvidia/segformer-b0-finetuned-ade-512-512"
            )
            self.model = SegformerForSemanticSegmentation.from_pretrained(
                "nvidia/segformer-b0-finetuned-ade-512-512"
            )
            self.use_segformer = True
        else:
            self.use_segformer = False
    
    def segment_damaged_area(self, img_path: str, damage_type: str = 'all') -> Tuple[np.ndarray, float]:
        """
        Segment and calculate damaged area
        Returns: (segmentation_mask, area_ratio)
        """
        img = cv2.imread(img_path)
        if img is None:
            return None, 0.0
        
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        if self.use_segformer:
            # Use Segformer for advanced segmentation
            inputs = self.processor(images=img_rgb, return_tensors="pt")
            outputs = self.model(**inputs)
            logits = outputs.logits
            mask = logits.argmax(dim=1)[0].cpu().numpy()
        else:
            # Fallback: Rule-based segmentation
            mask = self._rule_based_segmentation(img_rgb, damage_type)
        
        # Calculate area ratio
        total_pixels = mask.shape[0] * mask.shape[1]
        damaged_pixels = np.sum(mask > 0)
        area_ratio = damaged_pixels / total_pixels
        
        return mask, area_ratio
    
    def _rule_based_segmentation(self, img_rgb: np.ndarray, damage_type: str) -> np.ndarray:
        """Fallback rule-based segmentation"""
        h, w = img_rgb.shape[:2]
        mask = np.zeros((h, w), dtype=np.uint8)
        
        # Vegetation mask
        b, g, r = cv2.split(img_rgb)
        vegetation = (g > r) & (g > b) & (g > 80)
        
        if damage_type in ['DR', 'brown', 'all']:
            # Brown/drought areas
            brown = (r > g) & (r > 100) & (g < 150)
            mask[brown] = 1
        
        if damage_type in ['ND', 'yellow', 'all']:
            # Yellow/nutrient deficient
            yellow = (r > 150) & (g > 150) & (b < 100)
            mask[yellow] = 2
        
        if damage_type in ['WD', 'weed', 'all']:
            # Excess green/weeds
            excess_green = (g > 150) & (g > r + 30)
            mask[excess_green] = 3
        
        if damage_type in ['soil', 'gap', 'all']:
            # Bare soil
            gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
            soil = ((gray > 80) & (gray < 160) & (~vegetation))
            mask[soil] = 4
        
        return mask

# ============================================================================
# DATASET
# ============================================================================

class CropDamageDataset(Dataset):
    """Dataset for multi-label crop damage classification"""
    
    def __init__(self, df: pd.DataFrame, img_dir: str, transform=None, is_test=False):
        self.df = df.reset_index(drop=True)
        self.img_dir = img_dir
        self.transform = transform
        self.is_test = is_test
        self.damage_cols = Config.DAMAGE_CLASSES
    
    def __len__(self):
        return len(self.df)
    
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = os.path.join(self.img_dir, row['filename'])
        
        # Load image
        img = Image.open(img_path).convert('RGB')
        
        if self.transform:
            img = self.transform(img)
        
        if self.is_test:
            return img, row['ID']
        else:
            # Multi-label targets
            labels = torch.tensor([row[col] for col in self.damage_cols], dtype=torch.float32)
            return img, labels

def get_transforms(is_train=True):
    """Get image transforms"""
    if is_train:
        return transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
    else:
        return transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])

# ============================================================================
# MODEL
# ============================================================================

class CropDamageModel(nn.Module):
    """Multi-label classification model with area estimation"""
    
    def __init__(self, num_classes=5, pretrained=True):
        super().__init__()
        
        # Backbone
        self.backbone = timm.create_model(
            Config.BACKBONE,
            pretrained=pretrained,
            num_classes=0,  # Remove classification head
            global_pool='avg'
        )
        
        # Get feature dimension
        with torch.no_grad():
            dummy_input = torch.randn(1, 3, Config.IMG_SIZE, Config.IMG_SIZE)
            features = self.backbone(dummy_input)
            feature_dim = features.shape[1]
        
        # Classification head
        self.classifier = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feature_dim, 512),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(512, num_classes)
        )
        
        # Area estimation head (optional - predicts damage percentage)
        self.area_estimator = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feature_dim, 256),
            nn.ReLU(),
            nn.Linear(256, 1),
            nn.Sigmoid()  # Output between 0-1 (percentage)
        )
    
    def forward(self, x):
        features = self.backbone(x)
        class_logits = self.classifier(features)
        area_pred = self.area_estimator(features)
        return class_logits, area_pred

# ============================================================================
# TRAINING
# ============================================================================

class Trainer:
    def __init__(self, model, device):
        self.model = model.to(device)
        self.device = device
        self.best_loss = float('inf')
    
    def train_epoch(self, dataloader, optimizer, criterion):
        self.model.train()
        total_loss = 0
        
        for images, labels in tqdm(dataloader, desc="Training"):
            images = images.to(self.device)
            labels = labels.to(self.device)
            
            optimizer.zero_grad()
            
            class_logits, area_pred = self.model(images)
            
            # Multi-label classification loss
            loss = criterion(class_logits, labels)
            
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
        
        return total_loss / len(dataloader)
    
    def validate(self, dataloader, criterion):
        self.model.eval()
        total_loss = 0
        all_preds = []
        all_labels = []
        
        with torch.no_grad():
            for images, labels in tqdm(dataloader, desc="Validation"):
                images = images.to(self.device)
                labels = labels.to(self.device)
                
                class_logits, area_pred = self.model(images)
                
                loss = criterion(class_logits, labels)
                total_loss += loss.item()
                
                preds = torch.sigmoid(class_logits)
                all_preds.append(preds.cpu().numpy())
                all_labels.append(labels.cpu().numpy())
        
        all_preds = np.vstack(all_preds)
        all_labels = np.vstack(all_labels)
        
        return total_loss / len(dataloader), all_preds, all_labels

def train_model(train_df: pd.DataFrame, img_dir: str, fold: int):
    """Train model for one fold"""
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"\n[FOLD {fold}] Training on {device}")
    
    # Split data
    train_fold = train_df[train_df['fold'] != fold].reset_index(drop=True)
    val_fold = train_df[train_df['fold'] == fold].reset_index(drop=True)
    
    print(f"Train size: {len(train_fold)}, Val size: {len(val_fold)}")
    
    # Datasets
    train_dataset = CropDamageDataset(train_fold, img_dir, get_transforms(True))
    val_dataset = CropDamageDataset(val_fold, img_dir, get_transforms(False))
    
    train_loader = DataLoader(train_dataset, batch_size=Config.BATCH_SIZE, 
                             shuffle=True, num_workers=Config.NUM_WORKERS)
    val_loader = DataLoader(val_dataset, batch_size=Config.BATCH_SIZE, 
                           shuffle=False, num_workers=Config.NUM_WORKERS)
    
    # Model
    model = CropDamageModel(num_classes=len(Config.DAMAGE_CLASSES))
    trainer = Trainer(model, device)
    
    # Loss & Optimizer
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=Config.LEARNING_RATE)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=Config.EPOCHS)
    
    # Training loop
    best_val_loss = float('inf')
    patience_counter = 0
    
    for epoch in range(Config.EPOCHS):
        print(f"\n[Epoch {epoch+1}/{Config.EPOCHS}]")
        
        train_loss = trainer.train_epoch(train_loader, optimizer, criterion)
        val_loss, val_preds, val_labels = trainer.validate(val_loader, criterion)
        
        scheduler.step()
        
        print(f"Train Loss: {train_loss:.4f}, Val Loss: {val_loss:.4f}")
        
        # Early stopping
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            # Save best model
            torch.save(model.state_dict(), 
                      f"{Config.MODELS_DIR}/model_fold{fold}_best.pth")
        else:
            patience_counter += 1
            if patience_counter >= Config.PATIENCE:
                print(f"Early stopping at epoch {epoch+1}")
                break
    
    return model

# ============================================================================
# INFERENCE & AREA CALCULATION
# ============================================================================

def predict_with_area_estimation(model, test_df: pd.DataFrame, img_dir: str, device):
    """Generate predictions with area calculations"""
    model.eval()
    segmenter = DamageSegmentationModel()
    
    predictions = []
    area_results = []
    
    test_dataset = CropDamageDataset(test_df, img_dir, get_transforms(False), is_test=True)
    test_loader = DataLoader(test_dataset, batch_size=Config.BATCH_SIZE, 
                            shuffle=False, num_workers=Config.NUM_WORKERS)
    
    with torch.no_grad():
        for images, image_ids in tqdm(test_loader, desc="Prediction"):
            images = images.to(device)
            
            class_logits, area_pred = model(images)
            probs = torch.sigmoid(class_logits).cpu().numpy()
            areas = area_pred.cpu().numpy()
            
            predictions.extend(probs)
            
            # Per-image area calculation
            for idx, img_id in enumerate(image_ids):
                row = test_df[test_df['ID'] == img_id].iloc[0]
                img_path = os.path.join(img_dir, row['filename'])
                
                mask, area_ratio = segmenter.segment_damaged_area(img_path)
                
                area_results.append({
                    'ID': img_id,
                    'predicted_damage_area_ratio': float(areas[idx][0]),
                    'segmented_damage_area_ratio': area_ratio,
                    'estimated_area_m2': area_ratio * (Config.IMG_SIZE ** 2) * Config.PIXEL_TO_M2
                })
    
    return np.array(predictions), area_results

# ============================================================================
# MAIN PIPELINE
# ============================================================================

def main():
    print("\n" + "="*60)
    print("CROP DAMAGE INSURANCE ASSESSMENT")
    print("="*60)
    
    # 1. Load data
    print("\n[STEP 1] Loading data...")
    train_df = load_and_sample_data(
        f"{Config.DATASET_DIR}/Train.csv",
        sample_size=Config.SAMPLE_SIZE
    )
    
    # 2. Prepare multi-label targets
    print("\n[STEP 2] Preparing targets...")
    train_df = prepare_multilabel_targets(train_df)
    
    # 3. Add visual features
    print("\n[STEP 3] Extracting visual features...")
    train_df = add_visual_features(train_df, Config.TRAIN_IMG_DIR)
    
    # 4. Create folds
    print("\n[STEP 4] Creating folds...")
    skf = StratifiedKFold(n_splits=Config.N_FOLDS, shuffle=True, random_state=Config.SEED)
    train_df['fold'] = -1
    
    for fold, (_, val_idx) in enumerate(skf.split(train_df, train_df['damage'])):
        train_df.loc[val_idx, 'fold'] = fold
    
    print(train_df.groupby(['fold', 'damage']).size())
    
    # 5. Train models
    print("\n[STEP 5] Training models...")
    models = []
    for fold in range(Config.N_FOLDS):
        model = train_model(train_df, Config.TRAIN_IMG_DIR, fold)
        models.append(model)
    
    # 6. Load test data and predict
    print("\n[STEP 6] Generating predictions...")
    test_df = pd.read_csv(f"{Config.DATASET_DIR}/Test.csv")
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    all_predictions = []
    all_areas = []
    
    for fold, model in enumerate(models):
        print(f"\n[FOLD {fold}] Predicting...")
        preds, areas = predict_with_area_estimation(model, test_df, Config.TEST_IMG_DIR, device)
        all_predictions.append(preds)
        all_areas.extend(areas)
    
    # 7. Ensemble predictions
    print("\n[STEP 7] Ensembling...")
    final_predictions = np.mean(all_predictions, axis=0)
    
    # 8. Create submission
    print("\n[STEP 8] Creating submission...")
    submission = pd.DataFrame({
        'ID': test_df['ID'],
        **{damage: final_predictions[:, i] for i, damage in enumerate(Config.DAMAGE_CLASSES)}
    })
    
    submission.to_csv(f"{Config.RESULTS_DIR}/submission.csv", index=False)
    
    # 9. Save area calculations
    areas_df = pd.DataFrame(all_areas)
    areas_df.to_csv(f"{Config.RESULTS_DIR}/area_calculations.csv", index=False)
    
    # 10. Aggregate results
    print("\n[STEP 9] Calculating total damaged area...")
    total_damaged_area = areas_df['estimated_area_m2'].sum()
    total_images = len(areas_df)
    avg_damage_ratio = areas_df['segmented_damage_area_ratio'].mean()
    
    summary = {
        'total_images_processed': total_images,
        'total_estimated_damaged_area_m2': float(total_damaged_area),
        'total_estimated_damaged_area_acres': float(total_damaged_area / 4046.86),
        'average_damage_ratio': float(avg_damage_ratio),
        'damage_distribution': submission[Config.DAMAGE_CLASSES].mean().to_dict()
    }
    
    with open(f"{Config.RESULTS_DIR}/summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    
    print("\n" + "="*60)
    print("RESULTS SUMMARY")
    print("="*60)
    print(f"Total images: {total_images}")
    print(f"Total damaged area: {total_damaged_area:.2f} m² ({total_damaged_area/4046.86:.4f} acres)")
    print(f"Average damage ratio: {avg_damage_ratio:.2%}")
    print("\nDamage type distribution:")
    for damage_type, prob in summary['damage_distribution'].items():
        print(f"  {damage_type} ({DAMAGE_CATEGORIES.get(damage_type, damage_type)}): {prob:.2%}")
    print("="*60)
    
    print(f"\nFiles saved:")
    print(f"  - {Config.RESULTS_DIR}/submission.csv")
    print(f"  - {Config.RESULTS_DIR}/area_calculations.csv")
    print(f"  - {Config.RESULTS_DIR}/summary.json")

if __name__ == "__main__":
    # Mount Google Drive (if using Colab)
    try:
        from google.colab import drive
        drive.mount('/content/drive')
    except:
        print("Not running in Colab")
    
    main()

# ============================================================================
# ADDITIONAL UTILITIES
# ============================================================================

def analyze_overlaps(df: pd.DataFrame, img_dir: str, max_pairs: int = 100):
    """Analyze potential overlaps between consecutive images"""
    print("\n[OVERLAP ANALYSIS] Checking image overlaps...")
    
    overlaps = []
    detector = OverlapDetector()
    
    for i in range(min(len(df) - 1, max_pairs)):
        img1_path = os.path.join(img_dir, df.iloc[i]['filename'])
        img2_path = os.path.join(img_dir, df.iloc[i+1]['filename'])
        
        overlap = detector.calculate_overlap(img1_path, img2_path)
        
        if overlap > Config.OVERLAP_THRESHOLD:
            overlaps.append({
                'image1': df.iloc[i]['filename'],
                'image2': df.iloc[i+1]['filename'],
                'overlap_ratio': overlap
            })
    
    print(f"Found {len(overlaps)} potential overlapping pairs")
    
    if overlaps:
        overlaps_df = pd.DataFrame(overlaps


# =========================================
# NOTEBOOK: PBI_Model_Colab_Fixed.ipynb
# =========================================


# --- Cell 0 ---
# Install required packages (run once)
!pip install -q timm tqdm

# --- Cell 1 ---
# Mount Google Drive
from google.colab import drive
drive.mount('/content/drive')
print("✓ Google Drive mounted!")

# --- Cell 2 ---
# Imports
import os
import gc
import json
import random
from pathlib import Path

import numpy as np
import pandas as pd
import cv2
from PIL import Image
import matplotlib.pyplot as plt
from tqdm.auto import tqdm

from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import classification_report

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
import timm

print(f"PyTorch: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")

# --- Cell 3 ---
class Config:
    # ============================================
    # 🔴 UPDATE THESE PATHS TO MATCH YOUR DRIVE!
    # ============================================
    DRIVE_PATH = "/content/drive/MyDrive"
    
    # Where your CSV files are stored
    CSV_DIR = f"{DRIVE_PATH}/ColabNotebooks"
    
    # Where your images are stored (folder containing all .jpg files)
    IMG_DIR = f"{DRIVE_PATH}/images"
    
    # CSV files
    TRAIN_CSV = f"{CSV_DIR}/Train.csv"
    TEST_CSV = f"{CSV_DIR}/Test.csv"
    
    # Output (saved to Colab workspace for speed)
    OUTPUT_DIR = "/content/outputs"
    MODELS_DIR = f"{OUTPUT_DIR}/models"
    RESULTS_DIR = f"{OUTPUT_DIR}/results"
    
    # ============================================
    # TRAINING SETTINGS (optimized for Colab free)
    # ============================================
    SEED = 1032
    N_FOLDS = 3
    SAMPLE_SIZE = 500      # Start small - increase if stable
    BATCH_SIZE = 4         # CRITICAL: Keep low for Colab
    IMG_SIZE = 224         # CRITICAL: Keep at 224 for memory
    EPOCHS = 8
    LEARNING_RATE = 2e-4
    NUM_WORKERS = 2
    PATIENCE = 3
    
    # Model (EfficientNet is much lighter than ConvNeXt)
    BACKBONE = 'efficientnet_b0'
    
    # Classes
    DAMAGE_CLASSES = ['DR', 'G', 'ND', 'WD', 'other']
    NUM_CLASSES = 5

# Create directories
os.makedirs(Config.OUTPUT_DIR, exist_ok=True)
os.makedirs(Config.MODELS_DIR, exist_ok=True)
os.makedirs(Config.RESULTS_DIR, exist_ok=True)

# Set seed
def set_seed(seed=Config.SEED):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

set_seed()
print("✓ Configuration loaded!")

# --- Cell 4 ---
# Check if paths exist
print("[PATH CHECK]")
print(f"CSV Directory: {Config.CSV_DIR}")
print(f"  Exists: {os.path.exists(Config.CSV_DIR)}")
print(f"\nImage Directory: {Config.IMG_DIR}")
print(f"  Exists: {os.path.exists(Config.IMG_DIR)}")

if os.path.exists(Config.IMG_DIR):
    imgs = [f for f in os.listdir(Config.IMG_DIR) if f.endswith('.jpg')]
    print(f"  Images found: {len(imgs)}")
    if imgs:
        print(f"  Sample: {imgs[0]}")

print(f"\nTrain CSV: {Config.TRAIN_CSV}")
print(f"  Exists: {os.path.exists(Config.TRAIN_CSV)}")

# --- Cell 5 ---
# Load training data
train_df = pd.read_csv(Config.TRAIN_CSV)
print(f"Total training images: {len(train_df)}")
print(f"\nDamage distribution:")
print(train_df['damage'].value_counts())

# Sample for faster training
if Config.SAMPLE_SIZE < len(train_df):
    train_df = train_df.groupby('damage', group_keys=False).apply(
        lambda x: x.sample(min(len(x), Config.SAMPLE_SIZE // 5), random_state=Config.SEED)
    ).reset_index(drop=True)
    print(f"\nSampled to: {len(train_df)} images")

# Encode labels
label_map = {label: idx for idx, label in enumerate(Config.DAMAGE_CLASSES)}
train_df['label'] = train_df['damage'].map(label_map).fillna(4).astype(int)

# Create folds
skf = StratifiedKFold(n_splits=Config.N_FOLDS, shuffle=True, random_state=Config.SEED)
train_df['fold'] = -1
for fold, (_, val_idx) in enumerate(skf.split(train_df, train_df['label'])):
    train_df.loc[val_idx, 'fold'] = fold

print(f"\n✓ {Config.N_FOLDS} folds created")
train_df.head()

# --- Cell 6 ---
# Verify images exist
sample_files = train_df['filename'].head(5).tolist()
print("[IMAGE CHECK]")
for f in sample_files:
    path = os.path.join(Config.IMG_DIR, f)
    exists = os.path.exists(path)
    print(f"  {f}: {'✓' if exists else '❌'}")

# --- Cell 7 ---
class CropDataset(Dataset):
    def __init__(self, df, img_dir, transform=None, is_test=False):
        self.df = df.reset_index(drop=True)
        self.img_dir = img_dir
        self.transform = transform
        self.is_test = is_test
    
    def __len__(self):
        return len(self.df)
    
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = os.path.join(self.img_dir, row['filename'])
        
        try:
            img = Image.open(img_path).convert('RGB')
        except:
            img = Image.new('RGB', (Config.IMG_SIZE, Config.IMG_SIZE), (0, 0, 0))
        
        if self.transform:
            img = self.transform(img)
        
        if self.is_test:
            return img, row['ID']
        return img, torch.tensor(row['label'], dtype=torch.long)

def get_transforms(train=True):
    if train:
        return transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(0.2, 0.2, 0.2),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
    return transforms.Compose([
        transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

class CropModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.backbone = timm.create_model(Config.BACKBONE, pretrained=True, num_classes=0, global_pool='avg')
        with torch.no_grad():
            feat_dim = self.backbone(torch.randn(1, 3, Config.IMG_SIZE, Config.IMG_SIZE)).shape[1]
        self.head = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feat_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, Config.NUM_CLASSES)
        )
    
    def forward(self, x):
        return self.head(self.backbone(x))

print("✓ Dataset and Model defined!")

# --- Cell 8 ---
def clear_memory():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

def train_fold(fold, train_df, device):
    print(f"\n{'='*50}")
    print(f"FOLD {fold + 1}/{Config.N_FOLDS}")
    print(f"{'='*50}")
    
    train_data = train_df[train_df['fold'] != fold]
    val_data = train_df[train_df['fold'] == fold]
    
    train_loader = DataLoader(
        CropDataset(train_data, Config.IMG_DIR, get_transforms(True)),
        batch_size=Config.BATCH_SIZE, shuffle=True, num_workers=Config.NUM_WORKERS, pin_memory=True
    )
    val_loader = DataLoader(
        CropDataset(val_data, Config.IMG_DIR, get_transforms(False)),
        batch_size=Config.BATCH_SIZE, shuffle=False, num_workers=Config.NUM_WORKERS, pin_memory=True
    )
    
    model = CropModel().to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=Config.LEARNING_RATE)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, Config.EPOCHS)
    
    best_acc = 0
    patience = 0
    
    for epoch in range(Config.EPOCHS):
        # Train
        model.train()
        train_loss, correct, total = 0, 0, 0
        for imgs, labels in tqdm(train_loader, desc=f"Epoch {epoch+1} Train"):
            imgs, labels = imgs.to(device), labels.to(device)
            optimizer.zero_grad()
            out = model(imgs)
            loss = criterion(out, labels)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
            correct += (out.argmax(1) == labels).sum().item()
            total += labels.size(0)
        
        # Validate
        model.eval()
        val_loss, val_correct, val_total = 0, 0, 0
        with torch.no_grad():
            for imgs, labels in tqdm(val_loader, desc=f"Epoch {epoch+1} Val"):
                imgs, labels = imgs.to(device), labels.to(device)
                out = model(imgs)
                val_loss += criterion(out, labels).item()
                val_correct += (out.argmax(1) == labels).sum().item()
                val_total += labels.size(0)
        
        scheduler.step()
        train_acc = 100 * correct / total
        val_acc = 100 * val_correct / val_total
        print(f"  Train Acc: {train_acc:.2f}%, Val Acc: {val_acc:.2f}%")
        
        if val_acc > best_acc:
            best_acc = val_acc
            patience = 0
            torch.save(model.state_dict(), f"{Config.MODELS_DIR}/fold{fold}.pth")
            print(f"  ✓ Saved best model")
        else:
            patience += 1
            if patience >= Config.PATIENCE:
                print(f"  Early stopping")
                break
    
    del model, optimizer
    clear_memory()
    return best_acc

# Train all folds
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Using device: {device}")

results = []
for fold in range(Config.N_FOLDS):
    acc = train_fold(fold, train_df, device)
    results.append(acc)

print(f"\n{'='*50}")
print(f"TRAINING COMPLETE!")
print(f"Average Val Accuracy: {np.mean(results):.2f}%")
print(f"{'='*50}")

# --- Cell 9 ---
# Load test data
test_df = pd.read_csv(Config.TEST_CSV)
print(f"Test images: {len(test_df)}")

test_loader = DataLoader(
    CropDataset(test_df, Config.IMG_DIR, get_transforms(False), is_test=True),
    batch_size=Config.BATCH_SIZE, shuffle=False, num_workers=Config.NUM_WORKERS
)

# Ensemble predictions
all_probs = []
all_ids = []

for fold in range(Config.N_FOLDS):
    model_path = f"{Config.MODELS_DIR}/fold{fold}.pth"
    if not os.path.exists(model_path):
        continue
    
    model = CropModel().to(device)
    model.load_state_dict(torch.load(model_path))
    model.eval()
    
    fold_probs = []
    fold_ids = []
    
    with torch.no_grad():
        for imgs, ids in tqdm(test_loader, desc=f"Predicting Fold {fold+1}"):
            imgs = imgs.to(device)
            probs = F.softmax(model(imgs), dim=1).cpu().numpy()
            fold_probs.extend(probs)
            fold_ids.extend(ids)
    
    all_probs.append(np.array(fold_probs))
    if fold == 0:
        all_ids = fold_ids
    
    del model
    clear_memory()

# Average predictions
final_probs = np.mean(all_probs, axis=0)

# Create submission
submission = pd.DataFrame({
    'ID': all_ids,
    **{Config.DAMAGE_CLASSES[i]: final_probs[:, i] for i in range(Config.NUM_CLASSES)}
})

submission.to_csv(f"{Config.RESULTS_DIR}/submission.csv", index=False)
print(f"\n✓ Submission saved to: {Config.RESULTS_DIR}/submission.csv")
submission.head()

# --- Cell 10 ---
# Copy submission to Drive for download
!cp /content/outputs/results/submission.csv "/content/drive/MyDrive/submission.csv"
print("✓ Submission copied to Drive!")


# =========================================
# NOTEBOOK: Crop_Damage_Insurance_Model.ipynb
# =========================================


# --- Cell 0 ---
# Install dependencies
!pip install -q timm tqdm scikit-learn scikit-image

# --- Cell 1 ---
# Mount Google Drive
from google.colab import drive
drive.mount('/content/drive')
print("✓ Drive mounted!")

# --- Cell 2 ---
# Core imports
import os
import gc
import json
import random
import pickle
from datetime import datetime
from collections import Counter
from typing import List, Dict, Tuple, Optional

import numpy as np
import pandas as pd
import cv2
from PIL import Image
import matplotlib.pyplot as plt
from tqdm.auto import tqdm
from skimage.metrics import structural_similarity as ssim

from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import classification_report, confusion_matrix

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
import timm

print(f"PyTorch: {torch.__version__}")
print(f"CUDA: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")

# --- Cell 3 ---
class Config:
    # ===========================================
    # 🔴 UPDATE THESE PATHS!
    # ===========================================
    DRIVE_PATH = "/content/drive/MyDrive"
    CSV_DIR = f"{DRIVE_PATH}/ColabNotebooks"
    IMG_DIR = f"{DRIVE_PATH}/images"
    
    TRAIN_CSV = f"{CSV_DIR}/Train.csv"
    TEST_CSV = f"{CSV_DIR}/Test.csv"
    
    OUTPUT_DIR = "/content/outputs"
    MODELS_DIR = f"{OUTPUT_DIR}/models"
    RESULTS_DIR = f"{OUTPUT_DIR}/results"
    
    # ===========================================
    # Training settings (Colab-optimized)
    # ===========================================
    SEED = 42
    N_FOLDS = 3
    SAMPLE_SIZE = 500
    BATCH_SIZE = 4
    IMG_SIZE = 224
    EPOCHS = 8
    LEARNING_RATE = 2e-4
    NUM_WORKERS = 2
    PATIENCE = 3
    
    BACKBONE = 'efficientnet_b0'
    
    # Damage classes
    DAMAGE_CLASSES = ['DR', 'G', 'ND', 'WD', 'other']
    DAMAGE_NAMES = {
        'DR': 'Drought',
        'G': 'Good/Healthy',
        'ND': 'Nutrient Deficiency',
        'WD': 'Weed Damage',
        'other': 'Other Damage'
    }
    NUM_CLASSES = 5
    
    # ===========================================
    # Area estimation (insurance-grade)
    # ===========================================
    # Assumed ground coverage per image (m²)
    # Based on: 50m drone height, 60° FOV
    DEFAULT_IMAGE_COVERAGE_M2 = 1500.0
    
    # Area estimation variance (for range calculation)
    AREA_VARIANCE_FACTOR = 0.15  # ±15%
    
    # Overlap similarity threshold
    OVERLAP_SSIM_THRESHOLD = 0.6

# Create directories
os.makedirs(Config.OUTPUT_DIR, exist_ok=True)
os.makedirs(Config.MODELS_DIR, exist_ok=True)
os.makedirs(Config.RESULTS_DIR, exist_ok=True)

# Set seeds
def set_seed(seed=Config.SEED):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

set_seed()
print("✓ Config loaded!")

# --- Cell 4 ---
class RGBDamageAnalyzer:
    """
    RGB-based vegetation indices for damage detection.
    Works without deep learning - physics-based approach.
    """
    
    @staticmethod
    def calculate_exg(img_rgb: np.ndarray) -> np.ndarray:
        """Excess Green Index - healthy vegetation is high"""
        b, g, r = cv2.split(img_rgb.astype(np.float32))
        total = r + g + b + 1e-6
        exg = 2 * (g / total) - (r / total) - (b / total)
        return exg
    
    @staticmethod
    def calculate_exr(img_rgb: np.ndarray) -> np.ndarray:
        """Excess Red Index - stressed/brown vegetation is high"""
        b, g, r = cv2.split(img_rgb.astype(np.float32))
        total = r + g + b + 1e-6
        exr = 1.4 * (r / total) - (g / total)
        return exr
    
    @staticmethod
    def detect_soil(img_rgb: np.ndarray) -> np.ndarray:
        """Detect bare soil / gaps"""
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        soil_mask = ((gray > 80) & (gray < 180)).astype(np.float32)
        return soil_mask
    
    @staticmethod
    def get_damage_mask(img_rgb: np.ndarray) -> Tuple[np.ndarray, float]:
        """
        Combined damage detection using RGB indices.
        Returns: (damage_mask, damage_percentage)
        """
        exg = RGBDamageAnalyzer.calculate_exg(img_rgb)
        exr = RGBDamageAnalyzer.calculate_exr(img_rgb)
        soil = RGBDamageAnalyzer.detect_soil(img_rgb)
        
        # Damaged = low green OR high red/brown OR bare soil
        # Healthy vegetation: exg > 0.1
        healthy_mask = (exg > 0.05).astype(np.float32)
        stress_mask = (exr > 0.1).astype(np.float32)
        
        # Combine: damage = stress OR (soil AND not-healthy)
        damage_mask = np.clip(stress_mask + soil * (1 - healthy_mask), 0, 1)
        
        # Calculate percentage
        damage_pct = float(np.mean(damage_mask) * 100)
        
        return damage_mask, damage_pct
    
    @staticmethod
    def analyze_single_image(img_path: str) -> Dict:
        """Analyze single image for damage"""
        img = cv2.imread(img_path)
        if img is None:
            return {'error': 'Could not load image'}
        
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mask, damage_pct = RGBDamageAnalyzer.get_damage_mask(img_rgb)
        
        exg = RGBDamageAnalyzer.calculate_exg(img_rgb)
        exr = RGBDamageAnalyzer.calculate_exr(img_rgb)
        
        return {
            'damage_percentage': damage_pct,
            'vegetation_index': float(np.mean(exg)),
            'stress_index': float(np.mean(exr)),
            'image_size': img.shape[:2]
        }

print("✓ RGB Damage Analyzer ready!")

# --- Cell 5 ---
class InsuranceFieldAnalyzer:
    """
    Insurance-grade field analysis from multiple images.
    Handles 4-10 random images with overlap detection.
    """
    
    def __init__(self, model_path: str = None, device: str = 'cuda'):
        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')
        self.rgb_analyzer = RGBDamageAnalyzer()
        self.classifier = None
        
        if model_path and os.path.exists(model_path):
            self.load_classifier(model_path)
    
    def load_classifier(self, model_path: str):
        """Load trained classifier model"""
        self.classifier = CropDamageClassifier().to(self.device)
        self.classifier.load_state_dict(torch.load(model_path, map_location=self.device))
        self.classifier.eval()
        print(f"✓ Classifier loaded from {model_path}")
    
    def preprocess_image(self, img_path: str) -> torch.Tensor:
        """Preprocess image for classifier with proper padding"""
        transform = transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
        
        img = Image.open(img_path).convert('RGB')
        return transform(img).unsqueeze(0)
    
    def calculate_image_similarity(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """Calculate SSIM between two images for overlap detection"""
        # Resize to same size
        size = (256, 256)
        img1_resized = cv2.resize(img1, size)
        img2_resized = cv2.resize(img2, size)
        
        # Convert to grayscale
        gray1 = cv2.cvtColor(img1_resized, cv2.COLOR_RGB2GRAY)
        gray2 = cv2.cvtColor(img2_resized, cv2.COLOR_RGB2GRAY)
        
        return ssim(gray1, gray2)
    
    def detect_overlaps(self, image_paths: List[str]) -> Tuple[float, int]:
        """
        Detect overlapping images and calculate effective count.
        Returns: (avg_similarity, effective_image_count)
        """
        if len(image_paths) <= 1:
            return 0.0, len(image_paths)
        
        images = []
        for path in image_paths:
            img = cv2.imread(path)
            if img is not None:
                images.append(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        
        if len(images) <= 1:
            return 0.0, len(images)
        
        # Calculate pairwise similarities
        similarities = []
        for i in range(len(images)):
            for j in range(i + 1, len(images)):
                sim = self.calculate_image_similarity(images[i], images[j])
                similarities.append(sim)
        
        avg_sim = np.mean(similarities) if similarities else 0.0
        
        # Effective images = reduce count if high overlap
        # If avg_sim > 0.6, many images are duplicates
        overlap_factor = max(0.5, 1 - avg_sim)
        effective_count = max(1, int(len(images) * overlap_factor))
        
        return avg_sim, effective_count
    
    def classify_damage_type(self, img_path: str) -> Dict:
        """Classify damage type with confidence"""
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
        """Calculate coverage quality rating"""
        score = 0
        
        # More images = better coverage
        if num_images >= 8:
            score += 3
        elif num_images >= 5:
            score += 2
        else:
            score += 1
        
        # Low overlap = diverse coverage
        if overlap_score < 0.3:
            score += 3
        elif overlap_score < 0.5:
            score += 2
        else:
            score += 1
        
        # High consistency = reliable
        if damage_consistency > 0.8:
            score += 3
        elif damage_consistency > 0.5:
            score += 2
        else:
            score += 1
        
        if score >= 7:
            return "HIGH"
        elif score >= 5:
            return "MEDIUM"
        else:
            return "LOW"
    
    def analyze_field(self, image_paths: List[str], 
                      manual_field_area_m2: Optional[float] = None) -> Dict:
        """
        Main insurance analysis function.
        
        Args:
            image_paths: List of 4-10 image paths
            manual_field_area_m2: Optional manual field size input
        
        Returns:
            Insurance-grade assessment report
        """
        if not image_paths:
            return {'error': 'No images provided'}
        
        print(f"\n[ANALYSIS] Processing {len(image_paths)} images...")
        
        # 1. Analyze individual images
        image_results = []
        damage_percentages = []
        damage_votes = []
        
        for path in tqdm(image_paths, desc="Analyzing images"):
            # RGB analysis
            rgb_result = self.rgb_analyzer.analyze_single_image(path)
            if 'error' in rgb_result:
                continue
            
            damage_percentages.append(rgb_result['damage_percentage'])
            
            # DL classification (if model loaded)
            dl_result = self.classify_damage_type(path)
            if dl_result['confidence'] > 0:
                damage_votes.append(dl_result['damage_type'])
            
            image_results.append({
                'path': os.path.basename(path),
                'rgb_damage_pct': rgb_result['damage_percentage'],
                'vegetation_index': rgb_result['vegetation_index'],
                'dl_damage_type': dl_result['damage_type'],
                'dl_confidence': dl_result['confidence']
            })
        
        if not damage_percentages:
            return {'error': 'No valid images could be processed'}
        
        # 2. Detect overlaps
        overlap_score, effective_images = self.detect_overlaps(image_paths)
        
        # 3. Calculate damage consensus
        damage_type_counts = Counter(damage_votes) if damage_votes else Counter()
        if damage_type_counts:
            primary_damage = damage_type_counts.most_common(1)[0][0]
            damage_consistency = damage_type_counts[primary_damage] / len(damage_votes)
        else:
            primary_damage = 'unknown'
            damage_consistency = 0.0
        
        # 4. Calculate damage percentage RANGE
        damage_mean = np.mean(damage_percentages)
        damage_std = np.std(damage_percentages)
        damage_min = max(0, damage_mean - 2 * damage_std)
        damage_max = min(100, damage_mean + 2 * damage_std)
        
        # 5. Calculate area RANGE
        if manual_field_area_m2:
            total_area = manual_field_area_m2
            area_method = "MANUAL"
        else:
            # Estimate based on effective image count
            total_area = effective_images * Config.DEFAULT_IMAGE_COVERAGE_M2
            area_method = "ESTIMATED"
        
        # Apply variance for range
        variance = Config.AREA_VARIANCE_FACTOR
        damaged_area_mean = total_area * (damage_mean / 100)
        damaged_area_min = total_area * (damage_min / 100) * (1 - variance)
        damaged_area_max = total_area * (damage_max / 100) * (1 + variance)
        
        # 6. Calculate coverage quality
        coverage_quality = self.get_coverage_quality(
            len(image_paths), overlap_score, damage_consistency
        )
        
        # 7. Determine if manual review needed
        requires_review = (
            coverage_quality == "LOW" or
            damage_consistency < 0.5 or
            (damage_max - damage_min) > 30  # High variance
        )
        
        # 8. Calculate overall confidence
        confidence_factors = [
            damage_consistency,
            1 - overlap_score,
            min(len(image_paths) / 8, 1.0),
            1 - (damage_std / 50) if damage_std < 50 else 0.0
        ]
        overall_confidence = np.mean(confidence_factors)
        
        # Build report
        report = {
            "assessment_id": f"INS_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "timestamp": datetime.now().isoformat(),
            
            # Primary outputs
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
            
            # Quality metrics
            "overall_confidence": round(overall_confidence, 3),
            "coverage_quality": coverage_quality,
            "requires_manual_review": requires_review,
            
            # Analysis details
            "total_images": len(image_paths),
            "effective_images": effective_images,
            "overlap_score": round(overlap_score, 3),
            "area_estimation_method": area_method,
            "estimated_total_area_m2": round(total_area, 1),
            
            # Per-image results
            "image_details": image_results
        }
        
        return report

print("✓ Insurance Field Analyzer ready!")

# --- Cell 6 ---
class CropDamageClassifier(nn.Module):
    """EfficientNet-based crop damage classifier"""
    
    def __init__(self):
        super().__init__()
        self.backbone = timm.create_model(
            Config.BACKBONE, 
            pretrained=True, 
            num_classes=0, 
            global_pool='avg'
        )
        
        # Get feature dim
        with torch.no_grad():
            dummy = torch.randn(1, 3, Config.IMG_SIZE, Config.IMG_SIZE)
            feat_dim = self.backbone(dummy).shape[1]
        
        self.classifier = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feat_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, Config.NUM_CLASSES)
        )
    
    def forward(self, x):
        features = self.backbone(x)
        return self.classifier(features)

print("✓ Classifier model defined!")

# --- Cell 7 ---
class CropDataset(Dataset):
    def __init__(self, df, img_dir, transform=None, is_test=False):
        self.df = df.reset_index(drop=True)
        self.img_dir = img_dir
        self.transform = transform
        self.is_test = is_test
    
    def __len__(self):
        return len(self.df)
    
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = os.path.join(self.img_dir, row['filename'])
        
        try:
            img = Image.open(img_path).convert('RGB')
        except:
            img = Image.new('RGB', (Config.IMG_SIZE, Config.IMG_SIZE))
        
        if self.transform:
            img = self.transform(img)
        
        if self.is_test:
            return img, row['ID']
        return img, torch.tensor(row['label'], dtype=torch.long)

def get_transforms(train=True):
    if train:
        return transforms.Compose([
            transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(0.2, 0.2, 0.2),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])
    return transforms.Compose([
        transforms.Resize((Config.IMG_SIZE, Config.IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

print("✓ Dataset ready!")

# --- Cell 8 ---
def clear_memory():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

def train_classifier():
    """Train the damage classifier and save model"""
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    # Load data
    train_df = pd.read_csv(Config.TRAIN_CSV)
    print(f"Loaded {len(train_df)} training samples")
    
    # Sample for faster training
    if Config.SAMPLE_SIZE < len(train_df):
        train_df = train_df.groupby('damage', group_keys=False).apply(
            lambda x: x.sample(min(len(x), Config.SAMPLE_SIZE // 5), random_state=Config.SEED)
        ).reset_index(drop=True)
        print(f"Sampled to {len(train_df)} images")
    
    # Encode labels
    label_map = {c: i for i, c in enumerate(Config.DAMAGE_CLASSES)}
    train_df['label'] = train_df['damage'].map(label_map).fillna(4).astype(int)
    
    # Create folds
    skf = StratifiedKFold(n_splits=Config.N_FOLDS, shuffle=True, random_state=Config.SEED)
    train_df['fold'] = -1
    for fold, (_, val_idx) in enumerate(skf.split(train_df, train_df['label'])):
        train_df.loc[val_idx, 'fold'] = fold
    
    best_models = []
    
    for fold in range(Config.N_FOLDS):
        print(f"\n{'='*50}")
        print(f"FOLD {fold + 1}/{Config.N_FOLDS}")
        print(f"{'='*50}")
        
        train_data = train_df[train_df['fold'] != fold]
        val_data = train_df[train_df['fold'] == fold]
        
        train_loader = DataLoader(
            CropDataset(train_data, Config.IMG_DIR, get_transforms(True)),
            batch_size=Config.BATCH_SIZE, shuffle=True, 
            num_workers=Config.NUM_WORKERS, pin_memory=True
        )
        val_loader = DataLoader(
            CropDataset(val_data, Config.IMG_DIR, get_transforms(False)),
            batch_size=Config.BATCH_SIZE, shuffle=False,
            num_workers=Config.NUM_WORKERS, pin_memory=True
        )
        
        model = CropDamageClassifier().to(device)
        criterion = nn.CrossEntropyLoss()
        optimizer = torch.optim.AdamW(model.parameters(), lr=Config.LEARNING_RATE)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, Config.EPOCHS)
        
        best_acc = 0
        patience = 0
        
        for epoch in range(Config.EPOCHS):
            # Train
            model.train()
            correct, total = 0, 0
            for imgs, labels in tqdm(train_loader, desc=f"Epoch {epoch+1}"):
                imgs, labels = imgs.to(device), labels.to(device)
                optimizer.zero_grad()
                outputs = model(imgs)
                loss = criterion(outputs, labels)
                loss.backward()
                optimizer.step()
                correct += (outputs.argmax(1) == labels).sum().item()
                total += labels.size(0)
            
            # Validate
            model.eval()
            val_correct, val_total = 0, 0
            with torch.no_grad():
                for imgs, labels in val_loader:
                    imgs, labels = imgs.to(device), labels.to(device)
                    outputs = model(imgs)
                    val_correct += (outputs.argmax(1) == labels).sum().item()
                    val_total += labels.size(0)
            
            scheduler.step()
            val_acc = 100 * val_correct / val_total
            print(f"  Train: {100*correct/total:.1f}%, Val: {val_acc:.1f}%")
            
            if val_acc > best_acc:
                best_acc = val_acc
                patience = 0
                model_path = f"{Config.MODELS_DIR}/classifier_fold{fold}.pth"
                torch.save(model.state_dict(), model_path)
                print(f"  ✓ Saved best model")
            else:
                patience += 1
                if patience >= Config.PATIENCE:
                    print("  Early stopping")
                    break
        
        best_models.append(best_acc)
        del model, optimizer
        clear_memory()
    
    # Save best fold as main model
    best_fold = np.argmax(best_models)
    best_path = f"{Config.MODELS_DIR}/classifier_fold{best_fold}.pth"
    main_path = f"{Config.MODELS_DIR}/classifier_model.pth"
    
    import shutil
    shutil.copy(best_path, main_path)
    
    print(f"\n{'='*50}")
    print(f"TRAINING COMPLETE!")
    print(f"Average accuracy: {np.mean(best_models):.1f}%")
    print(f"Best model saved to: {main_path}")
    print(f"{'='*50}")
    
    return main_path

# --- Cell 9 ---
# Train the model
model_path = train_classifier()

# --- Cell 10 ---
def assess_field_damage(image_paths: List[str], 
                        manual_field_area_m2: Optional[float] = None,
                        model_path: str = None) -> Dict:
    """
    🔥 MAIN INSURANCE ASSESSMENT FUNCTION
    
    Use this in your production code!
    
    Args:
        image_paths: List of 4-10 image file paths
        manual_field_area_m2: Optional - known field size in m²
        model_path: Path to trained .pth model file
    
    Returns:
        Insurance assessment report (dict)
    """
    if model_path is None:
        model_path = f"{Config.MODELS_DIR}/classifier_model.pth"
    
    analyzer = InsuranceFieldAnalyzer(model_path=model_path)
    report = analyzer.analyze_field(image_paths, manual_field_area_m2)
    
    return report

def print_insurance_report(report: Dict):
    """Pretty print the insurance report"""
    print("\n" + "="*60)
    print("🌾 CROP DAMAGE INSURANCE ASSESSMENT")
    print("="*60)
    
    print(f"\n📋 Assessment ID: {report['assessment_id']}")
    print(f"📅 Timestamp: {report['timestamp']}")
    
    print(f"\n{'─'*40}")
    print("DAMAGE ASSESSMENT")
    print(f"{'─'*40}")
    print(f"Type: {report['damage_type_name']} ({report['damage_type']})")
    print(f"Type Confidence: {report['damage_type_confidence']:.1%}")
    
    pct = report['damage_percentage']
    print(f"\nDamage Percentage:")
    print(f"  Range: {pct['min']:.1f}% - {pct['max']:.1f}%")
    print(f"  Mean:  {pct['mean']:.1f}%")
    
    area = report['damaged_area_m2']
    acres = report['damaged_area_acres']
    print(f"\nDamaged Area:")
    print(f"  Range: {area['min']:.0f} - {area['max']:.0f} m²")
    print(f"         {acres['min']:.4f} - {acres['max']:.4f} acres")
    print(f"  Mean:  {area['mean']:.0f} m² ({acres['mean']:.4f} acres)")
    
    print(f"\n{'─'*40}")
    print("QUALITY METRICS")
    print(f"{'─'*40}")
    print(f"Overall Confidence: {report['overall_confidence']:.1%}")
    print(f"Coverage Quality: {report['coverage_quality']}")
    print(f"Images Analyzed: {report['total_images']} ({report['effective_images']} effective)")
    print(f"Overlap Score: {report['overlap_score']:.1%}")
    print(f"Area Method: {report['area_estimation_method']}")
    
    if report['requires_manual_review']:
        print(f"\n⚠️  REQUIRES MANUAL REVIEW")
    else:
        print(f"\n✅ Auto-approval eligible")
    
    print("="*60)

print("✓ Assessment functions ready!")

# --- Cell 11 ---
# Test with random images from train set
train_df = pd.read_csv(Config.TRAIN_CSV)
sample_files = train_df['filename'].sample(6, random_state=42).tolist()
sample_paths = [os.path.join(Config.IMG_DIR, f) for f in sample_files]

print(f"Testing with {len(sample_paths)} images...")

# Run assessment
report = assess_field_damage(
    image_paths=sample_paths,
    manual_field_area_m2=None,  # Will use estimated
    model_path=f"{Config.MODELS_DIR}/classifier_model.pth"
)

# Print report
print_insurance_report(report)

# --- Cell 12 ---
# Save report as JSON
report_path = f"{Config.RESULTS_DIR}/insurance_report.json"
with open(report_path, 'w') as f:
    json.dump(report, f, indent=2)
print(f"\n✓ Report saved to: {report_path}")

# Also show the raw JSON
print("\n📄 Raw JSON Output:")
print(json.dumps(report, indent=2))

# --- Cell 13 ---
# Save model to Drive for use in other applications
import shutil

# Copy model files to Drive
drive_models_dir = f"{Config.DRIVE_PATH}/crop_damage_models"
os.makedirs(drive_models_dir, exist_ok=True)

model_files = [
    f"{Config.MODELS_DIR}/classifier_model.pth"
]

for src in model_files:
    if os.path.exists(src):
        dst = os.path.join(drive_models_dir, os.path.basename(src))
        shutil.copy(src, dst)
        print(f"✓ Copied: {dst}")

# Save config as pickle for easy loading
config_dict = {
    'DAMAGE_CLASSES': Config.DAMAGE_CLASSES,
    'DAMAGE_NAMES': Config.DAMAGE_NAMES,
    'IMG_SIZE': Config.IMG_SIZE,
    'BACKBONE': Config.BACKBONE,
    'NUM_CLASSES': Config.NUM_CLASSES,
    'DEFAULT_IMAGE_COVERAGE_M2': Config.DEFAULT_IMAGE_COVERAGE_M2
}

config_path = f"{drive_models_dir}/config.pkl"
with open(config_path, 'wb') as f:
    pickle.dump(config_dict, f)
print(f"✓ Config saved: {config_path}")

print(f"\n🎉 All models saved to: {drive_models_dir}")

# --- Cell 14 ---
# ============================================================
# 🌾 SIMPLE FARMER OUTPUT
# ============================================================

def analyze_farmer_images(image_paths: List[str], 
                          field_size_acres: float,
                          model_path: str = None) -> Dict:
    """
    Farmer uploads images + provides field size in acres.
    Returns: damage type + damaged area in acres
    """
    if not image_paths:
        return {'error': 'No images provided'}
    
    if model_path is None:
        model_path = f"{Config.MODELS_DIR}/classifier_model.pth"
    
    analyzer = InsuranceFieldAnalyzer(model_path=model_path)
    field_area_m2 = field_size_acres * 4046.86
    report = analyzer.analyze_field(image_paths, field_area_m2)
    
    return {
        'damage_type': report['damage_type_name'],
        'damaged_area_acres': round(report['damaged_area_acres']['mean'], 2)
    }

print("✓ Simple Farmer Output function ready!")

# --- Cell 15 ---
# ============================================================
# TEST: Farmer uploads 5 images, has 5 acres
# ============================================================
sample_images = [os.path.join(Config.IMG_DIR, f) for f in 
                 pd.read_csv(Config.TRAIN_CSV)['filename'].sample(5).tolist()]

result = analyze_farmer_images(
    image_paths=sample_images,
    field_size_acres=5.0
)

print("=" * 50)
print("🌾 FARMER OUTPUT")
print("=" * 50)
print(f"Damage Type: {result['damage_type']}")
print(f"Damaged Area: {result['damaged_area_acres']} acres")
print("=" * 50)
