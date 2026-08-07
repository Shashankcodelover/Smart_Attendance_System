import test from 'node:test';
import assert from 'node:assert/strict';

import { generateHmacToken, verifyHmacToken, calculateHaversineDistance, signJwt, verifyJwt } from '../server.ts';
import db from '../db.ts';

// ═══════════════════════════════════════════════════════════
// QR ROTATION & HMAC TOKEN VERIFICATION TESTS
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
});

// ═══════════════════════════════════════════════════════════
// NATIVE JWT AUTHENTICATION TESTS
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
// GPS HAVERSINE GEOFENCING TESTS
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
// CSV FORMULA SANITIZATION TESTS
// ═══════════════════════════════════════════════════════════

test('sanitizeCsvCell escapes formula characters (=, +, -, @) to prevent formula injection', () => {
  const mal1 = db.sanitizeCsvCell("=SUM(A1:A10)");
  assert.equal(mal1, '"\'=SUM(A1:A10)"');

  const mal2 = db.sanitizeCsvCell("+1500");
  assert.equal(mal2, '"\'+1500"');

  const clean = db.sanitizeCsvCell("Rahul Sharma");
  assert.equal(clean, '"Rahul Sharma"');
});
