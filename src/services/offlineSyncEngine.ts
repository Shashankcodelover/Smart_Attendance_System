/**
 * Offline-First Cryptographic Check-in Vault & Sync — Smart Attendance IR-11 / Enterprise
 * 
 * 1. Offline Receipt Generator: Creates local HMAC/cryptographic receipt on student device when offline.
 * 2. Idempotent Batch Sync: Uploads queued offline receipts with duplicate check-in prevention.
 * 3. Timestamp & Replay Guard: Validates that offline scan occurred within valid lecture session window.
 */

import crypto from 'crypto';

export interface OfflineCheckinReceipt {
    receiptId: string;
    studentUsn: string;
    studentName: string;
    sessionId: string;
    scannedToken: string;
    clientTimestamp: number;
    signature: string;
}

export class OfflineSyncEngine {
    private syncedReceiptIds: Set<string> = new Set();
    private secretKey: string;

    constructor(secretKey: string = 'offline_vault_secret') {
        this.secretKey = secretKey;
    }

    /**
     * Generates a tamper-proof offline receipt on the client device.
     */
    createOfflineReceipt(
        studentUsn: string,
        studentName: string,
        sessionId: string,
        scannedToken: string,
        clientTimestamp: number = Date.now()
    ): OfflineCheckinReceipt {
        const raw = `${studentUsn}:${sessionId}:${scannedToken}:${clientTimestamp}`;
        const signature = crypto.createHmac('sha256', this.secretKey).update(raw).digest('hex');
        const receiptId = `rcpt_${crypto.randomBytes(6).toString('hex')}`;

        return {
            receiptId,
            studentUsn,
            studentName,
            sessionId,
            scannedToken,
            clientTimestamp,
            signature,
        };
    }

    /**
     * Verifies and syncs a batch of offline receipts into the database.
     */
    syncReceiptBatch(
        receipts: OfflineCheckinReceipt[],
        sessionStartTime: number,
        sessionEndTime: number
    ) {
        const results = {
            acceptedCount: 0,
            rejectedCount: 0,
            processedReceipts: [] as Array<{ receiptId: string; status: 'ACCEPTED' | 'REJECTED'; reason?: string }>,
        };

        for (const rcpt of receipts) {
            // Check duplicate
            if (this.syncedReceiptIds.has(rcpt.receiptId)) {
                results.rejectedCount++;
                results.processedReceipts.push({ receiptId: rcpt.receiptId, status: 'REJECTED', reason: 'Duplicate receipt' });
                continue;
            }

            // Verify signature
            const raw = `${rcpt.studentUsn}:${rcpt.sessionId}:${rcpt.scannedToken}:${rcpt.clientTimestamp}`;
            const expectedSig = crypto.createHmac('sha256', this.secretKey).update(raw).digest('hex');

            if (rcpt.signature !== expectedSig) {
                results.rejectedCount++;
                results.processedReceipts.push({ receiptId: rcpt.receiptId, status: 'REJECTED', reason: 'Invalid cryptographic signature' });
                continue;
            }

            // Verify timestamp occurred within session bounds (with 15 min buffer)
            const isWithinBounds = rcpt.clientTimestamp >= (sessionStartTime - 300000) && rcpt.clientTimestamp <= (sessionEndTime + 900000);
            if (!isWithinBounds) {
                results.rejectedCount++;
                results.processedReceipts.push({ receiptId: rcpt.receiptId, status: 'REJECTED', reason: 'Timestamp out of session bounds' });
                continue;
            }

            // Accept and record
            this.syncedReceiptIds.add(rcpt.receiptId);
            results.acceptedCount++;
            results.processedReceipts.push({ receiptId: rcpt.receiptId, status: 'ACCEPTED' });
        }

        return results;
    }
}

export const offlineSyncEngine = new OfflineSyncEngine();
