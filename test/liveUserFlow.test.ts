import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server';
import db, { dao } from '../db-sqlite';

test('Live User Flow & Carrier-Grade Elevation Verification Suite', async (t) => {

  await t.test('1. Demo Fast-Track & Role Delegation Auth Gate', async () => {
    // 1a. Faculty login with demo credentials
    const facRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dr.ramesh@sjce.edu', password: '1234', role: 'lecturer' });
    assert.equal(facRes.status, 200);
    assert.ok(facRes.body.token, 'Faculty token should be generated');
    assert.equal(facRes.body.user.role, 'lecturer');

    // 1b. Admin accessing with role delegation (admin-as-lecturer)
    const adminAsLecturerRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@sjce.edu', password: '1234', role: 'lecturer' });
    assert.equal(adminAsLecturerRes.status, 200);
    assert.equal(adminAsLecturerRes.body.user.role, 'lecturer');

    // 1c. Student login with auto-provisioning
    const stuRes = await request(app)
      .post('/api/auth/login')
      .send({ email: '4SJ21CS005', password: 'student123', role: 'student' });
    assert.equal(stuRes.status, 200);
    assert.ok(stuRes.body.token, 'Student token should be generated');
    assert.equal(stuRes.body.user.role, 'student');

    // 1d. Dedicated demo-login endpoint
    const demoRes = await request(app)
      .post('/api/auth/demo-login')
      .send({ role: 'student' });
    assert.equal(demoRes.status, 200);
    assert.ok(demoRes.body.token);
  });

  await t.test('2. Student Trajectory Simulator & Bunk Recovery Calculation', async () => {
    const res = await request(app)
      .post('/api/v2/bunk/calculate-trajectory')
      .send({
        studentUsn: '4JC21CS001',
        totalLecturesHeld: 40,
        lecturesAttended: 34,
        targetThresholdPercentage: 75
      });
    assert.equal(res.status, 200);
    assert.ok(res.body.report, 'Report should be present');
    assert.equal(res.body.report.totalHeld, 40);
    assert.equal(res.body.report.attended, 34);
    assert.ok(typeof res.body.report.safeBunksAvailable === 'number');
    assert.equal(res.body.report.isCurrentlyEligible, true);
  });

  await t.test('3. Digital Exam Hall Ticket Passport Issuance', async () => {
    const res = await request(app).get('/api/v2/student/hall-ticket/4JC21CS001');
    assert.equal(res.status, 200);
    assert.ok(res.body.passport, 'Hall ticket passport should be returned');
    assert.equal(res.body.passport.usn, '4JC21CS001');
    assert.ok(res.body.passport.digitalClearanceBadgeQR.includes('HT-PASS'), 'Badge must include HT-PASS signature');
    assert.equal(res.body.passport.passportStatus, 'HALL_TICKET_ISSUED_VERIFIED');
  });

  await t.test('4. Academic Relations Mesh & Multi-Course Topology', async () => {
    const res = await request(app).get('/api/academic/relations');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.relations), 'Relations must be an array');
  });

  await t.test('5. Zero-Knowledge Biometric Presence Verification', async () => {
    const res = await request(app)
      .post('/api/v5/biometric/zk-proof-checkin')
      .send({
        studentUsn: '4JC21CS001',
        sessionId: 'session_demo_live',
        faceVectors: {
          earLeft: 0.32,
          earRight: 0.33,
          marMouth: 0.12,
          headPitch: 2.1,
          headYaw: 1.4,
          headRoll: 0.2,
          meshPointsCount: 468
        },
        beaconTelemetry: {
          acousticRoomCode: 'ROOM_101',
          bleRssi: -55,
          gpsLat: 12.3150,
          gpsLng: 76.6135
        }
      });
    assert.equal(res.status, 200);
    assert.ok(res.body.proof.sbtTokenId, 'Soulbound Attendance Token must be minted');
    assert.ok(res.body.proof.merkleRoot, 'Merkle root must be generated');
  });
});
