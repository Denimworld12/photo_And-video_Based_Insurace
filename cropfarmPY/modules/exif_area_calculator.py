"""
EXIF-Based Area Calculator for Crop Damage Assessment
======================================================
This module extracts EXIF data from images to calculate ground coverage area.
Used ONLY during inference (production) - NOT during training.

Usage:
    from exif_area_calculator import EXIFAreaCalculator
    
    calculator = EXIFAreaCalculator()
    coverage = calculator.get_image_coverage(image_path)
    # Returns: {'coverage_m2': 1500.0, 'method': 'EXIF'/'ESTIMATED', 'altitude_m': 50.0}
"""

import os
import sys
import math
from typing import Dict, Optional, Tuple, List
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS


class EXIFAreaCalculator:
    """
    Extracts EXIF GPS/altitude data from images to calculate ground coverage.
    Falls back to estimation if EXIF data is unavailable.
    
    This class is ONLY used during inference (production assessment).
    Training pipeline does not use this - it only trains on pixel patterns.
    """
    
    # Default assumptions (fallback when no EXIF)
    DEFAULT_ALTITUDE_M = 50.0       # Assumed drone height
    DEFAULT_FOV_DEGREES = 60.0      # Typical drone camera FOV
    DEFAULT_COVERAGE_M2 = 1500.0    # Fallback coverage per image
    
    # Conversion constants
    ACRES_TO_M2 = 4046.8564224      # 1 acre = 4046.86 m²
    M2_TO_ACRES = 1 / ACRES_TO_M2   # 1 m² = 0.000247 acres
    
    def __init__(self, default_fov_degrees: float = 60.0):
        """
        Initialize the calculator.
        
        Args:
            default_fov_degrees: Camera field of view (default 60° for typical drones)
        """
        self.default_fov = default_fov_degrees
    
    @staticmethod
    def acres_to_m2(acres: float) -> float:
        """Convert acres to square meters."""
        return acres * EXIFAreaCalculator.ACRES_TO_M2
    
    @staticmethod
    def m2_to_acres(m2: float) -> float:
        """Convert square meters to acres."""
        return m2 * EXIFAreaCalculator.M2_TO_ACRES
    
    def _get_exif_data(self, image_path: str) -> Optional[Dict]:
        """
        Extract EXIF data from image.
        
        Returns:
            Dict with EXIF tags or None if unavailable
        """
        try:
            img = Image.open(image_path)
            exif_data = img._getexif()
            
            if exif_data is None:
                return None
            
            # Convert tag IDs to names
            exif = {}
            for tag_id, value in exif_data.items():
                tag_name = TAGS.get(tag_id, tag_id)
                exif[tag_name] = value
            
            return exif
        except Exception as e:
            return None
    
    def _extract_gps_info(self, exif: Dict) -> Optional[Dict]:
        """
        Extract GPS information from EXIF data.
        
        Returns:
            Dict with altitude, latitude, longitude or None
        """
        if 'GPSInfo' not in exif:
            return None
        
        gps_info = exif['GPSInfo']
        
        # Decode GPS tags
        gps_data = {}
        for tag_id, value in gps_info.items():
            tag_name = GPSTAGS.get(tag_id, tag_id)
            gps_data[tag_name] = value
        
        result = {}
        
        # Extract altitude
        if 'GPSAltitude' in gps_data:
            try:
                altitude = gps_data['GPSAltitude']
                # Handle IFDRational type
                if hasattr(altitude, 'numerator'):
                    result['altitude_m'] = float(altitude.numerator) / float(altitude.denominator)
                else:
                    result['altitude_m'] = float(altitude)
            except:
                pass
        
        # Extract latitude
        if 'GPSLatitude' in gps_data and 'GPSLatitudeRef' in gps_data:
            try:
                lat = self._convert_to_degrees(gps_data['GPSLatitude'])
                if gps_data['GPSLatitudeRef'] == 'S':
                    lat = -lat
                result['latitude'] = lat
            except:
                pass
        
        # Extract longitude
        if 'GPSLongitude' in gps_data and 'GPSLongitudeRef' in gps_data:
            try:
                lon = self._convert_to_degrees(gps_data['GPSLongitude'])
                if gps_data['GPSLongitudeRef'] == 'W':
                    lon = -lon
                result['longitude'] = lon
            except:
                pass
        
        return result if result else None
    
    def _convert_to_degrees(self, value) -> float:
        """Convert GPS coordinates to degrees."""
        def to_float(v):
            if hasattr(v, 'numerator'):
                return float(v.numerator) / float(v.denominator)
            return float(v)
        
        d = to_float(value[0])
        m = to_float(value[1])
        s = to_float(value[2])
        
        return d + (m / 60.0) + (s / 3600.0)
    
    def _extract_focal_length(self, exif: Dict) -> Optional[float]:
        """Extract focal length from EXIF."""
        if 'FocalLength' in exif:
            try:
                fl = exif['FocalLength']
                if hasattr(fl, 'numerator'):
                    return float(fl.numerator) / float(fl.denominator)
                return float(fl)
            except:
                pass
        return None
    
    def calculate_ground_coverage(self, altitude_m: float, 
                                   fov_degrees: float = None,
                                   image_width: int = None,
                                   image_height: int = None) -> float:
        """
        Calculate ground coverage area from altitude and FOV.
        
        Formula: Coverage = (2 * altitude * tan(FOV/2))²
        
        Args:
            altitude_m: Height above ground in meters
            fov_degrees: Camera field of view (uses default if None)
            image_width: Image width for aspect ratio correction
            image_height: Image height for aspect ratio correction
        
        Returns:
            Ground coverage in square meters
        """
        fov = fov_degrees or self.default_fov
        fov_rad = math.radians(fov)
        
        # Ground width covered
        ground_width = 2 * altitude_m * math.tan(fov_rad / 2)
        
        # Apply aspect ratio if available
        if image_width and image_height:
            aspect_ratio = image_width / image_height
            ground_height = ground_width / aspect_ratio
        else:
            ground_height = ground_width  # Assume square
        
        return ground_width * ground_height
    
    def get_image_coverage(self, image_path: str) -> Dict:
        """
        Get ground coverage for a single image.
        
        Priority:
        1. EXIF GPS altitude → calculate coverage
        2. Fallback to default estimation
        
        Args:
            image_path: Path to the image file
        
        Returns:
            Dict with coverage_m2, method, and optional altitude/gps
        """
        result = {
            'coverage_m2': self.DEFAULT_COVERAGE_M2,
            'method': 'ESTIMATED',
            'altitude_m': None,
            'latitude': None,
            'longitude': None
        }
        
        # Try to extract EXIF
        exif = self._get_exif_data(image_path)
        
        if exif:
            # Get image dimensions
            try:
                img = Image.open(image_path)
                width, height = img.size
            except:
                width, height = None, None
            
            # Try to get GPS data
            gps_info = self._extract_gps_info(exif)
            
            if gps_info and 'altitude_m' in gps_info:
                altitude = gps_info['altitude_m']
                coverage = self.calculate_ground_coverage(
                    altitude_m=altitude,
                    image_width=width,
                    image_height=height
                )
                
                result['coverage_m2'] = coverage
                result['method'] = 'EXIF'
                result['altitude_m'] = altitude
                result['latitude'] = gps_info.get('latitude')
                result['longitude'] = gps_info.get('longitude')
        
        return result
    
    def get_total_coverage(self, image_paths: List[str], 
                           overlap_factor: float = 1.0) -> Dict:
        """
        Calculate total coverage from multiple images.
        
        Args:
            image_paths: List of image file paths
            overlap_factor: Factor to account for image overlap (0-1, 1=no overlap)
        
        Returns:
            Dict with total coverage, per-image details, method breakdown
        """
        coverages = []
        exif_count = 0
        estimated_count = 0
        
        for path in image_paths:
            coverage = self.get_image_coverage(path)
            coverages.append({
                'path': os.path.basename(path),
                **coverage
            })
            
            if coverage['method'] == 'EXIF':
                exif_count += 1
            else:
                estimated_count += 1
        
        total_coverage = sum(c['coverage_m2'] for c in coverages) * overlap_factor
        
        # Determine overall method
        if exif_count == len(image_paths):
            method = 'EXIF'
        elif exif_count > 0:
            method = 'HYBRID'
        else:
            method = 'ESTIMATED'
        
        return {
            'total_coverage_m2': total_coverage,
            'total_coverage_acres': self.m2_to_acres(total_coverage),
            'method': method,
            'exif_images': exif_count,
            'estimated_images': estimated_count,
            'per_image': coverages
        }


def calculate_damaged_area(total_field_area_m2: float,
                           damage_percentage: float,
                           variance_factor: float = 0.15) -> Dict:
    """
    Calculate damaged area with range (for insurance reporting).
    
    Args:
        total_field_area_m2: Total field area in square meters
        damage_percentage: Percentage of field damaged (0-100)
        variance_factor: Uncertainty factor (default ±15%)
    
    Returns:
        Dict with min/mean/max damaged area in m² and acres
    """
    mean_area = total_field_area_m2 * (damage_percentage / 100)
    min_area = mean_area * (1 - variance_factor)
    max_area = mean_area * (1 + variance_factor)
    
    return {
        'damaged_area_m2': {
            'min': round(min_area, 1),
            'mean': round(mean_area, 1),
            'max': round(max_area, 1)
        },
        'damaged_area_acres': {
            'min': round(EXIFAreaCalculator.m2_to_acres(min_area), 4),
            'mean': round(EXIFAreaCalculator.m2_to_acres(mean_area), 4),
            'max': round(EXIFAreaCalculator.m2_to_acres(max_area), 4)
        }
    }


# Convenience functions for farmer input
def acres_to_m2(acres: float) -> float:
    """Convert farmer's acres input to square meters."""
    return EXIFAreaCalculator.acres_to_m2(acres)


def m2_to_acres(m2: float) -> float:
    """Convert square meters to acres for display."""
    return EXIFAreaCalculator.m2_to_acres(m2)


if __name__ == "__main__":
    # Test the calculator
    calc = EXIFAreaCalculator()
    
    print("=" * 50)
    print("EXIF Area Calculator Test")
    print("=" * 50)
    
    # Test conversion
    print(f"\n5 acres = {acres_to_m2(5):.2f} m²")
    print(f"20234 m² = {m2_to_acres(20234):.4f} acres")
    
    # Test coverage calculation
    coverage = calc.calculate_ground_coverage(altitude_m=50, fov_degrees=60)
    print(f"\nAt 50m altitude with 60° FOV: {coverage:.2f} m² coverage")
    
    print("\n[OK] Calculator ready for production use!", file=sys.stderr)
