import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineSyncEngine, OfflineSyncEngine } from '../src/services/offlineSyncEngine.ts';

test('OfflineSyncEngine creates signed receipts and syncs batch with idempotency', () => {
    const engine = new OfflineSyncEngine('offline_test_secret');
    const sessionStart = 1700000000000;
    const sessionEnd = 1700003600000; // 1 hour session

    const r1 = engine.createOfflineReceipt('4JC21CS001', 'Preetham', 'sess_lab1', 'tok_123', sessionStart + 600000);
    const r2 = engine.createOfflineReceipt('4JC21CS002', 'Aditya', 'sess_lab1', 'tok_456', sessionStart + 1200000);

    const syncResult = engine.syncReceiptBatch([r1, r2], sessionStart, sessionEnd);
    assert.equal(syncResult.acceptedCount, 2);
    assert.equal(syncResult.rejectedCount, 0);

    // Duplicate sync attempt
    const dupResult = engine.syncReceiptBatch([r1], sessionStart, sessionEnd);
    assert.equal(dupResult.acceptedCount, 0);
    assert.equal(dupResult.rejectedCount, 1);
});

test('OfflineSyncEngine rejects tampered offline receipts', () => {
    const engine = new OfflineSyncEngine('offline_test_secret');
    const sessionStart = 1700000000000;
    const sessionEnd = 1700003600000;

    const rcpt = engine.createOfflineReceipt('4JC21CS001', 'Preetham', 'sess_lab1', 'tok_123', sessionStart + 600000);
    rcpt.signature = 'forged_signature_hex';

    const syncResult = engine.syncReceiptBatch([rcpt], sessionStart, sessionEnd);
    assert.equal(syncResult.acceptedCount, 0);
    assert.equal(syncResult.rejectedCount, 1);
    assert.equal(syncResult.processedReceipts[0].reason, 'Invalid cryptographic signature');
});
