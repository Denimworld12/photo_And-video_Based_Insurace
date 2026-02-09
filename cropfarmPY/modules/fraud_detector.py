
from typing import List, Dict
from datetime import datetime, timedelta
import numpy as np

class FraudDetector:
    """
    Detects suspicious patterns and potential fraud in claims.
    """
    
    def __init__(self):
        self.RISK_THRESHOLDS = {
            'LOW': 0.3,
            'MEDIUM': 0.6,
            'HIGH': 0.8
        }
        self.AUTO_REJECT_SCORE = 0.9

    def verify_exif_timestamps(self, image_details: List[Dict], claim_timestamp: datetime) -> Dict:
        """
        Verify EXIF capture timestamps against claim submission time.
        """
        issues = []
        valid_timestamps = 0
        
        for img in image_details:
             # This assumes image_details has 'exif' dict possibly populated
             # In main_pipeline we need to ensure this is passed through
             exif_ts_str = img.get('exif_timestamp') # Standard format "YYYY:MM:DD HH:MM:SS"
             
             if not exif_ts_str:
                 continue

             try:
                 # Clean up standard EXIF format
                 exif_ts = datetime.strptime(exif_ts_str.replace('\x00', ''), '%Y:%m:%d %H:%M:%S')
                 valid_timestamps += 1
                 
                 # Check age
                 age = claim_timestamp - exif_ts
                 if age.days > 30:
                     issues.append(f"Image {img.get('filename','?')} is old ({age.days} days)")
                 elif age.days < -1: # Future timestamp
                     issues.append(f"Image {img.get('filename','?')} has future timestamp")
                     
             except ValueError:
                 pass
        
        score = 1.0
        if valid_timestamps > 0:
            if len(issues) > 0:
                score -= (len(issues) * 0.2)
        else:
            # No EXIF timestamps is suspicious but not proof of fraud (could be stripped)
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
                             tampering_score: float) -> Dict:
        """
        Calculate composite fraud risk score.
        High risk score = High probability of fraud.
        """
        
        # Invert scores (Verifier scores are Confidence 0-1, Risk is 0-1)
        weather_risk = 1.0 - weather_score
        geo_risk = 1.0 - geolocation_score
        exif_risk = 1.0 - exif_score
        tampering_risk = 1.0 - tampering_score
        
        # Weighted risk calculation
        # Geolocation and Tampering are highest indicators
        risk_score = (
            (geo_risk * 0.35) + 
            (tampering_risk * 0.25) + 
            (weather_risk * 0.25) + 
            (exif_risk * 0.15)
        )
        
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
                'geolocation_risk': round(geo_risk, 2),
                'tampering_risk': round(tampering_risk, 2),
                'weather_risk': round(weather_risk, 2)
            }
        }
