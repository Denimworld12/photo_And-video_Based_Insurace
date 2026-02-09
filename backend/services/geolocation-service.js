const geolib = require('geolib');

class GeolocationService {
    constructor() {
        // Configuration
        this.MAX_CLUSTER_SPREAD_KM = 5.0; // Max allowed distance between points
        this.WARNING_THRESHOLD_KM = 2.0;  // Warn if spread > 2km
        this.EXIF_USER_TOLERANCE_M = 100; // Allow 100m diff between EXIF and User location
    }

    /**
     * Verify a set of coordinates from a claim
     * @param {Array} coordinatesList - Array of {lat, lon, source} objects
     * @param {Object} userLocation - {lat, lon} provided by user/browser
     */
    verifyCoordinates(coordinatesList, userLocation) {
        if (!coordinatesList || coordinatesList.length === 0) {
            return {
                status: 'WARNING',
                score: 0.5,
                details: ['No image coordinates available for verification']
            };
        }

        const validCoords = coordinatesList.filter(c => c && !isNaN(c.lat) && !isNaN(c.lon));

        if (validCoords.length === 0) {
            return {
                status: 'WARNING',
                score: 0.5,
                details: ['No valid GPS data found in images']
            };
        }

        const results = {
            status: 'PASS',
            score: 1.0,
            details: [],
            metrics: {}
        };

        // 1. Check Consistency (Clustering)
        const center = geolib.getCenter(validCoords);
        results.metrics.center = center;

        // Calculate max distance from center
        let maxDist = 0;
        validCoords.forEach(c => {
            const dist = geolib.getDistance(center, c);
            if (dist > maxDist) maxDist = dist;
        });

        const spreadKm = maxDist / 1000;
        results.metrics.spread_km = spreadKm;

        if (spreadKm > this.MAX_CLUSTER_SPREAD_KM) {
            results.status = 'FAIL';
            results.score -= 0.6;
            results.details.push(`Extreme coordinate spread (${spreadKm.toFixed(2)}km). Images verify different locations.`);
        } else if (spreadKm > this.WARNING_THRESHOLD_KM) {
            results.status = 'WARNING';
            results.score -= 0.3;
            results.details.push(`High coordinate spread (${spreadKm.toFixed(2)}km). Verification required.`);
        } else {
            results.details.push(`Coordinate spread normal (${spreadKm.toFixed(2)}km).`);
        }

        // 2. Outlier Detection
        const outliers = this._detectOutliers(validCoords, center);
        if (outliers.length > 0) {
            results.score -= (outliers.length * 0.1);
            results.details.push(`Detected ${outliers.length} location outliers.`);
        }

        // 3. User Location Match
        if (userLocation && userLocation.lat) {
            const userDist = geolib.getDistance(center, userLocation);
            results.metrics.dist_to_user_m = userDist;

            if (userDist > this.EXIF_USER_TOLERANCE_M * 5) { // Strict check > 500m
                results.score -= 0.3;
                results.details.push(`Mismatch between user location and image locations (${userDist}m).`);
                if (results.status === 'PASS') results.status = 'WARNING';
            } else {
                results.details.push(`User location matches image cluster (within ${userDist}m).`);
            }
        }

        results.score = Math.max(0, Math.min(1, results.score));
        return results;
    }

    _detectOutliers(coords, center) {
        // Simple Z-score like outlier detection based on distance from center
        const distances = coords.map(c => geolib.getDistance(center, c));
        const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
        // Identify points > 3x average average distance (if avg > 10m to avoid noise)
        if (avgDist < 10) return [];

        return coords.filter((c, i) => distances[i] > avgDist * 3);
    }
}

module.exports = new GeolocationService();
