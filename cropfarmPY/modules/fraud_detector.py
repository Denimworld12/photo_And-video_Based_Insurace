
import os
import hashlib
from typing import List, Dict
from datetime import datetime, timedelta
import numpy as np
import cv2

try:
    from skimage.metrics import structural_similarity as ssim
except ImportError:
    # Fallback SSIM using correlation if skimage not installed
    def ssim(img1, img2):
        f1 = img1.flatten().astype(float)
        f2 = img2.flatten().astype(float)
        std1, std2 = f1.std(), f2.std()
        if std1 < 1e-6 and std2 < 1e-6:
            # Both images are nearly uniform — if same color = identical
            return 1.0 if np.allclose(f1, f2, atol=5) else 0.0
        if std1 < 1e-6 or std2 < 1e-6:
            return 0.0  # One uniform, one not = different
        return float(np.corrcoef(f1, f2)[0, 1])


class FraudDetector:
    """
    Detects suspicious patterns and potential fraud in claims.
    Includes duplicate/repeated image detection via file hash, 
    perceptual hash, and SSIM comparison.
    """
    
    def __init__(self):
        self.RISK_THRESHOLDS = {
            'LOW': 0.3,
            'MEDIUM': 0.6,
            'HIGH': 0.8
        }
        self.AUTO_REJECT_SCORE = 0.9
        
        # Duplicate detection thresholds
        self.SSIM_DUPLICATE_THRESHOLD = 0.92    # Very high similarity for SSIM-only detection
        self.SSIM_NEAR_DUPLICATE_THRESHOLD = 0.75  # Moderate similarity
        self.PHASH_DUPLICATE_BITS = 5  # Max hamming distance for perceptual hash pre-filter

    # ================================================================
    # DUPLICATE IMAGE DETECTION (NEW)
    # ================================================================
    
    def _file_hash(self, filepath: str) -> str:
        """Calculate MD5 hash of a file for exact duplicate detection."""
        hasher = hashlib.md5()
        try:
            with open(filepath, 'rb') as f:
                for chunk in iter(lambda: f.read(8192), b''):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except Exception:
            return ''
    
    def _perceptual_hash(self, image: np.ndarray, hash_size: int = 16) -> np.ndarray:
        """
        Calculate a perceptual hash (average hash) for an image.
        Resistant to resize, slight color changes, and compression.
        """
        # Resize to small square
        resized = cv2.resize(image, (hash_size, hash_size), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY) if len(resized.shape) == 3 else resized
        # Compute mean and create binary hash
        mean_val = gray.mean()
        return (gray > mean_val).flatten().astype(np.uint8)
    
    def _hamming_distance(self, hash1: np.ndarray, hash2: np.ndarray) -> int:
        """Hamming distance between two perceptual hashes."""
        return int(np.sum(hash1 != hash2))
    
    def _calculate_ssim(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """Calculate SSIM between two images after normalizing size."""
        target_size = (256, 256)
        r1 = cv2.resize(img1, target_size)
        r2 = cv2.resize(img2, target_size)
        g1 = cv2.cvtColor(r1, cv2.COLOR_BGR2GRAY) if len(r1.shape) == 3 else r1
        g2 = cv2.cvtColor(r2, cv2.COLOR_BGR2GRAY) if len(r2.shape) == 3 else r2
        return float(ssim(g1, g2))

    def detect_duplicate_images(self, image_paths: List[str]) -> Dict:
        """
        Detect duplicate or near-duplicate images using three methods:
        1. Exact file hash (MD5) — catches identical files
        2. Perceptual hash — catches resized/recompressed copies
        3. SSIM — catches visually similar images
        
        Returns:
            Dict with score (0.0 = all duplicates, 1.0 = all unique),
            duplicate_pairs, and details.
        """
        if len(image_paths) <= 1:
            return {
                'score': 1.0,
                'duplicate_pairs': [],
                'near_duplicate_pairs': [],
                'exact_duplicate_count': 0,
                'near_duplicate_count': 0,
                'effective_unique_images': len(image_paths),
                'total_images': len(image_paths),
                'details': ['Single image - no duplicates possible']
            }
        
        # Load images and compute hashes
        images = []
        file_hashes = []
        p_hashes = []
        valid_indices = []
        
        for i, path in enumerate(image_paths):
            if not os.path.exists(path):
                continue
            img = cv2.imread(path)
            if img is None:
                continue
            images.append(img)
            file_hashes.append(self._file_hash(path))
            p_hashes.append(self._perceptual_hash(img))
            valid_indices.append(i)
        
        if len(images) <= 1:
            return {
                'score': 1.0,
                'duplicate_pairs': [],
                'near_duplicate_pairs': [],
                'exact_duplicate_count': 0,
                'near_duplicate_count': 0,
                'effective_unique_images': len(images),
                'total_images': len(image_paths),
                'details': ['Could not load enough images for comparison']
            }
        
        exact_duplicates = []
        near_duplicates = []
        ssim_scores = []
        details = []
        
        n = len(images)
        for i in range(n):
            for j in range(i + 1, n):
                orig_i = valid_indices[i]
                orig_j = valid_indices[j]
                pair_label = f"Image {orig_i+1} vs Image {orig_j+1}"
                
                # Method 1: Exact file hash — the only true "exact duplicate"
                if file_hashes[i] and file_hashes[j] and file_hashes[i] == file_hashes[j]:
                    exact_duplicates.append((orig_i, orig_j))
                    details.append(f"EXACT DUPLICATE: {pair_label} (identical files)")
                    continue  # No need to check further
                
                # Method 2: Perceptual hash — use as a PRE-FILTER only
                # Crop photos are very similar in color, so phash alone causes false positives.
                # If phash matches, we MUST confirm with SSIM before classifying.
                hamming = self._hamming_distance(p_hashes[i], p_hashes[j])
                
                if hamming <= self.PHASH_DUPLICATE_BITS:
                    # Phash matched — confirm with SSIM
                    sim = self._calculate_ssim(images[i], images[j])
                    ssim_scores.append(sim)
                    
                    if sim >= 0.95:
                        # Very high SSIM + phash match = confirmed duplicate
                        exact_duplicates.append((orig_i, orig_j))
                        details.append(f"CONFIRMED DUPLICATE: {pair_label} (hash={hamming}, SSIM={sim:.3f})")
                    elif sim >= 0.80:
                        # Moderate SSIM + phash match = near-duplicate
                        near_duplicates.append((orig_i, orig_j))
                        details.append(f"NEAR DUPLICATE: {pair_label} (hash={hamming}, SSIM={sim:.3f})")
                    # else: phash matched but SSIM is low = different images with similar colors (ignore)
                    continue
                
                # Method 3: Pure SSIM for visual similarity (no phash match)
                # Only check if images might still be copies despite different hash
                sim = self._calculate_ssim(images[i], images[j])
                ssim_scores.append(sim)
                
                if sim >= self.SSIM_DUPLICATE_THRESHOLD:
                    exact_duplicates.append((orig_i, orig_j))
                    details.append(f"VISUAL DUPLICATE: {pair_label} (SSIM={sim:.3f})")
                elif sim >= self.SSIM_NEAR_DUPLICATE_THRESHOLD:
                    near_duplicates.append((orig_i, orig_j))
                    details.append(f"SIMILAR: {pair_label} (SSIM={sim:.3f})")
        
        # Calculate fraud score
        # Score = 1.0 (all unique) → 0.0 (all duplicates)
        total_pairs = n * (n - 1) / 2
        duplicate_ratio = len(exact_duplicates) / total_pairs if total_pairs > 0 else 0
        near_dup_ratio = len(near_duplicates) / total_pairs if total_pairs > 0 else 0
        
        # Penalize heavily: exact duplicates are very suspicious
        score = 1.0
        score -= duplicate_ratio * 0.8   # Each exact duplicate pair heavily penalizes
        score -= near_dup_ratio * 0.3    # Near duplicates are less suspicious
        score = max(0.0, min(1.0, score))
        
        # Count effective unique images
        # Build a set of images that are duplicates of others
        duplicate_images = set()
        for i, j in exact_duplicates:
            duplicate_images.add(j)  # Mark the later image as duplicate
        effective_unique = len(images) - len(duplicate_images)
        effective_unique = max(1, effective_unique)
        
        if not details:
            details.append(f"All {n} images appear unique")
        
        # Log summary
        summary = f"Checked {n} images: {len(exact_duplicates)} duplicates, {len(near_duplicates)} near-duplicates, {effective_unique} unique"
        details.insert(0, summary)
        
        return {
            'score': round(score, 2),
            'duplicate_pairs': exact_duplicates,
            'near_duplicate_pairs': near_duplicates,
            'exact_duplicate_count': len(exact_duplicates),
            'near_duplicate_count': len(near_duplicates),
            'effective_unique_images': effective_unique,
            'total_images': n,
            'details': details
        }

    # ================================================================
    # EXISTING METHODS
    # ================================================================

    def verify_exif_timestamps(self, image_details: List[Dict], claim_timestamp: datetime) -> Dict:
        """
        Verify EXIF capture timestamps against claim submission time.
        """
        issues = []
        valid_timestamps = 0
        
        for img in image_details:
             exif_ts_str = img.get('exif_timestamp')
             
             if not exif_ts_str:
                 continue

             try:
                 exif_ts = datetime.strptime(exif_ts_str.replace('\x00', ''), '%Y:%m:%d %H:%M:%S')
                 valid_timestamps += 1
                 
                 age = claim_timestamp - exif_ts
                 if age.days > 30:
                     issues.append(f"Image {img.get('filename','?')} is old ({age.days} days)")
                 elif age.days < -1:
                     issues.append(f"Image {img.get('filename','?')} has future timestamp")
                     
             except ValueError:
                 pass
        
        score = 1.0
        if valid_timestamps > 0:
            if len(issues) > 0:
                score -= (len(issues) * 0.2)
        else:
            score = 0.8 
            issues.append("No valid EXIF timestamps found")

        return {
            'score': max(0.0, score),
            'issues': issues,
            'valid_count': valid_timestamps
        }

    def detect_metadata_tampering(self, image_details: List[Dict]) -> Dict:
        """
        Check for software modification traces in metadata.
        """
        software_traces = []
        for img in image_details:
            software = img.get('software', '').lower()
            if any(tool in software for tool in ['photoshop', 'gimp', 'editor', 'paint']):
                software_traces.append(f"Image {img.get('filename')} edited with {software}")
        
        score = 1.0
        if software_traces:
            score -= (len(software_traces) * 0.3)
        
        return {
            'score': max(0.0, score),
            'traces': software_traces
        }

    def calculate_fraud_risk(self, 
                             weather_score: float, 
                             geolocation_score: float, 
                             exif_score: float,
                             tampering_score: float,
                             duplicate_score: float = 1.0) -> Dict:
        """
        Calculate composite fraud risk score.
        High risk score = High probability of fraud.
        
        duplicate_score: 1.0 = all unique, 0.0 = all duplicates
        """
        
        # Invert scores (Verifier scores are Confidence 0-1, Risk is 0-1)
        weather_risk = 1.0 - weather_score
        geo_risk = 1.0 - geolocation_score
        exif_risk = 1.0 - exif_score
        tampering_risk = 1.0 - tampering_score
        duplicate_risk = 1.0 - duplicate_score
        
        # Weighted risk calculation
        # Duplicates and Geolocation are highest fraud indicators
        risk_score = (
            (duplicate_risk * 0.30) +   # Duplicates are very suspicious
            (geo_risk * 0.25) + 
            (tampering_risk * 0.20) + 
            (weather_risk * 0.15) + 
            (exif_risk * 0.10)
        )
        
        # BOOST: If duplicates detected, enforce minimum risk
        if duplicate_risk >= 0.5:
            risk_score = max(risk_score, 0.65)  # At least MEDIUM risk
        if duplicate_risk >= 0.8:
            risk_score = max(risk_score, 0.85)  # At least HIGH risk
        
        risk_level = 'LOW'
        if risk_score >= self.RISK_THRESHOLDS['HIGH']:
            risk_level = 'HIGH'
        elif risk_score >= self.RISK_THRESHOLDS['MEDIUM']:
            risk_level = 'MEDIUM'
            
        return {
            'risk_score': round(risk_score, 2),
            'risk_level': risk_level,
            'auto_reject': risk_score >= self.AUTO_REJECT_SCORE,
            'factors': {
                'duplicate_risk': round(duplicate_risk, 2),
                'geolocation_risk': round(geo_risk, 2),
                'tampering_risk': round(tampering_risk, 2),
                'weather_risk': round(weather_risk, 2),
                'exif_risk': round(exif_risk, 2)
            }
        }
