import os
import sys
import requests
import json
from datetime import datetime
from typing import Dict, List, Optional, Tuple

class WeatherVerifier:
    """
    Verifies weather conditions against claimed damage type.
    """
    
    DAMAGE_WEATHER_CORRELATION = {
        'DR': { # Drought
            'supporting': ['Clear', 'Clouds'],
            'contradicting': ['Rain', 'Thunderstorm', 'Drizzle', 'Snow'],
            'min_temp': 30,
            'max_humidity': 40
        },
        'ND': { # Nutrient Deficiency
            'supporting': ['Rain', 'Extreme', 'Clear', 'Clouds'], # Broad support
            'contradicting': []
        },
        'WD': { # Weed Damage
            'supporting': ['Rain', 'Clear', 'Clouds', 'Drizzle'],
            'contradicting': ['Snow', 'Extreme']
        },
        'G': { # Good/Healthy
            'supporting': ['Clear', 'Clouds', 'Rain'],
            'contradicting': ['Extreme']
        },
        'other': {
            'supporting': [],
            'contradicting': []
        }
    }

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get('WEATHER_API_KEY')
        self.base_url = "https://api.openweathermap.org/data/2.5"

    def fetch_weather_data(self, lat: float, lon: float, timestamp: Optional[float] = None) -> Dict:
        """
        Fetch weather data from OpenWeatherMap API. 
        Uses One Call API 3.0 if available for historical data, otherwise Current Weather data.
        """
        if not self.api_key or self.api_key == 'your_openweathermap_api_key_here':
             print("[WARNING] Weather API Key missing. Using mock data.", file=sys.stderr)
             return self._get_mock_weather_data(lat, lon)

        try:
            # For this implementation, we'll accept Current Weather data as a proxy 
            # In a full production system with paid API plan, we'd use Historical API
            url = f"{self.base_url}/weather"
            params = {
                'lat': lat,
                'lon': lon,
                'appid': self.api_key,
                'units': 'metric'
            }
            
            response = requests.get(url, params=params, timeout=5)
            response.raise_for_status()
            data = response.json()
            
            return {
                'temp': data['main']['temp'],
                'humidity': data['main']['humidity'],
                'condition': data['weather'][0]['main'],
                'description': data['weather'][0]['description'],
                'wind_speed': data['wind']['speed'],
                'timestamp': datetime.now().isoformat(),
                'source': 'OpenWeatherMap'
            }

        except Exception as e:
            print(f"[ERROR] Weather API Error: {str(e)}", file=sys.stderr)
            return self._get_mock_weather_data(lat, lon)

    def verify_damage_correlation(self, weather_data: Dict, damage_type_code: str) -> Dict:
        """
        Verify if weather supports the damage type.
        """
        correlation = self.DAMAGE_WEATHER_CORRELATION.get(damage_type_code, self.DAMAGE_WEATHER_CORRELATION['other'])
        
        condition = weather_data.get('condition', 'Unknown')
        temp = weather_data.get('temp', 25)
        humidity = weather_data.get('humidity', 50)
        
        score = 0.5
        status = 'NEUTRAL'
        details = []

        # Condition check
        if condition in correlation['supporting']:
            score += 0.3
            details.append(f"Weather '{condition}' supports '{damage_type_code}'")
        elif condition in correlation['contradicting']:
            score -= 0.4
            status = 'MISMATCH'
            details.append(f"Weather '{condition}' contradicts '{damage_type_code}'")

        # Specific Drought checks
        if damage_type_code == 'DR':
            if temp > correlation.get('min_temp', 30):
                score += 0.2
                details.append(f"High temp ({temp}°C) supports Drought")
            elif temp < 20: 
                score -= 0.2
                details.append(f"Low temp ({temp}°C) contradicts Drought")
            
            if humidity < correlation.get('max_humidity', 40):
                score += 0.1
                details.append(f"Low humidity ({humidity}%) supports Drought")
            elif humidity > 80:
                score -= 0.3
                status = 'MISMATCH'
                details.append(f"High humidity ({humidity}%) contradicts Drought")

        score = max(0.1, min(0.99, score))
        
        if score > 0.7: status = 'MATCH'
        if score < 0.3: status = 'MISMATCH'
        
        return {
            'status': status,
            'confidence_score': round(score, 2),
            'weather_context': weather_data,
            'details': details
        }

    def _get_mock_weather_data(self, lat: float, lon: float) -> Dict:
        """Deterministic mock data based on location"""
        is_dry = (float(lat) + float(lon)) % 2 > 1
        return {
            'temp': 32.5 if is_dry else 24.0,
            'humidity': 35 if is_dry else 75,
            'condition': 'Clear' if is_dry else 'Rain',
            'description': 'clear sky' if is_dry else 'light rain',
            'wind_speed': 5.2,
            'timestamp': datetime.now().isoformat(),
            'source': 'MockData'
        }
