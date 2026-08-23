import test from 'node:test';
import assert from 'node:assert/strict';
import { kalmanGeofenceEngine, KalmanGeofenceEngine } from '../src/services/kalmanGeofenceEngine.ts';

test('KalmanGeofenceEngine smooths noisy GPS readings and computes accurate Haversine distance', () => {
    const engine = new KalmanGeofenceEngine();
    const classroom = { latitude: 12.300000, longitude: 76.600000 };

    // Sequence of 3 noisy readings around classroom
    const noisyReadings = [
        { latitude: 12.300080, longitude: 76.600070, accuracyMeters: 15, timestampMs: 100 },
        { latitude: 12.300040, longitude: 76.600030, accuracyMeters: 10, timestampMs: 200 },
        { latitude: 12.300010, longitude: 76.600010, accuracyMeters: 5, timestampMs: 300 },
    ];

    const result = engine.verifyClassroomGeofence(noisyReadings, classroom, 30);
    assert.equal(result.isInsideClassroom, true);
    assert.ok(result.distanceFromClassroomCenterMeters < 20);
    assert.equal(result.status, 'GEOFENCE_VERIFIED_INSIDE_ROOM');
});

test('KalmanGeofenceEngine detects student outside classroom perimeter', () => {
    const engine = new KalmanGeofenceEngine();
    const classroom = { latitude: 12.300000, longitude: 76.600000 };

    // Reading 500m away (at hostel)
    const hostelReadings = [
        { latitude: 12.305000, longitude: 76.605000, accuracyMeters: 5, timestampMs: 100 },
    ];

    const result = engine.verifyClassroomGeofence(hostelReadings, classroom, 30);
    assert.equal(result.isInsideClassroom, false);
    assert.ok(result.distanceFromClassroomCenterMeters > 300);
    assert.equal(result.status, 'GEOFENCE_VIOLATION_OUTSIDE_RADIUS');
});
