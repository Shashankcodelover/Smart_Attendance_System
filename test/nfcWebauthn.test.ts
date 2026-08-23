import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { nfcWebauthnGateway } from '../src/services/nfcWebauthnGateway.ts';

test('NFCWebAuthnGateway verifies physical university NFC card tap with cryptographic UID signature', () => {
    const cardUid = '04A1B2C3D4E5F6';
    const validCardSignature = crypto.createHmac('sha256', 'smart_card_master_key').update(cardUid).digest('hex');

    nfcWebauthnGateway.registerStudentCredential('4JC21CS001', 'cred_1', 'pub_key', cardUid);

    const check = nfcWebauthnGateway.verifyNFCCardTap('4JC21CS001', cardUid, validCardSignature);
    assert.equal(check.isVerified, true);
    assert.equal(check.authMethod, 'PHYSICAL_NFC_SMART_CARD_TAP');
    assert.equal(check.cardUid, cardUid);
});

test('NFCWebAuthnGateway rejects forged or mismatched NFC card UIDs', () => {
    const cardUid = '04A1B2C3D4E5F6';
    nfcWebauthnGateway.registerStudentCredential('4JC21CS002', 'cred_2', 'pub_key', cardUid);

    const wrongCard = nfcWebauthnGateway.verifyNFCCardTap('4JC21CS002', '11223344556677', 'some_sig');
    assert.equal(wrongCard.isVerified, false);
    assert.ok(wrongCard.reason?.includes('NFC_UID_MISMATCH'));
});

test('NFCWebAuthnGateway generates challenge and validates WebAuthn passkey assertion', () => {
    nfcWebauthnGateway.registerStudentCredential('4JC21CS003', 'cred_passkey', 'pub_key');
    const challenge = nfcWebauthnGateway.generateAuthChallenge('4JC21CS003', 30000);

    assert.ok(challenge.challenge.length > 20);

    const assertion = nfcWebauthnGateway.verifyWebAuthnAssertion('4JC21CS003', challenge.challenge, 'auth_data_hex');
    assert.equal(assertion.isVerified, true);
    assert.equal(assertion.authMethod, 'FIDO2_WEBAUTHN_HARDWARE_PASSKEY');
});
