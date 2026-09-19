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
    assert.ok(
      res.body.passport.passportStatus === 'HALL_TICKET_ISSUED_VERIFIED' ||
      res.body.passport.passportStatus === 'PROVISIONAL_HOLD_ATTENDANCE_SHORTAGE',
      'Passport status must be verified or provisional hold'
    );
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

  await t.test('6. Academic Resources & Syllabus Catalog Workflow', async () => {
    // 6a. Fetch existing resources (seeded from SQLite schema)
    const listRes = await request(app).get('/api/resources?department=Computer%20Science%20(CSE)&year=3');
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body), 'Resources must be an array');
    assert.ok(listRes.body.length >= 1, 'Default academic resources should be seeded');
    const first = listRes.body[0];
    assert.ok(first.subjectCode, 'Resource must include subjectCode');
    assert.ok(Array.isArray(first.syllabus), 'Resource syllabus must be an array');

    // 6b. Add new course resource
    const addRes = await request(app)
      .post('/api/resources')
      .send({
        id: 'res_test_ai_opt',
        subjectCode: 'AI505',
        subjectName: 'Artificial Intelligence & Neural Optimization',
        credits: 4,
        department: 'Computer Science (CSE)',
        year: 3,
        syllabus: [
          { unit: 'Unit I', title: 'Gradient Descent & Convex Spaces', topic: 'Optimization topologies and SGD.' }
        ]
      });
    assert.equal(addRes.status, 200);
    assert.equal(addRes.body.success, true);

    // 6c. Clean up test resource
    const delRes = await request(app).delete('/api/resources/res_test_ai_opt');
    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.success, true);
  });

  await t.test('7. Faculty Session Creation & Live Broadcast Activation', async () => {
    // 7a. Get token as faculty
    const facLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dr.ramesh@sjce.edu', password: '1234', role: 'lecturer' });
    const facToken = facLogin.body.token;

    // 7b. Create a test session
    const testSessionId = `sess_tri_${Date.now()}`;
    dao.insertSession({
      id: testSessionId,
      subject_code: 'CS501',
      subject_name: 'Computer Networks',
      department: 'Computer Science (CSE)',
      course: 'B.E.',
      year: 3,
      section: 'A',
      otp: '4821',
      status: 'PENDING',
      verification_option: 'rotating_qr',
      lecturer_email: 'dr.ramesh@sjce.edu',
      expected_count: 60
    });

    // 7c. Activate session via POST /api/sessions/activate
    const actRes = await request(app)
      .post('/api/sessions/activate')
      .set('Authorization', `Bearer ${facToken}`)
      .send({ sessionId: testSessionId });
    assert.equal(actRes.status, 200);
    assert.equal(actRes.body.success, true);

    const activeSession = dao.getSessionById(testSessionId);
    assert.equal(activeSession.status, 'ACTIVE');

    // 7d. Cancel session via parameter route POST /api/sessions/:id/cancel
    const cancelRes = await request(app)
      .post(`/api/sessions/${testSessionId}/cancel`)
      .set('Authorization', `Bearer ${facToken}`);
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.success, true);

    const cancelledSession = dao.getSessionById(testSessionId);
    assert.equal(cancelledSession.status, 'CANCELLED');

    // Clean up
    dao.deleteSession(testSessionId);
  });

  await t.test('8. Student Offline Attendance Buffer & Batch Sync', async () => {
    // Prepare a valid session
    const syncSessionId = `sess_sync_${Date.now()}`;
    dao.insertSession({
      id: syncSessionId,
      subject_code: 'CS502',
      subject_name: 'Database Management Systems',
      department: 'Computer Science (CSE)',
      course: 'B.E.',
      year: 3,
      section: 'A',
      otp: '7721',
      status: 'ACTIVE',
      verification_option: 'rotating_qr',
      lecturer_email: 'dr.priya@sjce.edu',
      expected_count: 60
    });

    // Simulate batch offline records uploaded from IndexedDB
    const syncRes = await request(app)
      .post('/api/attendance/sync-offline')
      .send({
        records: [
          {
            sessionId: syncSessionId,
            studentUsn: '4SJ21CS005',
            studentName: 'Ananya Rao',
            scannedAt: new Date().toISOString(),
            submittedAt: new Date().toISOString(),
            verificationOption: 'rotating_qr',
            deviceFingerprint: 'offline-crypto-fp-001'
          }
        ]
      });

    assert.equal(syncRes.status, 200);
    assert.equal(syncRes.body.success, true);
    assert.equal(syncRes.body.syncedCount, 1);

    // Clean up
    dao.deleteSession(syncSessionId);
  });
});
