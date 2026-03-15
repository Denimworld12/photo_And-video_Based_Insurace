#!/usr/bin/env python3
"""
🌾 Crop Damage Classifier — Training Script
=============================================
Train an EfficientNet-B3 classifier on the CGIAR crop damage dataset.
Produces a .pth model + config.pkl for use in main_pipeline.py.

Designed for Google Colab (GPU) but works on CPU (slower).

Usage:
  python train.py \
    --csv  /path/to/Train.csv \
    --img-dir /path/to/images \
    --output-dir ./models \
    --epochs 8 \
    --batch-size 8 \
    --sample-size 0          # 0 = use all data
"""

import os
import sys
import gc
import json
import random
import pickle
import argparse
from datetime import datetime
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from PIL import Image

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms

try:
    import timm
except ImportError:
    print("ERROR: 'timm' is required.  pip install timm")
    sys.exit(1)

try:
    from sklearn.model_selection import StratifiedKFold
    from sklearn.metrics import classification_report
except ImportError:
    print("ERROR: scikit-learn is required.  pip install scikit-learn")
    sys.exit(1)

try:
    from tqdm.auto import tqdm
except ImportError:
    # graceful fallback
    def tqdm(iterable, **_kw):
        return iterable


# ============================================================================
# CONFIGURATION
# ============================================================================
DAMAGE_CLASSES = ['DR', 'G', 'ND', 'WD', 'other']
DAMAGE_NAMES = {
    'DR': 'Drought',
    'G': 'Good/Healthy',
    'ND': 'Nutrient Deficiency',
    'WD': 'Weed Damage',
    'other': 'Other Damage',
}
# Map CGIAR classes → PBI lossReason (used at inference)
CGIAR_TO_PBI = {
    'DR': 'drought',
    'G': 'healthy',
    'ND': 'disease',
    'WD': 'pest',
    'other': 'other',
}

IMG_SIZE = 224
NUM_CLASSES = len(DAMAGE_CLASSES)
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD  = [0.229, 0.224, 0.225]


# ============================================================================
# MODEL
# ============================================================================
class CropDamageClassifier(nn.Module):
    """
    EfficientNet-based crop damage classifier.

    Architecture mirrors the one in modules/crop_damage_insurance.py so that
    the exported .pth weights can be loaded there directly.
    """

    def __init__(self, backbone: str = 'efficientnet_b3',
                 num_classes: int = NUM_CLASSES,
                 pretrained: bool = True):
        super().__init__()
        self.backbone = timm.create_model(
            backbone,
            pretrained=pretrained,
            num_classes=0,
            global_pool='avg',
        )

        # Infer feature dimension
        with torch.no_grad():
            dummy = torch.randn(1, 3, IMG_SIZE, IMG_SIZE)
            feat_dim = self.backbone(dummy).shape[1]

        self.classifier = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(feat_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        features = self.backbone(x)
        return self.classifier(features)

    def get_features(self, x: torch.Tensor) -> torch.Tensor:
        """Return backbone features (for GradCAM or downstream use)."""
        return self.backbone(x)


# ============================================================================
# DATASET
# ============================================================================
class CropDataset(Dataset):
    """CGIAR-format dataset: CSV with columns  ID, damage, filename."""

    def __init__(self, df: pd.DataFrame, img_dir: str,
                 transform=None, is_test: bool = False):
        self.df = df.reset_index(drop=True)
        self.img_dir = img_dir
        self.transform = transform
        self.is_test = is_test

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int):
        row = self.df.iloc[idx]
        img_path = os.path.join(self.img_dir, row['filename'])

        try:
            img = Image.open(img_path).convert('RGB')
        except Exception:
            img = Image.new('RGB', (IMG_SIZE, IMG_SIZE), (128, 128, 128))

        if self.transform:
            img = self.transform(img)

        if self.is_test:
            return img, row['ID']
        return img, torch.tensor(row['label'], dtype=torch.long)


def get_transforms(train: bool = True) -> transforms.Compose:
    if train:
        return transforms.Compose([
            transforms.Resize((IMG_SIZE, IMG_SIZE)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2,
                                   saturation=0.2, hue=0.05),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ])
    return transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])


# ============================================================================
# GRADCAM (lightweight, for post-training verification)
# ============================================================================
class GradCAM:
    """
    Generate Grad-CAM heatmaps from the last convolutional layer.
    Usage:
        cam = GradCAM(model)
        heatmap = cam.generate(input_tensor, target_class=2)
    """

    def __init__(self, model: CropDamageClassifier):
        self.model = model
        self.model.eval()
        self._activations = None
        self._gradients = None

        # Hook into the last block of the backbone
        target_layer = self._find_last_conv(model.backbone)
        target_layer.register_forward_hook(self._save_activation)
        target_layer.register_backward_hook(self._save_gradient)

    @staticmethod
    def _find_last_conv(module: nn.Module) -> nn.Module:
        """Walk module tree to find the last Conv2d layer."""
        last_conv = None
        for m in module.modules():
            if isinstance(m, nn.Conv2d):
                last_conv = m
        if last_conv is None:
            raise RuntimeError("No Conv2d layer found in backbone")
        return last_conv

    def _save_activation(self, _module, _input, output):
        self._activations = output.detach()

    def _save_gradient(self, _module, _grad_in, grad_out):
        self._gradients = grad_out[0].detach()

    @torch.no_grad()
    def generate(self, input_tensor: torch.Tensor,
                 target_class: int = None) -> np.ndarray:
        """
        Generate a GradCAM heatmap.

        Args:
            input_tensor: (1, 3, H, W) tensor
            target_class: class index to highlight (None = predicted class)

        Returns:
            heatmap: (H, W) float32 array in [0, 1]
        """
        self.model.eval()

        # Need gradients for this
        input_tensor = input_tensor.clone().requires_grad_(True)
        output = self.model(input_tensor)

        if target_class is None:
            target_class = output.argmax(dim=1).item()

        self.model.zero_grad()
        score = output[0, target_class]
        score.backward()

        # Weighted combination
        weights = self._gradients.mean(dim=[2, 3], keepdim=True)  # GAP
        cam = (weights * self._activations).sum(dim=1, keepdim=True)
        cam = F.relu(cam)
        cam = cam.squeeze().cpu().numpy()

        # Normalize
        if cam.max() > 0:
            cam = cam / cam.max()

        # Resize to input size
        import cv2
        cam = cv2.resize(cam, (IMG_SIZE, IMG_SIZE))
        return cam

    @staticmethod
    def overlay_heatmap(image: np.ndarray, heatmap: np.ndarray,
                        alpha: float = 0.5) -> np.ndarray:
        """
        Overlay a heatmap on an image.

        Args:
            image: (H, W, 3) uint8 RGB image
            heatmap: (H, W) float32 in [0, 1]
            alpha: blend factor

        Returns:
            overlay: (H, W, 3) uint8 RGB image
        """
        import cv2
        heatmap_colored = cv2.applyColorMap(
            (heatmap * 255).astype(np.uint8), cv2.COLORMAP_JET
        )
        heatmap_colored = cv2.cvtColor(heatmap_colored, cv2.COLOR_BGR2RGB)
        overlay = (image * (1 - alpha) + heatmap_colored * alpha).astype(np.uint8)
        return overlay

    @staticmethod
    def calculate_damage_ratio(heatmap: np.ndarray,
                               threshold: float = 0.5) -> float:
        """
        Calculate the ratio of 'damaged' pixels from a GradCAM heatmap.

        Args:
            heatmap: (H, W) float32 in [0, 1]
            threshold: activation threshold for 'damaged' pixel

        Returns:
            ratio: float in [0, 1]
        """
        total_pixels = heatmap.size
        damaged_pixels = (heatmap >= threshold).sum()
        return float(damaged_pixels) / total_pixels


# ============================================================================
# TRAINING
# ============================================================================
def set_seed(seed: int = 42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def clear_memory():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def train_one_fold(
    fold: int,
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    img_dir: str,
    args,
    device: torch.device,
) -> Tuple[float, str]:
    """
    Train a single fold. Returns (best_val_accuracy, model_save_path).
    """
    train_loader = DataLoader(
        CropDataset(train_df, img_dir, get_transforms(True)),
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers,
        pin_memory=True,
    )
    val_loader = DataLoader(
        CropDataset(val_df, img_dir, get_transforms(False)),
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=True,
    )

    model = CropDamageClassifier(
        backbone=args.backbone, pretrained=True
    ).to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=args.epochs
    )

    best_acc = 0.0
    patience_counter = 0
    model_path = os.path.join(args.output_dir, f'classifier_fold{fold}.pth')

    for epoch in range(args.epochs):
        # ---- Train ----
        model.train()
        train_correct, train_total = 0, 0
        train_loss_sum = 0.0

        for imgs, labels in tqdm(train_loader, desc=f"Fold {fold+1} Epoch {epoch+1}"):
            imgs, labels = imgs.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(imgs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            train_correct += (outputs.argmax(1) == labels).sum().item()
            train_total += labels.size(0)
            train_loss_sum += loss.item() * labels.size(0)

        scheduler.step()

        # ---- Validate ----
        model.eval()
        val_correct, val_total = 0, 0
        all_preds, all_labels = [], []

        with torch.no_grad():
            for imgs, labels in val_loader:
                imgs, labels = imgs.to(device), labels.to(device)
                outputs = model(imgs)
                preds = outputs.argmax(1)
                val_correct += (preds == labels).sum().item()
                val_total += labels.size(0)
                all_preds.extend(preds.cpu().numpy())
                all_labels.extend(labels.cpu().numpy())

        val_acc = 100.0 * val_correct / val_total
        train_acc = 100.0 * train_correct / train_total
        avg_loss = train_loss_sum / train_total

        print(f"  Train Acc: {train_acc:.1f}%  Loss: {avg_loss:.4f}  |  "
              f"Val Acc: {val_acc:.1f}%")

        if val_acc > best_acc:
            best_acc = val_acc
            patience_counter = 0
            torch.save(model.state_dict(), model_path)
            print(f"  ✓ Saved best model (val_acc={val_acc:.1f}%)")
        else:
            patience_counter += 1
            if patience_counter >= args.patience:
                print(f"  Early stopping at epoch {epoch+1}")
                break

    # Print classification report for this fold
    print(f"\nFold {fold+1} Classification Report:")
    print(classification_report(
        all_labels, all_preds,
        target_names=DAMAGE_CLASSES,
        zero_division=0,
    ))

    del model, optimizer
    clear_memory()

    return best_acc, model_path


def train(args):
    """Main training function."""
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"\n{'='*60}")
    print(f"🌾 Crop Damage Classifier — Training")
    print(f"{'='*60}")
    print(f"Device     : {device}")
    print(f"Backbone   : {args.backbone}")
    print(f"Epochs     : {args.epochs}")
    print(f"Batch Size : {args.batch_size}")
    print(f"Folds      : {args.n_folds}")
    print(f"LR         : {args.lr}")
    print(f"Output     : {args.output_dir}")
    print(f"{'='*60}\n")

    set_seed(args.seed)
    os.makedirs(args.output_dir, exist_ok=True)

    # ---- Load data ----
    df = pd.read_csv(args.csv)
    print(f"Loaded {len(df)} samples from {args.csv}")
    print(f"Class distribution:\n{df['damage'].value_counts()}\n")

    # Subsample if requested
    if args.sample_size > 0 and args.sample_size < len(df):
        df = df.groupby('damage', group_keys=False).apply(
            lambda x: x.sample(
                min(len(x), args.sample_size // len(DAMAGE_CLASSES)),
                random_state=args.seed,
            )
        ).reset_index(drop=True)
        print(f"Sampled to {len(df)} images\n")

    # Encode labels
    label_map = {c: i for i, c in enumerate(DAMAGE_CLASSES)}
    df['label'] = df['damage'].map(label_map).fillna(len(DAMAGE_CLASSES) - 1).astype(int)

    # Verify images exist (sample check)
    sample_file = os.path.join(args.img_dir, df['filename'].iloc[0])
    if not os.path.exists(sample_file):
        print(f"⚠️  WARNING: Sample image not found: {sample_file}")
        print(f"   Make sure --img-dir points to the folder containing images")

    # ---- K-Fold Training ----
    skf = StratifiedKFold(n_splits=args.n_folds, shuffle=True,
                          random_state=args.seed)
    df['fold'] = -1
    for fold, (_, val_idx) in enumerate(skf.split(df, df['label'])):
        df.loc[val_idx, 'fold'] = fold

    fold_results = []

    for fold in range(args.n_folds):
        print(f"\n{'='*50}")
        print(f"FOLD {fold+1}/{args.n_folds}")
        print(f"{'='*50}")

        train_data = df[df['fold'] != fold]
        val_data = df[df['fold'] == fold]
        print(f"Train: {len(train_data)}, Val: {len(val_data)}")

        best_acc, model_path = train_one_fold(
            fold, train_data, val_data, args.img_dir, args, device)
        fold_results.append((best_acc, model_path))

    # ---- Save best model as main ----
    best_fold = int(np.argmax([r[0] for r in fold_results]))
    best_path = fold_results[best_fold][1]
    main_path = os.path.join(args.output_dir, 'classifier_model.pth')

    import shutil
    shutil.copy(best_path, main_path)

    # ---- Save config.pkl ----
    config = {
        'DAMAGE_CLASSES': DAMAGE_CLASSES,
        'DAMAGE_NAMES': DAMAGE_NAMES,
        'CGIAR_TO_PBI': CGIAR_TO_PBI,
        'IMG_SIZE': IMG_SIZE,
        'BACKBONE': args.backbone,
        'NUM_CLASSES': NUM_CLASSES,
        'DEFAULT_IMAGE_COVERAGE_M2': 1500.0,
        'trained_at': datetime.now().isoformat(),
        'best_fold': best_fold,
        'best_accuracy': fold_results[best_fold][0],
        'fold_accuracies': [r[0] for r in fold_results],
    }

    config_path = os.path.join(args.output_dir, 'config.pkl')
    with open(config_path, 'wb') as f:
        pickle.dump(config, f)

    # Also save as JSON for readability
    config_json_path = os.path.join(args.output_dir, 'config.json')
    config_serializable = {k: v for k, v in config.items()}
    with open(config_json_path, 'w') as f:
        json.dump(config_serializable, f, indent=2)

    print(f"\n{'='*60}")
    print(f"🎉 TRAINING COMPLETE!")
    print(f"{'='*60}")
    print(f"Average accuracy : {np.mean([r[0] for r in fold_results]):.1f}%")
    print(f"Best fold        : {best_fold+1} ({fold_results[best_fold][0]:.1f}%)")
    print(f"Model saved      : {main_path}")
    print(f"Config saved     : {config_path}")
    print(f"{'='*60}\n")

    return main_path


# ============================================================================
# CLI
# ============================================================================
def main():
    parser = argparse.ArgumentParser(
        description='Train Crop Damage Classifier (EfficientNet)'
    )
    parser.add_argument('--csv', required=True,
                        help='Path to Train.csv (CGIAR format: ID,damage,filename)')
    parser.add_argument('--img-dir', required=True,
                        help='Directory containing training images')
    parser.add_argument('--output-dir', default='./models',
                        help='Directory to save model + config (default: ./models)')

    parser.add_argument('--backbone', default='efficientnet_b3',
                        help='timm backbone name (default: efficientnet_b3)')
    parser.add_argument('--epochs', type=int, default=8,
                        help='Max training epochs per fold (default: 8)')
    parser.add_argument('--batch-size', type=int, default=8,
                        help='Batch size (default: 8, reduce for low VRAM)')
    parser.add_argument('--lr', type=float, default=2e-4,
                        help='Learning rate (default: 2e-4)')
    parser.add_argument('--n-folds', type=int, default=3,
                        help='Number of CV folds (default: 3)')
    parser.add_argument('--patience', type=int, default=3,
                        help='Early stopping patience (default: 3)')
    parser.add_argument('--sample-size', type=int, default=0,
                        help='Subsample dataset (0 = use all, default: 0)')
    parser.add_argument('--num-workers', type=int, default=2,
                        help='DataLoader num_workers (default: 2)')
    parser.add_argument('--seed', type=int, default=42,
                        help='Random seed (default: 42)')

    args = parser.parse_args()
    train(args)


if __name__ == '__main__':
    main()
