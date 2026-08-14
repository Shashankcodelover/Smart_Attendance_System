import test from 'node:test';
import assert from 'node:assert/strict';
import { biometricAttestationEngine } from '../src/services/biometricAttestationEngine.ts';

test('BiometricAttestationEngine enrolls student baseline and verifies live challenge-response', () => {
    const baseline = {
        interPupillaryDistance: 62.5,
        noseToChinDistance: 71.0,
        lipAspectRatio: 1.8,
        eyeAspectRatio: 0.32,
        yawAngleDegrees: 0,
        pitchAngleDegrees: 0,
    };

    biometricAttestationEngine.registerStudentBaselineVector('4JC21CS001', baseline);

    // Issue challenge
    const challenge = biometricAttestationEngine.issueLivenessChallenge('4JC21CS001', 3000);
    assert.ok(challenge.challengeNonce.length > 0);
    assert.ok(challenge.requiredAction);

    // Live scan matching baseline geometry and action
    const liveVector = { ...baseline, yawAngleDegrees: 2 };
    const verification = biometricAttestationEngine.verifyLivenessAttestation(
        '4JC21CS001',
        liveVector,
        challenge.challengeNonce,
        challenge.requiredAction
    );

    assert.equal(verification.isVerified, true);
    assert.equal(verification.livenessVerified, true);
    assert.equal(verification.status, 'BIOMETRIC_ATTENTION_AUTHENTICATED');
    assert.equal(verification.similarityScore, 1.0);
});

test('BiometricAttestationEngine rejects presentation attacks with mismatched action or expired nonce', () => {
    const baseline = {
        interPupillaryDistance: 62.5,
        noseToChinDistance: 71.0,
        lipAspectRatio: 1.8,
        eyeAspectRatio: 0.32,
        yawAngleDegrees: 0,
        pitchAngleDegrees: 0,
    };
    biometricAttestationEngine.registerStudentBaselineVector('4JC21CS002', baseline);

    const challenge = biometricAttestationEngine.issueLivenessChallenge('4JC21CS002', 3000);

    // Mismatched action (Static photo cannot perform requested micro-gesture)
    const wrongAction = challenge.requiredAction === 'BLINK_TWICE' ? 'SMILE_AND_HOLD' : 'BLINK_TWICE';
    const failedActionCheck = biometricAttestationEngine.verifyLivenessAttestation(
        '4JC21CS002',
        baseline,
        challenge.challengeNonce,
        wrongAction
    );
    assert.equal(failedActionCheck.isVerified, false);
    assert.ok(failedActionCheck.reason?.includes('ACTION_MISMATCH'));
});
