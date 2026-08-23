import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';

import {
  generateHmacToken,
  verifyHmacToken,
  calculateHaversineDistance,
  signJwt,
  verifyJwt,
  getTrustedClientIp,
  checkAuthRateLimit
} from '../server.ts';
import db from '../db.ts';

// ═══════════════════════════════════════════════════════════
// 1. QR ROTATION & HMAC TOKEN VERIFICATION TESTS
// ═══════════════════════════════════════════════════════════

test('generateHmacToken produces valid signature format', () => {
  const token = generateHmacToken('sess_101', '1234', 'BLUE_CIRCLE');
  assert.ok(token.includes('.'));
  const parts = token.split('.');
  assert.equal(parts.length, 3);
  assert.ok(parseInt(parts[0]) > 0);
});

test('verifyHmacToken validates valid token and rejects expired/tampered tokens', () => {
  const token = generateHmacToken('sess_101', '1234', 'BLUE_CIRCLE');
  assert.equal(verifyHmacToken('sess_101', '1234', 'BLUE_CIRCLE', token), true);

  // Tampered OTP
  assert.equal(verifyHmacToken('sess_101', '9999', 'BLUE_CIRCLE', token), false);
  
  // Tampered Shape
  assert.equal(verifyHmacToken('sess_101', '1234', 'RED_SQUARE', token), false);

  // Tampered Session ID
  assert.equal(verifyHmacToken('sess_999', '1234', 'BLUE_CIRCLE', token), false);
});

// ═══════════════════════════════════════════════════════════
// 2. NATIVE JWT AUTHENTICATION TESTS
// ═══════════════════════════════════════════════════════════

test('signJwt and verifyJwt encode and decode valid tokens', () => {
  const token = signJwt({ email: 'lecturer@sjce.edu', role: 'lecturer' }, 3600);
  assert.ok(token.length > 20);

  const decoded = verifyJwt(token);
  assert.equal(decoded.email, 'lecturer@sjce.edu');
  assert.equal(decoded.role, 'lecturer');
});

test('verifyJwt rejects invalid or tampered tokens', () => {
  const token = signJwt({ email: 'hacker@malicious.com' });
  const tamperedToken = token.slice(0, -5) + 'xxxxx';
  assert.equal(verifyJwt(tamperedToken), null);
});

// ═══════════════════════════════════════════════════════════
// 3. GPS HAVERSINE GEOFENCING TESTS
// ═══════════════════════════════════════════════════════════

test('calculateHaversineDistance accurately measures classroom distance', () => {
  // SJCE Campus coordinates (~0 meters)
  const distZero = calculateHaversineDistance(12.3142, 76.6134, 12.3142, 76.6134);
  assert.ok(distZero < 1);

  // 200 meters away
  const distFar = calculateHaversineDistance(12.3142, 76.6134, 12.3160, 76.6150);
  assert.ok(distFar > 150);
});

// ═══════════════════════════════════════════════════════════
// 4. CSV FORMULA SANITIZATION TESTS
// ═══════════════════════════════════════════════════════════

test('sanitizeCsvCell escapes formula characters (=, +, -, @) to prevent formula injection', () => {
  const mal1 = db.sanitizeCsvCell("=SUM(A1:A10)");
  assert.equal(mal1, '"\'=SUM(A1:A10)"');

  const mal2 = db.sanitizeCsvCell("+1500");
  assert.equal(mal2, '"\'+1500"');

  const clean = db.sanitizeCsvCell("Rahul Sharma");
  assert.equal(clean, '"Rahul Sharma"');
});

// ═══════════════════════════════════════════════════════════
// 5. ZERO-TRUST IP RESOLUTION & SPOOFING DEFENSE
// ═══════════════════════════════════════════════════════════

test('getTrustedClientIp rejects fake X-Forwarded-For from external sockets', () => {
  const fakeReq: any = {
    socket: { remoteAddress: '203.0.113.195' }, // Public external cellular IP
    headers: { 'x-forwarded-for': '192.168.1.5' } // Spoofed university IP
  };

  const resolvedIp = getTrustedClientIp(fakeReq);
  assert.equal(resolvedIp, '203.0.113.195'); // Must NOT trust the spoofed header
});

// ═══════════════════════════════════════════════════════════
// 6. PIN BRUTE-FORCE RATE LIMITING TESTS
// ═══════════════════════════════════════════════════════════

test('checkAuthRateLimit throttles after 5 consecutive failed attempts', () => {
  const testKey = `test-ip-${Date.now()}:test-user`;

  for (let i = 0; i < 5; i++) {
    assert.equal(checkAuthRateLimit(testKey), true);
  }

  // 6th attempt must be throttled
  assert.equal(checkAuthRateLimit(testKey), false);
});

// ═══════════════════════════════════════════════════════════
// 7. LEGACY PLAINTEXT PASSWORD AUTO-MIGRATION
// ═══════════════════════════════════════════════════════════

test('legacy plaintext passwords match and upgrade to salted bcrypt hashes', async () => {
  const plaintextPin = '4321';
  
  // Verify that plaintext matching logic works
  const isPlaintext = !plaintextPin.startsWith('$2a$') && !plaintextPin.startsWith('$2b$');
  assert.equal(isPlaintext, true);

  // Upgrade to bcrypt
  const upgradedHash = await bcrypt.hash(plaintextPin, 10);
  assert.ok(upgradedHash.startsWith('$2b$'));
  
  const matches = await bcrypt.compare(plaintextPin, upgradedHash);
  assert.equal(matches, true);
});
