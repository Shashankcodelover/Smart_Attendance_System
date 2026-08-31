import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server'; // We exported app
import db, { dao } from '../db-sqlite';

// Run tests serially
test('Integration: /api/checkin Security Traps', async (t) => {
  // Wipe DB for clean slate
  dao.unsafeWipe();
  
  // Setup a test session
  const testSession = {
    id: 'test_session_123',
    subject_code: 'CS101',
    subject_name: 'Intro to CS',
    department: 'CSE',
    course: 'B.E.',
    year: 1,
    section: 'A',
    otp: '1234',
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60*60*1000).toISOString(),
    marked_count: 0,
    expected_count: 60,
    verification_option: 'BLUE_CIRCLE',
    lecturer_email: 'lecturer@sjce.edu',
    timeline: '10:00 AM - 11:00 AM',
    class_lat: 12.3142,
    class_lng: 76.6134
  };
  dao.insertSession(testSession);

  // We need to fetch an auth token for a student
  dao.insertUser({ emailOrUsn: '4JC21CS001', pin: '$2b$10$abcdefgh1234567890123u', name: 'Test Student', role: 'student' });
  const loginRes = await request(app).post('/api/auth/login').send({ email: '4JC21CS001', password: 'password', role: 'student' });
  // Since we don't have the real password hash, let's bypass auth by signing our own token
  const { signJwt } = await import('../server');
  const token = signJwt({ email: '4JC21CS001', role: 'student', name: 'Test Student' }, 3600);

  await t.test('Rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/checkin').send({
      sessionId: 'test_session_123',
      studentUsn: '4JC21CS001',
      otpCode: '1234'
    });
    assert.equal(res.status, 401); // Unauthorized
  });

  await t.test('Rejects invalid OTP', async () => {
    const res = await request(app)
      .post('/api/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionId: 'test_session_123',
        studentUsn: '4JC21CS001',
        otpCode: '9999', // wrong OTP
        isOnline: true,
        gpsLat: 12.3142,
        gpsLng: 76.6134,
        cryptoAttestation: 'dummy_sig',
        deviceFingerprint: 'dummy_device'
      });
    
    // Fails on geofence first if not running on local loopback, but Supertest uses 127.0.0.1 which is in the campusSubnets list.
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('Invalid 4-digit verification code'));
  });

  await t.test('Rejects checkin when missing hardware attestation', async () => {
    const res = await request(app)
      .post('/api/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionId: 'test_session_123',
        studentUsn: '4JC21CS001',
        otpCode: '1234',
        isOnline: true,
        gpsLat: 12.3142,
        gpsLng: 76.6134
        // Missing cryptoAttestation
      });
    
    assert.equal(res.status, 403);
    assert.ok(res.body.error.includes('Hardware Attestation Failed'));
  });

  // Successful Checkin
  await t.test('Accepts valid checkin and inserts via SQLite WAL mutex', async () => {
    const res = await request(app)
      .post('/api/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionId: 'test_session_123',
        studentUsn: '4JC21CS001',
        otpCode: '1234',
        isOnline: true,
        gpsLat: 12.3142, // Within 150m of 12.3142
        gpsLng: 76.6134,
        cryptoAttestation: 'dummy_sig_123',
        deviceFingerprint: 'device_001'
      });
    
    assert.equal(res.status, 200, res.body.error);
    assert.equal(res.body.success, true);
    
    const records = dao.getAttendanceRecords();
    assert.equal(records.length, 1);
    assert.equal((records[0] as any).student_usn, '4JC21CS001');
  });

  await t.test('Rejects duplicate check-in (SQLite Mutex)', async () => {
    const res = await request(app)
      .post('/api/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionId: 'test_session_123',
        studentUsn: '4JC21CS001',
        otpCode: '1234',
        isOnline: true,
        gpsLat: 12.3142,
        gpsLng: 76.6134,
        cryptoAttestation: 'dummy_sig_123',
        deviceFingerprint: 'device_001'
      });
    
    assert.equal(res.status, 403); // Proxy Blocked or Presence already verified
    assert.ok(res.body.error.includes('already verified'));
  });

  await t.test('Rejects proxy device spoofing', async () => {
    // Generate new token for another student
    const token2 = signJwt({ email: '4JC21CS002', role: 'student', name: 'Test Student 2' }, 3600);
    
    const res = await request(app)
      .post('/api/checkin')
      .set('Authorization', `Bearer ${token2}`)
      .send({
        sessionId: 'test_session_123',
        studentUsn: '4JC21CS002',
        otpCode: '1234',
        isOnline: true,
        gpsLat: 12.3142,
        gpsLng: 76.6134,
        cryptoAttestation: 'dummy_sig_456',
        deviceFingerprint: 'device_001' // SAME DEVICE USED BY STUDENT 1
      });
    
    assert.equal(res.status, 403);
    assert.ok(res.body.error.includes('Proxy Blocked')); // Blocked by SQLite Mutex logic
  });
});
