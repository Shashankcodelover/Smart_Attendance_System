/**
 * Smart Attendance: Client-side Rotating OTP & Token Helper (V20).
 * Synchronizes client-side visualization with the lecturer's HMAC tokens.
 */

const SHAPES = ['BLUE_CIRCLE', 'RED_SQUARE', 'GREEN_TRIANGLE', 'YELLOW_STAR'];

/**
 * Calculates a time-seeded OTP code locally based on a 30-second interval.
 */
export function generateLocalOtp(secretSeed: string, timeSkewSeconds: number = 0): string {
    const timestamp = Math.floor((Date.now() + (timeSkewSeconds * 1000)) / 30000);
    // Simple numeric seed generation based on timestamp
    const val = (parseInt(secretSeed) || 1234) * timestamp;
    const code = (1000 + (val % 9000)).toString();
    return code;
}

/**
 * Selects a matching verification shape option based on the local time.
 */
export function getLocalVerificationOption(timestampMs: number = Date.now()): string {
    const interval = Math.floor(timestampMs / 30000);
    return SHAPES[interval % SHAPES.length];
}

/**
 * Decodes the incoming QR token string to verify its timestamp freshness.
 * Format: timestamp.nonce.signature
 */
export function decodeQrToken(token: string): { timestamp: number; nonce: string; expired: boolean } {
    if (!token) return { timestamp: 0, nonce: '', expired: true };
    const parts = token.split('.');
    if (parts.length !== 3) {
        return { timestamp: 0, nonce: '', expired: true };
    }

    const [timestampStr, nonce] = parts;
    const timestamp = parseInt(timestampStr, 10);
    
    // Check if the token's creation time is older than 120 seconds
    const elapsed = Date.now() - timestamp;
    const expired = isNaN(timestamp) || elapsed > 120 * 1000;

    return {
        timestamp,
        nonce,
        expired
    };
}

// ── V21: 5 SCALABLE PREMIUM FEATURES ──

/**
 * 1. Face Signature Matcher Verification (Simulated vector validation)
 */
export function verifyFaceSignature(capturedFaceVector: number[], dbFaceVector: number[]): { match: boolean; confidence: number } {
    if (!capturedFaceVector || !dbFaceVector || capturedFaceVector.length !== dbFaceVector.length) {
        return { match: false, confidence: 0 };
    }
    // Calculate Euclidean distance between vectors
    let sumSq = 0;
    for (let i = 0; i < capturedFaceVector.length; i++) {
        sumSq += Math.pow(capturedFaceVector[i] - dbFaceVector[i], 2);
    }
    const distance = Math.sqrt(sumSq);
    const confidence = Math.max(0, 100 - (distance * 100));
    
    return {
        match: confidence > 85,
        confidence: Math.round(confidence)
    };
}

/**
 * 2. Classroom IP Subnet Guard
 */
export function verifySubnetGuard(clientIP: string, allowedSubnet: string): boolean {
    if (!clientIP || !allowedSubnet) return false;
    
    // Localhost development loopback check
    if (clientIP === '::1' || clientIP === '127.0.0.1' || clientIP === 'localhost') {
        return true;
    }
    
    // Simple check if IP belongs to class subnet block (e.g., "192.168.43.x")
    const clientParts = clientIP.split('.');
    const allowedParts = allowedSubnet.split('.');
    if (clientParts.length !== 4 || allowedParts.length !== 4) return false;
    
    return clientParts[0] === allowedParts[0] &&
           clientParts[1] === allowedParts[1] &&
           clientParts[2] === allowedParts[2];
}

/**
 * 3. Peer-to-Peer Bluetooth Proximity Handshake
 */
export function signPeerHandshake(studentId: string, peerStudentId: string, secretKey: string): string {
    const timestamp = Math.floor(Date.now() / 60000); // 1-minute validity window
    return `PEER-SIG.${studentId}.${peerStudentId}.${timestamp}.${secretKey.substring(0, 6)}`;
}

/**
 * 4. Geolocation Radius Threshold Guard
 */
export function verifyGeolocationRadius(
    studentLat: number,
    studentLng: number,
    lecturerLat: number,
    lecturerLng: number,
    maxRadiusMeters: number = 30
): { withinRange: boolean; distanceMeters: number } {
    const R = 6371e3; // Earth radius in meters
    const phi1 = studentLat * Math.PI / 180;
    const phi2 = lecturerLat * Math.PI / 180;
    const deltaPhi = (lecturerLat - studentLat) * Math.PI / 180;
    const deltaLambda = (lecturerLng - studentLng) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return {
        withinRange: distance <= maxRadiusMeters,
        distanceMeters: Math.round(distance)
    };
}

/**
 * 5. Dynamic Attendance Statistics Rollup
 */
export function calculateRollupMetrics(attendanceRecords: { status: string; date: string }[]): {
    attendanceRate: number;
    streak: number;
    anomaliesCount: number;
} {
    if (attendanceRecords.length === 0) {
        return { attendanceRate: 0, streak: 0, anomaliesCount: 0 };
    }

    const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
    const attendanceRate = Math.round((presentCount / attendanceRecords.length) * 100);

    // Calculate current streak
    let streak = 0;
    const sorted = [...attendanceRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    for (const record of sorted) {
        if (record.status === 'present') {
            streak++;
        } else {
            break;
        }
    }

    // Count anomalies (e.g. marked present twice on same date or flag anomalies)
    const dates = attendanceRecords.map(r => r.date);
    const uniqueDates = new Set(dates);
    const anomaliesCount = attendanceRecords.length - uniqueDates.size;

    return {
        attendanceRate,
        streak,
        anomaliesCount
    };
}
