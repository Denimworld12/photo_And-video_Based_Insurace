
import math
from typing import List, Dict, Tuple, Optional
import numpy as np
from collections import Counter

class GeolocationVerifier:
    """
    Verifies geolocation data consistency and validity.
    """
    
    def __init__(self):
        self.MAX_CLUSTER_SPREAD_KM = 5.0
        self.WARNING_THRESHOLD_KM = 2.0
        self.EARTH_RADIUS_KM = 6371.0

    def haversine_distance(self, coord1: Dict, coord2: Dict) -> float:
        """
        Calculate Haversine distance between two points in km.
        coord: {'lat': float, 'lon': float}
        """
        lat1, lon1 = math.radians(coord1['lat']), math.radians(coord1['lon'])
        lat2, lon2 = math.radians(coord2['lat']), math.radians(coord2['lon'])

        dlat = lat2 - lat1
        dlon = lon2 - lon1

        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

        return self.EARTH_RADIUS_KM * c

    def get_center_coordinate(self, coordinates: List[Dict]) -> Dict:
        """Calculate centroid of coordinates"""
        if not coordinates:
            return None
        
        avg_lat = sum(c['lat'] for c in coordinates) / len(coordinates)
        avg_lon = sum(c['lon'] for c in coordinates) / len(coordinates)
        
        return {'lat': avg_lat, 'lon': avg_lon}

    def analyze_coordinate_cluster(self, coordinates: List[Dict]) -> Dict:
        """
        Analyze spread and consistency of a list of coordinates.
        """
        if not coordinates or len(coordinates) == 0:
            return {
                'status': 'WARNING',
                'score': 0.5,
                'details': ['No coordinates provided']
            }

        center = self.get_center_coordinate(coordinates)
        
        # Calculate max spread
        max_dist = 0
        distances = []
        
        for coord in coordinates:
            dist = self.haversine_distance(center, coord)
            distances.append(dist)
            if dist > max_dist:
                max_dist = dist
        
        avg_dist = sum(distances) / len(distances) if distances else 0
        
        # Determine status
        score = 1.0
        status = 'PASS'
        details = []
        
        if max_dist > self.MAX_CLUSTER_SPREAD_KM:
            status = 'FAIL'
            score = 0.2
            details.append(f"Extreme coordinate spread: {max_dist:.2f}km (> {self.MAX_CLUSTER_SPREAD_KM}km)")
        elif max_dist > self.WARNING_THRESHOLD_KM:
            status = 'WARNING'
            score = 0.6
            details.append(f"Wide coordinate spread: {max_dist:.2f}km")
        else:
            details.append(f"Coordinates clustered within {max_dist:.2f}km")

        # Detect outliers (Z-score like approach)
        outliers = []
        if len(distances) >= 3 and avg_dist > 0.01: # Only if we have enough points and some spread
             std_dev = np.std(distances)
             if std_dev > 0:
                 for i, dist in enumerate(distances):
                     if abs(dist - avg_dist) > 2 * std_dev and dist > 0.5: # 2 sigma and at least 500m
                         outliers.append(i)
        
        if outliers:
            score -= (len(outliers) * 0.1)
            details.append(f"Detected {len(outliers)} outlier locations")

        return {
            'status': status,
            'score': round(max(0.0, min(1.0, score)), 2),
            'center': center,
            'max_spread_km': round(max_dist, 2),
            'avg_spread_km': round(avg_dist, 2),
            'outlier_count': len(outliers),
            'details': details
        }
