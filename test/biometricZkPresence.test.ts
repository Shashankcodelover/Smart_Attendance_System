import test from 'node:test';
import assert from 'node:assert/strict';
import { biometricZkEngine } from '../src/services/biometricZkPresenceEngine.ts';

test('BiometricZkEngine: Generates randomized micro-gesture challenges and validates sequence', () => {
  const challenge = biometricZkEngine.generateLivenessChallenge();
  assert.ok(challenge.challengeId.startsWith('CHAL-'));
  assert.ok(challenge.nonce.length >= 12);
  assert.equal(challenge.sequence.length, 3);
  assert.equal(challenge.chromaticFlashSequence.length, 3);
  assert.ok(challenge.expiresAt > Date.now());

  // Correct sequence validation
  const validation = biometricZkEngine.verifyLivenessChallenge(
    challenge.challengeId,
    challenge.sequence,
    Date.now()
  );
  assert.equal(validation.valid, true);

  // Expired challenge rejection (> 8 seconds skew)
  const expiredValidation = biometricZkEngine.verifyLivenessChallenge(
    challenge.challengeId,
    challenge.sequence,
    challenge.expiresAt + 1000
  );
  assert.equal(expiredValidation.valid, false);
  assert.ok(expiredValidation.reason?.includes('expired'));
});

test('BiometricZkEngine: Evaluates 3D Face kinematics and rejects presentation attacks (ISO/IEC 30107-3 PAD)', () => {
  // 1. Genuine biological face
  const genuineVectors = {
    leftEyeEar: 0.28,
    rightEyeEar: 0.29,
    blinkCount: 2,
    headPose: { pitchDeg: 1.5, yawDeg: -2.0, rollDeg: 0.5 },
    depthParallaxDisparity: 0.88,
    moireArtifactScore: 0.04,
    specularPoreVariance: 1.45
  };
  const genuineResult = biometricZkEngine.evaluateLiveness(genuineVectors);
  assert.equal(genuineResult.isLive, true);
  assert.equal(genuineResult.antiSpoofingVerdict, 'AUTHENTIC_BIOLOGICAL_PRESENCE');
  assert.ok(genuineResult.confidence >= 95.0);

  // 2. 2D Screen Spoof (flat depth parallax < 0.60, high screen moiré pattern)
  const spoofVectors = {
    leftEyeEar: 0.28,
    rightEyeEar: 0.28,
    blinkCount: 0,
    headPose: { pitchDeg: 0, yawDeg: 0, rollDeg: 0 },
    depthParallaxDisparity: 0.32, // flat 2D screen
    moireArtifactScore: 0.68,     // heavy screen pixel grid
    specularPoreVariance: 0.42    // flat screen glare without skin pores
  };
  const spoofResult = biometricZkEngine.evaluateLiveness(spoofVectors);
  assert.equal(spoofResult.isLive, false);
  assert.equal(spoofResult.antiSpoofingVerdict, 'SUSPECTED_SPOOF_ATTACK');
  assert.ok(spoofResult.confidence < 60.0);
});

test('BiometricZkEngine: Validates Tri-Band Geofence & Ultrasonic Acoustic Room Containment (18.5 kHz)', () => {
  // Indoor lecture hall proximity (~2.8 meters from podium)
  const insideBeacon = {
    bleRssiDbm: -62,
    wifiBssidHash: '0x8f2a4c6e1b3d5f7a9c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e1b3d5f7a',
    ultrasonicChirpToken: 'CHIRP_LIVE_PODIUM_SJCE',
    ultrasonicImpulseMs: 48,
    clientGps: { lat: 12.3142, lng: 76.6135 }
  };
  const indoorCheck = biometricZkEngine.verifyTriBandBeacon(insideBeacon);
  assert.equal(indoorCheck.verified, true);
  assert.equal(indoorCheck.verdict, 'INDOOR_GEOFENCE_CONFIRMED');
  assert.ok(indoorCheck.proximityMeters <= 5.0);
  assert.equal(indoorCheck.ultrasonicContainmentVerified, true);

  // Remote proxy attempt (BLE RSSI -95 dBm > 25m outside classroom)
  const outsideBeacon = {
    bleRssiDbm: -95,
    wifiBssidHash: '0x8f2a4c6e1b3d5f7a9c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e1b3d5f7a',
    ultrasonicChirpToken: 'CHIRP_LIVE_PODIUM_SJCE',
    ultrasonicImpulseMs: 450, // acoustic echo exceeds classroom concrete boundary
    clientGps: { lat: 12.3142, lng: 76.6135 }
  };
  const outsideCheck = biometricZkEngine.verifyTriBandBeacon(outsideBeacon);
  assert.equal(outsideCheck.verified, false);
  assert.equal(outsideCheck.verdict, 'OUT_OF_BOUNDS_PROXIMITY');
});

test('BiometricZkEngine: Generates Zero-Knowledge Proof & Mints Soulbound Attendance Token (SBT)', () => {
  const vectors = {
    leftEyeEar: 0.30,
    rightEyeEar: 0.30,
    blinkCount: 2,
    headPose: { pitchDeg: 1.0, yawDeg: 0.5, rollDeg: 0 },
    depthParallaxDisparity: 0.85,
    moireArtifactScore: 0.05,
    specularPoreVariance: 1.38
  };
  const beacon = {
    bleRssiDbm: -60,
    wifiBssidHash: '0x8f2a4c6e1b3d5f7a9c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e1b3d5f7a',
    ultrasonicChirpToken: 'CHIRP_18500_ROTATING_TOKEN',
    ultrasonicImpulseMs: 52,
    clientGps: { lat: 12.3142, lng: 76.6135 }
  };

  const proof = biometricZkEngine.generateZkPresenceProof(
    '4JC21CS001',
    'SES-LIVE-SJCE-101',
    vectors,
    beacon
  );

  assert.ok(proof.proofId.startsWith('ZK-PROOF-'));
  assert.ok(proof.sbtTokenId.startsWith('SBT-ATTEND-2026-SJCE-'));
  assert.ok(proof.commitmentHash.startsWith('0x'));
  assert.equal(proof.commitmentHash.length, 66);
  assert.equal(proof.verifiedPresence, true);
  assert.equal(proof.antiSpoofingVerdict, 'AUTHENTIC_BIOLOGICAL_PRESENCE');
  assert.equal(proof.triBandProximityVerdict, 'INDOOR_GEOFENCE_CONFIRMED');

  // Verify Session Ledger Merkle Root
  const ledger = biometricZkEngine.getSessionLedger('SES-LIVE-SJCE-101');
  assert.ok(ledger.totalVerified >= 1);
  assert.ok(ledger.merkleRoot.startsWith('0x'));
  assert.ok(ledger.proofs.some(p => p.proofId === proof.proofId));
});
