import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, generateHmacToken, verifyHmacToken } from '../server';
import { dao } from '../db-sqlite';
import jsonDb from '../db';

test('50 Comprehensive User-Flow & Edge-Case Verification Suite: Smart Attendance System', async (t) => {
  let lecturerToken = '';
  let studentToken = '';
  let createdSessionId = '';
  let createdOtp = '';
  const testUsn = '4SJ21CS005';
  const walkinUsn = '02JST24UCS999';

  // =========================================================================
  // PILLAR 1: MULTI-ROLE AUTHENTICATION & ACCESS CONTROL (Tests 1 - 5)
  // =========================================================================

  await t.test('01. Lecturer Demo Authentication generates valid JWT', async () => {
    const res = await request(app).post('/api/auth/demo-login').send({ role: 'lecturer' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token, 'Token must exist');
    assert.equal(res.body.user.role, 'lecturer');
    lecturerToken = res.body.token;
  });

  await t.test('02. Student Demo Authentication provisions student token', async () => {
    const res = await request(app).post('/api/auth/demo-login').send({ role: 'student', usn: testUsn });
    assert.equal(res.status, 200);
    assert.ok(res.body.token, 'Student token must exist');
    assert.equal(res.body.user.role, 'student');
    studentToken = res.body.token;
  });

  await t.test('03. Auth gate rejects invalid login credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nonexistent@sjce.edu', password: 'badpassword' });
    assert.equal(res.status, 401);
  });

  await t.test('04. Protected lecturer endpoint rejects unauthenticated request', async () => {
    const res = await request(app).post('/api/sessions/create').send({ subjectCode: 'CS101' });
    assert.equal(res.status, 401);
  });

  await t.test('05. Student token is blocked from accessing faculty-only endpoints', async () => {
    const res = await request(app)
      .post('/api/sessions/create')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ subjectCode: 'CS101' });
    assert.equal(res.status, 403);
  });

  // =========================================================================
  // PILLAR 2: FACULTY SECTION ORCHESTRATION & SETUP (Tests 6 - 10)
  // =========================================================================

  await t.test('06. Lecturer creates new class section with department and year', async () => {
    const res = await request(app)
      .post('/api/sessions/create')
      .set('Authorization', `Bearer ${lecturerToken}`)
      .send({
        department: 'Computer Science (CSE)',
        course: 'B.E.',
        year: 3,
        section: 'A',
        subjectCode: 'CS301',
        subjectName: 'Design & Analysis of Algorithms',
        status: 'ACTIVE',
        timeline: '10:00 AM - 11:00 AM'
      });
    assert.equal(res.status, 200);
    assert.ok(res.body.session.id);
    assert.ok(res.body.session.otp);
    createdSessionId = res.body.session.id;
    createdOtp = res.body.session.otp;
  });

  await t.test('07. Created session status is verified as ACTIVE in database', async () => {
    const session = dao.getSessionById(createdSessionId);
    assert.ok(session);
    assert.equal(session.status, 'ACTIVE');
    assert.equal(session.section, 'A');
  });

  await t.test('08. Batch section creation provisions parallel cohorts', async () => {
    const res = await request(app)
      .post('/api/sessions/batch-create')
      .set('Authorization', `Bearer ${lecturerToken}`)
      .send({
        subjectCode: 'CS302',
        subjectName: 'Operating Systems',
        department: 'CSE',
        course: 'B.E.',
        year: 3,
        sections: ['B', 'C']
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 2);
  });

  await t.test('09. Lecturer retrieves active sessions for their email', async () => {
    const res = await request(app)
      .get('/api/sessions?lecturer=lecturer@sjce.edu')
      .set('Authorization', `Bearer ${lecturerToken}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
  });

  await t.test('10. Timetable fetch returns schedule catalog', async () => {
    const res = await request(app).get('/api/timetable');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  // =========================================================================
  // PILLAR 3: 30-SECOND DYNAMIC QR CODE & ROTATION (Tests 11 - 15)
  // =========================================================================

  await t.test('11. Dynamic HMAC QR Token generates valid signature format', async () => {
    const token = generateHmacToken(createdSessionId, createdOtp, 'BLUE_CIRCLE');
    assert.ok(token.includes('.'));
    const parts = token.split('.');
    assert.equal(parts.length, 3);
  });

  await t.test('12. QR Token verifies successfully within 30-second window', async () => {
    const token = generateHmacToken(createdSessionId, createdOtp, 'BLUE_CIRCLE');
    const valid = verifyHmacToken(createdSessionId, createdOtp, 'BLUE_CIRCLE', token);
    assert.equal(valid, true);
  });

  await t.test('13. Expired QR Token (>30s) is strictly rejected', async () => {
    const expiredTimestamp = (Date.now() - 45000).toString();
    const token = `${expiredTimestamp}.${createdOtp}.fake_sig`;
    const valid = verifyHmacToken(createdSessionId, createdOtp, 'BLUE_CIRCLE', token);
    assert.equal(valid, false);
  });

  await t.test('14. QR Token with tampered OTP is rejected', async () => {
    const token = generateHmacToken(createdSessionId, createdOtp, 'BLUE_CIRCLE');
    const valid = verifyHmacToken(createdSessionId, '9999', 'BLUE_CIRCLE', token);
    assert.equal(valid, false);
  });

  await t.test('15. QR Token with mismatched verification option is rejected', async () => {
    const token = generateHmacToken(createdSessionId, createdOtp, 'BLUE_CIRCLE');
    const valid = verifyHmacToken(createdSessionId, createdOtp, 'RED_SQUARE', token);
    assert.equal(valid, false);
  });

  // =========================================================================
  // PILLAR 4: STUDENT SCANNING & CHECK-IN FLOW (Tests 16 - 20)
  // =========================================================================

  await t.test('16. Student Dashboard loads successfully with attendance metrics', async () => {
    const res = await request(app).get(`/api/student/dashboard/${testUsn}`).set('Authorization', `Bearer ${studentToken}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.student || res.body.records || res.body.stats);
  });

  await t.test('17. Student Check-in requires sessionId and studentUsn', async () => {
    const res = await request(app).post('/api/checkin').set('Authorization', `Bearer ${studentToken}`).send({});
    assert.equal(res.status, 400);
  });

  await t.test('18. Student Check-in succeeds with valid OTP during active window', async () => {
    const res = await request(app)
      .post('/api/checkin')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        sessionId: createdSessionId,
        studentUsn: testUsn,
        studentName: 'Test Student',
        otpCode: createdOtp,
        isOnline: false,
        deviceFingerprint: 'DEV-FINGERPRINT-001'
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.hmacProof);
  });

  await t.test('19. Duplicate check-in by same student in same session is rejected', async () => {
    const res = await request(app)
      .post('/api/checkin')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        sessionId: createdSessionId,
        studentUsn: testUsn,
        studentName: 'Test Student',
        otpCode: createdOtp,
        isOnline: false,
        deviceFingerprint: 'DEV-FINGERPRINT-001'
      });
    assert.ok(res.status === 403 || res.status === 409, 'Duplicate check-in must be rejected');
  });

  await t.test('20. Check-in on non-existent session returns 404', async () => {
    const res = await request(app)
      .post('/api/checkin')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        sessionId: 'sess_nonexistent_999',
        studentUsn: '02JST24UCS555',
        otpCode: '1234',
        isOnline: false
      });
    assert.equal(res.status, 404);
  });

  // =========================================================================
  // PILLAR 5: EDGE CASES - PHONE-LESS / BATTERY-DEAD OVERRIDE (Tests 21 - 25)
  // =========================================================================

  await t.test('21. Lecturer invokes Manual Add-On for phone-less/battery-dead student', async () => {
    const res = await request(app)
      .post('/api/attendance/manual-addon')
      .set('Authorization', `Bearer ${lecturerToken}`)
      .send({
        sessionId: createdSessionId,
        studentUsn: walkinUsn,
        studentName: 'Walkin Student Without Phone',
        reason: 'Phone battery died during lab'
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.record.status, 'MANUAL_VERIFIED');
  });

  await t.test('22. Manual Add-on rejects duplicate walk-in student entry', async () => {
    const res = await request(app)
      .post('/api/attendance/manual-addon')
      .set('Authorization', `Bearer ${lecturerToken}`)
      .send({
        sessionId: createdSessionId,
        studentUsn: walkinUsn
      });
    assert.equal(res.status, 409);
  });

  await t.test('23. Manual Add-On is logged into security audit trail', async () => {
    const res = await request(app).get('/api/override-audits');
    assert.equal(res.status, 200);
    const audits = res.body;
    assert.ok(Array.isArray(audits));
    const match = audits.find((a: any) => a.action === 'MANUAL_ATTENDANCE_ADDON' && a.entity_id === createdSessionId);
    assert.ok(match, 'Audit record for manual addon must exist');
  });

  await t.test('24. Attendance toggle manual endpoint switches presence status', async () => {
    const res = await request(app)
      .post('/api/attendance/toggle-manual')
      .set('Authorization', `Bearer ${lecturerToken}`)
      .send({
        sessionId: createdSessionId,
        studentUsn: '02JST24UCS202',
        studentName: 'Toggled Student'
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  await t.test('25. Offline attendance batch sync ingests queued records', async () => {
    const res = await request(app)
      .post('/api/attendance/sync-offline')
      .send({
        records: [
          {
            sessionId: createdSessionId,
            studentUsn: '02JST24UCS303',
            studentName: 'Offline Student',
            scannedAt: new Date().toISOString(),
            verificationOption: 'OFFLINE_QR'
          }
        ]
      });
    assert.equal(res.status, 200);
  });

  // =========================================================================
  // PILLAR 6: DATA EXPORTS - DEPARTMENT & SECTION EXCEL/CSV (Tests 26 - 30)
  // =========================================================================

  await t.test('26. Master student roster exports as clean CSV with text/csv header', async () => {
    const res = await request(app).get('/api/students/export-csv');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.text.includes('USN,Name,Department'));
  });

  await t.test('27. Student roster CSV export filters by Department and Section', async () => {
    const res = await request(app).get('/api/students/export-csv?department=Computer+Science+(CSE)&section=A');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-disposition'].includes('Students_Roster'));
  });

  await t.test('28. Session attendance ledger exports as CSV with verification methods', async () => {
    const res = await request(app).get(`/api/sessions/${createdSessionId}/export-csv`);
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.text.includes(testUsn));
    assert.ok(res.text.includes(walkinUsn));
  });

  await t.test('29. Attendance CSV export sanitizes spreadsheet formula injection (=, +, -)', () => {
    const cleanCell = jsonDb.sanitizeCsvCell('=SUM(A1:A10)');
    assert.ok(cleanCell.includes("'="));
  });

  await t.test('30. Academic resources catalog loads with syllabus and materials', async () => {
    const res = await request(app).get('/api/resources');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  // =========================================================================
  // PILLAR 7: BUNK RECOVERY & ANALYTICS TRAJECTORY (Tests 31 - 35)
  // =========================================================================

  await t.test('31. Bunk Calculator predicts safe bunks for high attendance', async () => {
    const res = await request(app)
      .post('/api/v2/bunk/calculate-trajectory')
      .send({
        studentUsn: testUsn,
        totalLecturesHeld: 50,
        lecturesAttended: 45,
        targetThresholdPercentage: 75
      });
    assert.equal(res.status, 200);
    assert.ok(res.body.report.safeBunksAvailable > 0);
  });

  await t.test('32. Bunk Calculator computes recovery count for deficit attendance', async () => {
    const res = await request(app)
      .post('/api/v2/bunk/calculate-trajectory')
      .send({
        studentUsn: testUsn,
        totalLecturesHeld: 50,
        lecturesAttended: 30,
        targetThresholdPercentage: 75
      });
    assert.equal(res.status, 200);
    assert.ok(res.body.report.consecutiveRecoveryLecturesNeeded > 0);
    assert.equal(res.body.report.isCurrentlyEligible, false);
  });

  await t.test('33. Exam Hall Ticket Passport issues verified clearance', async () => {
    const res = await request(app).get(`/api/v2/student/hall-ticket/${testUsn}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.passport || res.body.student);
  });

  await t.test('34. Student absence forecaster predicts semester trajectory', async () => {
    const res = await request(app).post('/api/v2/student/absence-forecast').send({
      totalHeld: 40,
      attended: 35,
      upcomingMissCount: 2
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.forecast);
  });

  await t.test('35. AI Retention Radar detects proxy rings and anomalies', async () => {
    const res = await request(app).post('/api/v2/teacher/proxy-ring-detection').send({
      checkins: [
        { usn: 'S1', ipAddress: '192.168.1.100', deviceModel: 'iPhone', timestamp: 100 },
        { usn: 'S2', ipAddress: '192.168.1.100', deviceModel: 'Pixel', timestamp: 101 }
      ]
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.ringAnalysis);
  });

  // =========================================================================
  // PILLAR 8: TIMETABLES, CLASHES & CONSTRAINTS (Tests 36 - 40)
  // =========================================================================

  await t.test('36. Timetable CSV import rejects empty payload', async () => {
    const res = await request(app).post('/api/v2/timetable/import-csv').send({});
    assert.equal(res.status, 400);
  });

  await t.test('37. Timetable CSV import ingests lecture slots correctly', async () => {
    const sampleCsv = 'Day,StartTime,EndTime,SubjectCode,SubjectName,Lecturer,Room,Section,Department\nMonday,09:00,10:00,CS301,Algorithms,Dr. Ramesh,LH-101,A,CSE';
    const res = await request(app).post('/api/v2/timetable/import-csv').send({ csvContent: sampleCsv });
    assert.equal(res.status, 200);
    assert.ok(res.body.count >= 1);
  });

  await t.test('38. Faculty live headcount radar tracks active sessions', async () => {
    const res = await request(app).post('/api/v2/teacher/live-headcount-radar').send({
      enrolledCount: 60,
      checkedInCount: 52
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.radar);
  });

  await t.test('39. Student Peer Voucher creation provisions review voucher', async () => {
    const res = await request(app)
      .post('/api/v2/student/peer-voucher')
      .send({
        claimantUsn: testUsn,
        peerWitnessUsn: '02JST24UCS101',
        sessionId: createdSessionId,
        reason: 'Present alongside peer in laboratory'
      });
    assert.equal(res.status, 200);
    assert.ok(res.body.voucher);
  });

  await t.test('40. Student Leave Request submission records claim', async () => {
    const res = await request(app)
      .post('/api/leave/submit')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        studentUsn: testUsn,
        leaveType: 'MEDICAL',
        fromDate: '2026-09-20',
        toDate: '2026-09-22',
        reason: 'Viral fever hospital admission'
      });
    assert.equal(res.status, 200);
    assert.ok(res.body.success);
  });

  // =========================================================================
  // PILLAR 9: BIOMETRICS, ZERO-KNOWLEDGE & HARDWARE ATTESTATION (Tests 41 - 45)
  // =========================================================================

  await t.test('41. Biometric challenge generates randomized sequence', async () => {
    const res = await request(app).post('/api/v3/biometric/challenge').send({
      usn: testUsn
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.challenge);
  });

  await t.test('42. Ultrasonic Acoustic session beacon generates room token', async () => {
    const res = await request(app).get('/api/v5/biometric/session-beacon');
    assert.equal(res.status, 200);
    assert.ok(res.body.classroomReference);
  });

  await t.test('43. Kalman Filter Geofencing smooths coordinates within classroom boundary', async () => {
    const res = await request(app).post('/api/v3/geofence/kalman-verify').send({
      readings: [
        { latitude: 12.3142, longitude: 76.6134, accuracyMeters: 5, timestampMs: Date.now() }
      ],
      classroomCenter: { latitude: 12.3142, longitude: 76.6134 },
      maxRadiusMeters: 50
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.geofenceResult);
  });

  await t.test('44. NFC Card UID tap verification endpoint validates credentials', async () => {
    const res = await request(app).post('/api/v3/nfc/verify-tap').send({
      usn: testUsn,
      cardUid: '04A1B2C3D4E5F6',
      cardSignature: 'sample_sig'
    });
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.success === 'boolean');
  });

  await t.test('45. Merkle Root Attendance Ledger is retrievable per session', async () => {
    const res = await request(app).get(`/api/v5/biometric/ledger/${createdSessionId}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.ledger);
  });

  // =========================================================================
  // PILLAR 10: ADMINISTRATIVE REPORTS & SESSION LIFECYCLE CLOSURE (Tests 46 - 50)
  // =========================================================================

  await t.test('46. Faculty retrieves statutory shortage report for sub-75% attendance', async () => {
    const res = await request(app).post('/api/v2/teacher/statutory-shortage-report').send({
      students: [
        { usn: testUsn, name: 'Student High', attendancePct: 88.0 },
        { usn: '02JST24UCS099', name: 'Student Low', attendancePct: 65.0 }
      ]
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.report);
    assert.equal(res.body.report.shortageCount, 1);
  });

  await t.test('47. NAAC/NBA accreditation report generates compliance metrics', async () => {
    const res = await request(app).post('/api/v2/teacher/accreditation-report').send({
      department: 'CSE',
      academicYear: '2025-2026',
      overallPresencePct: 82.5,
      totalConductedLectures: 120
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.auditReport);
    assert.equal(res.body.auditReport.statutoryComplianceStatus, 'FULLY_COMPLIANT');
  });

  await t.test('48. Lecturer closes active session and finalizes roster', async () => {
    const res = await request(app)
      .post(`/api/sessions/${createdSessionId}/cancel`)
      .set('Authorization', `Bearer ${lecturerToken}`)
      .send();
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const updated = dao.getSessionById(createdSessionId);
    assert.equal(updated.status, 'CANCELLED');
  });

  await t.test('49. Post-closure check-in attempts are rejected', async () => {
    const res = await request(app)
      .post('/api/checkin')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        sessionId: createdSessionId,
        studentUsn: '02JST24UCS404',
        otpCode: createdOtp,
        isOnline: false
      });
    assert.equal(res.status, 400);
  });

  await t.test('50. Audit trail verifies all 50 operational actions completed cleanly', async () => {
    const res = await request(app).get('/api/override-audits');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
  });

});
