const axios = require('axios');

// Weather-Damage Correlation Matrix
// Maps damage types to supporting weather conditions
const DAMAGE_WEATHER_CORRELATION = {
    'DR': { // Drought
        supporting: ['Clear', 'Clouds'], // Low rain
        contradicting: ['Rain', 'Thunderstorm', 'Drizzle'],
        minTemp: 30, // High temp supports drought
        maxHumidity: 40 // Low humidity supports drought
    },
    'ND': { // Nutrient Deficiency
        // Less direct weather correlation, but extreme rain can wash away nutrients
        supporting: ['Rain', 'Extreme'],
        contradicting: []
    },
    'WD': { // Weed Damage
        // Warm and wet conditions favor weeds
        supporting: ['Rain', 'Clear', 'Clouds'],
        contradicting: ['Snow', 'Extreme']
    },
    'G': { // Good/Healthy
        supporting: ['Clear', 'Clouds', 'Rain'], // Moderate conditions
        contradicting: ['Extreme']
    },
    'other': {
        supporting: [],
        contradicting: []
    }
};

class WeatherService {
    constructor() {
        this.apiKey = process.env.WEATHER_API_KEY;
        this.baseUrl = 'https://api.openweathermap.org/data/2.5';
        this.cache = new Map();
        this.CACHE_TTL = 3600 * 1000; // 1 hour
    }

    /**
     * Get current weather for coordinates
     */
    async getCurrentWeather(lat, lon) {
        try {
            // Check cache
            const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
            if (this.cache.has(cacheKey)) {
                const { data, timestamp } = this.cache.get(cacheKey);
                if (Date.now() - timestamp < this.CACHE_TTL) {
                    return data;
                }
            }

            if (!this.apiKey || this.apiKey === 'your_openweathermap_api_key_here') {
                console.warn('⚠️ Weather API Key not configured. Using mock data.');
                return this._getMockWeatherData(lat, lon);
            }

            const response = await axios.get(`${this.baseUrl}/weather`, {
                params: {
                    lat,
                    lon,
                    appid: this.apiKey,
                    units: 'metric'
                }
            });

            const weatherData = {
                temp: response.data.main.temp,
                humidity: response.data.main.humidity,
                condition: response.data.weather[0].main,
                description: response.data.weather[0].description,
                windSpeed: response.data.wind.speed,
                timestamp: Date.now()
            };

            // Update cache
            this.cache.set(cacheKey, { data: weatherData, timestamp: Date.now() });

            return weatherData;
        } catch (error) {
            console.error('❌ Weather API Error:', error.message);
            // Fallback to mock data in case of error to prevent blocking
            return this._getMockWeatherData(lat, lon);
        }
    }

    /**
     * Verify if weather conditions support the claimed damage type
     */
    async verifyWeatherDamageCorrelation(lat, lon, damageType, claimTimestamp) {
        try {
            // For now using current weather as a proxy for recent conditions
            // Ideally would use historical API for past dates
            const weather = await this.getCurrentWeather(lat, lon);

            const correlation = DAMAGE_WEATHER_CORRELATION[damageType] || DAMAGE_WEATHER_CORRELATION['other'];
            let score = 0.5; // Default neutral score
            let status = 'NEUTRAL';
            let details = [];

            // Check conditions
            if (correlation.supporting.includes(weather.condition)) {
                score += 0.3;
                details.push(`Weather condition '${weather.condition}' supports '${damageType}'`);
            } else if (correlation.contradicting.includes(weather.condition)) {
                score -= 0.4;
                details.push(`Weather condition '${weather.condition}' contradicts '${damageType}'`);
                status = 'MISMATCH';
            }

            // Check specific parameters for Drought
            if (damageType === 'DR') {
                if (weather.temp > correlation.minTemp) {
                    score += 0.2;
                    details.push(`High temperature (${weather.temp}°C) supports Drought claim`);
                } else if (weather.temp < 20) {
                    score -= 0.2;
                    details.push(`Low temperature (${weather.temp}°C) contradicts Drought claim`);
                }

                if (weather.humidity < correlation.maxHumidity) {
                    score += 0.1;
                    details.push(`Low humidity (${weather.humidity}%) supports Drought claim`);
                } else if (weather.humidity > 80) {
                    score -= 0.3;
                    status = 'MISMATCH';
                    details.push(`High humidity (${weather.humidity}%) contradicts Drought claim`);
                }
            }

            // Cap score
            score = Math.max(0.1, Math.min(0.99, score));

            if (score > 0.7) status = 'MATCH';
            if (score < 0.3) status = 'MISMATCH';

            return {
                status,
                score,
                weather_context: weather,
                details
            };

        } catch (error) {
            console.error('Weather verification failed:', error);
            return {
                status: 'UNKNOWN',
                score: 0.5,
                error: error.message
            };
        }
    }

    _getMockWeatherData(lat, lon) {
        // Deterministic mock based on coordinates
        const isDry = (lat + lon) % 2 > 1;
        return {
            temp: isDry ? 32 : 24,
            humidity: isDry ? 35 : 75,
            condition: isDry ? 'Clear' : 'Rain',
            description: isDry ? 'clear sky' : 'light rain',
            windSpeed: 5.2,
            timestamp: Date.now(),
            isMock: true
        };
    }
}

module.exports = new WeatherService();
