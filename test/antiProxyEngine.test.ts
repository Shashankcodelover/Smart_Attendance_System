import test from 'node:test';
import assert from 'node:assert/strict';
import { antiProxyEngine, AntiProxyEngine } from '../src/services/antiProxyEngine.ts';

test('AntiProxyEngine rotates QR payload every 5000ms and verifies challenge shape', () => {
    const engine = new AntiProxyEngine('secret_test_key');
    const time1 = 1700000000000;
    const payload1 = engine.generateRotatingQRPayload('sess_math101', time1);

    assert.ok(payload1.token.length > 5);
    assert.ok(payload1.challengeShape);

    // Valid check-in within window
    const check1 = engine.verifyScannedToken('sess_math101', payload1.token, payload1.challengeShape, 'device_iphone_15', time1 + 1000);
    assert.equal(check1.isValid, true);

    // Replay attack prevention: Same device trying to check in again with same token
    const replayCheck = engine.verifyScannedToken('sess_math101', payload1.token, payload1.challengeShape, 'device_iphone_15', time1 + 1000);
    assert.equal(replayCheck.isValid, false);
    assert.ok(replayCheck.reason?.includes('REPLAY ATTACK'));
});

test('AntiProxyEngine rejects expired QR screenshot tokens beyond 10 seconds skew', () => {
    const engine = new AntiProxyEngine('secret_test_key');
    const timeStart = 1700000000000;
    const payload = engine.generateRotatingQRPayload('sess_chem101', timeStart);

    // 15 seconds later (3 windows skew)
    const expiredCheck = engine.verifyScannedToken('sess_chem101', payload.token, payload.challengeShape, 'device_pixel_8', timeStart + 15000);
    assert.equal(expiredCheck.isValid, false);
    assert.ok(expiredCheck.reason?.includes('EXPIRED TOKEN'));
});

test('AntiProxyEngine rejects wrong challenge shape submission', () => {
    const engine = new AntiProxyEngine('secret_test_key');
    const timeStart = 1700000000000;
    const payload = engine.generateRotatingQRPayload('sess_phy101', timeStart);

    const wrongShape = payload.challengeShape === 'GOLD_STAR' ? 'RUBY_DIAMOND' : 'GOLD_STAR';
    const failCheck = engine.verifyScannedToken('sess_phy101', payload.token, wrongShape, 'device_galaxy_s24', timeStart + 1000);
    assert.equal(failCheck.isValid, false);
    assert.ok(failCheck.reason?.includes('CHALLENGE MISMATCH'));
});
