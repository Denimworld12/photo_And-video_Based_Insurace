"""Simpler test for duplicate detection."""
import cv2, numpy as np, os, shutil, sys, hashlib
sys.path.insert(0, '.')
from modules.fraud_detector import FraudDetector

os.makedirs('test_fraud', exist_ok=True)
fd = FraudDetector()

# Create 4 genuinely different test images using VERY different content
# Image 1: Green field
img1 = np.full((300, 300, 3), [30, 140, 30], dtype=np.uint8)
img1[:150, :] = [50, 180, 50]  # Brighter top half
cv2.imwrite('test_fraud/field1.png', img1)

# Image 2: Brown damaged area  
img2 = np.full((300, 300, 3), [40, 80, 130], dtype=np.uint8)
img2[100:200, 100:200] = [20, 60, 100]  # Dark patch
cv2.imwrite('test_fraud/field2.png', img2)

# Image 3: Mixed green/yellow
img3 = np.full((300, 300, 3), [30, 160, 160], dtype=np.uint8)
img3[:, :150] = [35, 200, 50]  # Left green, right yellow
cv2.imwrite('test_fraud/field3.png', img3)

# Image 4: Sky/water blue
img4 = np.full((300, 300, 3), [200, 130, 50], dtype=np.uint8)
cv2.imwrite('test_fraud/field4.png', img4)

# Check file hashes
for f in ['test_fraud/field1.png','test_fraud/field2.png','test_fraud/field3.png','test_fraud/field4.png']:
    h = hashlib.md5(open(f,'rb').read()).hexdigest()
    print(f"  {os.path.basename(f)}: md5={h[:12]}... size={os.path.getsize(f)}")

print("\n--- TEST 1: All unique images ---")
r1 = fd.detect_duplicate_images([
    'test_fraud/field1.png',
    'test_fraud/field2.png',
    'test_fraud/field3.png',
    'test_fraud/field4.png'
])
print(f"  exact={r1['exact_duplicate_count']}, near={r1['near_duplicate_count']}, score={r1['score']}")
for d in r1['details']:
    print(f"    {d}")

if r1['exact_duplicate_count'] == 0:
    print("  PASS: No false positives!")
else:
    print(f"  FAIL: Got {r1['exact_duplicate_count']} false exact duplicates!")

# TEST 2: Copy one file
shutil.copy2('test_fraud/field1.png', 'test_fraud/field1_copy.png')
print("\n--- TEST 2: 4 unique + 1 file copy ---")
r2 = fd.detect_duplicate_images([
    'test_fraud/field1.png',
    'test_fraud/field1_copy.png',
    'test_fraud/field2.png',
    'test_fraud/field3.png'
])
print(f"  exact={r2['exact_duplicate_count']}, near={r2['near_duplicate_count']}, score={r2['score']}")
for d in r2['details']:
    print(f"    {d}")

if r2['exact_duplicate_count'] == 1:
    print("  PASS: Correctly detected 1 exact duplicate!")
else:
    print(f"  FAIL: Expected 1 exact, got {r2['exact_duplicate_count']}")

shutil.rmtree('test_fraud')
print("\nDone!")
