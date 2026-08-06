import test from 'node:test';
import assert from 'node:assert/strict';

// Core Smart Attendance QR Rotation & Security Verification Logic Unit Tests

function generateRotatedQrToken(sessionSecret: string, timestampWindow: number): string {
  const windowId = Math.floor(timestampWindow / 30000); // 30-second rotation window
  return `qr_${sessionSecret}_win_${windowId}`;
}

function verifyQrToken(token: string, sessionSecret: string, currentTimestamp: number): boolean {
  const currentWindow = Math.floor(currentTimestamp / 30000);
  const previousWindow = currentWindow - 1; // Allow 30s grace period for network latency
  
  const expectedCurrent = `qr_${sessionSecret}_win_${currentWindow}`;
  const expectedPrevious = `qr_${sessionSecret}_win_${previousWindow}`;
  
  return token === expectedCurrent || token === expectedPrevious;
}

test('generateRotatedQrToken produces deterministic window-based tokens', () => {
  const t1 = 1700000000000;
  const token1 = generateRotatedQrToken('secret_123', t1);
  const token2 = generateRotatedQrToken('secret_123', t1 + 5000); // within same 30s window
  assert.equal(token1, token2);
});

test('verifyQrToken accepts current and previous window tokens within grace period', () => {
  const now = 1700000000000;
  const validToken = generateRotatedQrToken('secret_123', now);
  assert.equal(verifyQrToken(validToken, 'secret_123', now), true);
});

test('verifyQrToken rejects tokens from expired windows', () => {
  const now = 1700000000000;
  const expiredTimestamp = now - 120000; // 2 minutes ago
  const expiredToken = generateRotatedQrToken('secret_123', expiredTimestamp);
  assert.equal(verifyQrToken(expiredToken, 'secret_123', now), false);
});
