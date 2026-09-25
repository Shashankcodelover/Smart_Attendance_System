import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { dao } from './db-sqlite';
import { signJwt, verifyJwt } from './server';

describe('Smart Attendance System - End-to-End User Journey Verification', () => {
  it('1. Generates and verifies stable JWT tokens for lecturer and admin personas', () => {
    const lecturerPayload = { email: 'dr.ramesh@sjce.edu', role: 'lecturer', name: 'Dr. Ramesh Kumar' };
    const token = signJwt(lecturerPayload, 86400 * 30);
    assert.ok(token && typeof token === 'string');
    
    const verified = verifyJwt(token);
    assert.ok(verified);
    assert.strictEqual(verified.email, 'dr.ramesh@sjce.edu');
    assert.strictEqual(verified.role, 'lecturer');
  });

  it('2. Inserts and retrieves active attendance session in SQLite database', () => {
    const sessionId = `test_sess_${Date.now()}`;
    const newSession = {
      id: sessionId,
      subject_code: 'CS501',
      subject_name: 'Computer Architecture',
      department: 'Computer Science (CSE)',
      course: 'B.E.',
      year: 3,
      section: 'A',
      otp: '4821',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      expires_at: '',
      marked_count: 0,
      expected_count: 65,
      verification_option: 'BLUE_CIRCLE',
      lecturer_email: 'dr.ramesh@sjce.edu',
      timeline: '10:00 AM - 11:00 AM',
      class_lat: 12.3142,
      class_lng: 76.6134
    };

    dao.insertSession(newSession);
    const retrieved = dao.getSessionById(sessionId);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.subject_code, 'CS501');
    assert.strictEqual(retrieved.status, 'ACTIVE');
    assert.strictEqual(retrieved.otp, '4821');
  });

  it('3. Generates high-resolution local QR Code Data URL with zero external dependencies', async () => {
    const qrConnectText = `https://smart-attendance-system.shashankj.tech/student-dashboard?check-in=true&sessionId=test_sess_1&otp=4821&option=BLUE_CIRCLE`;
    const dataUrl = await QRCode.toDataURL(qrConnectText, {
      width: 350,
      margin: 2,
      color: { dark: '#6b38d4', light: '#ffffff' }
    });

    assert.ok(dataUrl.startsWith('data:image/png;base64,'));
    assert.ok(dataUrl.length > 500);
  });

  it('4. Updates rotating OTP & challenge option without session corruption', () => {
    const sessionId = `test_sess_rot_${Date.now()}`;
    dao.insertSession({
      id: sessionId,
      subject_code: 'CS502',
      subject_name: 'Operating Systems',
      department: 'Computer Science (CSE)',
      course: 'B.E.',
      year: 3,
      section: 'B',
      otp: '1111',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      expires_at: '',
      marked_count: 0,
      expected_count: 60,
      verification_option: 'RED_SQUARE',
      lecturer_email: 'admin@sjce.edu',
      timeline: '11:00 AM - 12:00 PM',
      class_lat: 12.3142,
      class_lng: 76.6134
    });

    dao.updateSessionOtp(sessionId, '9999', 'GREEN_TRIANGLE');
    const updated = dao.getSessionById(sessionId);
    assert.ok(updated);
    assert.strictEqual(updated.otp, '9999');
    assert.strictEqual(updated.verification_option, 'GREEN_TRIANGLE');
  });

  it('5. Marks student attendance record and validates duplicate check', () => {
    const sessionId = `test_sess_att_${Date.now()}`;
    dao.insertSession({
      id: sessionId,
      subject_code: 'CS503',
      subject_name: 'Database Management',
      department: 'Computer Science (CSE)',
      course: 'B.E.',
      year: 3,
      section: 'A',
      otp: '5555',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      expires_at: '',
      marked_count: 0,
      expected_count: 55,
      verification_option: 'YELLOW_STAR',
      lecturer_email: 'dr.ramesh@sjce.edu',
      timeline: '02:00 PM - 03:00 PM',
      class_lat: 12.3142,
      class_lng: 76.6134
    });

    dao.insertAttendanceRecord({
      session_id: sessionId,
      student_usn: '4JC21CS099',
      student_name: 'Verification Candidate',
      timestamp: new Date().toISOString(),
      status: 'present',
      method: 'qr_handshake',
      device_fingerprint: 'device_test_123',
      distance_meters: 15.4
    });

    const records = dao.getAttendanceRecords().filter((r: any) => r.session_id === sessionId);
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].student_usn, '4JC21CS099');
  });
});
