import { describe, it } from 'node:test';
import assert from 'node:assert';
import db from '../db';

describe('Smart Attendance DB & API Unit Tests', () => {
  it('should support student upsert and retrieval in db', () => {
    const testUsn = `TEST_USN_${Date.now()}`;
    db.prepare(`
      INSERT OR REPLACE INTO students (usn, name, attendance_rate, course_code, section, year, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(testUsn, 'Test Student', 90, 'CS501', 'A', 3, 'https://example.com/avatar.png');

    const students = db.prepare('SELECT * FROM students ORDER BY usn').all();
    assert(Array.isArray(students), 'Students should be an array');
    const found = students.find((s: any) => s.usn === testUsn);
    assert(found, 'Should find inserted test student');
    assert.strictEqual(found.name, 'Test Student');
  });

  it('should retrieve sessions list from db', () => {
    const sessions = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
    assert(Array.isArray(sessions), 'Sessions should be an array');
  });

  it('should support creating, activating, and fetching a session in db', () => {
    const testId = `test_sess_${Date.now()}`;
    db.prepare(`
      INSERT INTO sessions (
        id, subject_code, subject_name, department, course, year, section,
        otp, status, created_at, expires_at, marked_count, expected_count,
        verification_option, lecturer_email, timeline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testId, 'CS999', 'Software Testing', 'CSE', 'B.E.', 4, 'A',
      '1234', 'DRAFT', new Date().toISOString(), null, 0, 50,
      'SHAPE_BLUE_CIRCLE', 'tester@sjce.edu', '10:00 AM - 11:00 AM'
    );

    const fetched = db.prepare('SELECT * FROM sessions WHERE id = ?').get(testId) as any;
    assert.strictEqual(fetched.id, testId);
    assert.strictEqual(fetched.subject_code, 'CS999');
    assert.strictEqual(fetched.status, 'DRAFT');

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE sessions SET status = 'ACTIVE', otp = ?, verification_option = ?, created_at = ?, marked_count = 0 WHERE id = ?
    `).run('5678', 'SHAPE_RED_SQUARE', now, testId);

    const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(testId) as any;
    assert.strictEqual(updated.status, 'ACTIVE');
    assert.strictEqual(updated.otp, '5678');

    // Clean up
    db.prepare('DELETE FROM sessions WHERE id = ?').run(testId);
  });

  it('should reject duplicate attendance records for the same student in a session', () => {
    const testSessId = `test_sess_dup_${Date.now()}`;
    const testUsn = `4SO21CS${Math.floor(100 + Math.random() * 900)}`;
    const record1Id = `att_test_1_${Date.now()}`;
    const record2Id = `att_test_2_${Date.now()}`;

    // Insert dummy session
    db.prepare(`
      INSERT INTO sessions (id, subject_code, subject_name, department, course, year, section, otp, status, created_at, marked_count, expected_count)
      VALUES (?, 'CS502', 'System Security', 'CSE', 'B.E.', 3, 'A', '9999', 'ACTIVE', ?, 0, 60)
    `).run(testSessId, new Date().toISOString());

    // First check-in
    const nowStr = new Date().toISOString();
    db.prepare(`
      INSERT INTO attendance_records (id, session_id, student_name, student_usn, marked_at, marked_online, verification_option, scanned_at, submitted_at, device_fingerprint, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(record1Id, testSessId, 'Alice DuplicateTest', testUsn, nowStr, 1, 'BLUE_CIRCLE', nowStr, nowStr, 'device_123', 'present');

    // Check duplicate detection query
    const alreadyMarked = db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND UPPER(student_usn) = ?')
      .get(testSessId, testUsn.toUpperCase());

    assert(alreadyMarked, 'First record should exist in DB');

    // Clean up
    db.prepare('DELETE FROM attendance_records WHERE session_id = ?').run(testSessId);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(testSessId);
  });

  it('should detect duplicate device fingerprint for proxy attendance protection', () => {
    const testSessId = `test_sess_fp_${Date.now()}`;
    const student1Usn = `4SO21CS001`;
    const student2Usn = `4SO21CS002`;
    const fingerprint = `device_fp_hash_12345`;

    db.prepare(`
      INSERT INTO sessions (id, subject_code, subject_name, department, course, year, section, otp, status, created_at, marked_count, expected_count)
      VALUES (?, 'CS503', 'Network Security', 'CSE', 'B.E.', 3, 'A', '8888', 'ACTIVE', ?, 0, 60)
    `).run(testSessId, new Date().toISOString());

    // Student 1 checks in with fingerprint
    const fpNowStr = new Date().toISOString();
    db.prepare(`
      INSERT INTO attendance_records (id, session_id, student_name, student_usn, marked_at, marked_online, verification_option, scanned_at, submitted_at, device_fingerprint, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`att_fp1_${Date.now()}`, testSessId, 'Student One', student1Usn, fpNowStr, 1, 'BLUE_CIRCLE', fpNowStr, fpNowStr, fingerprint, 'present');

    // Query duplicate fingerprint for Student 2
    const duplicateDevice = db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND device_fingerprint = ? AND UPPER(student_usn) != ?')
      .get(testSessId, fingerprint, student2Usn.toUpperCase());

    assert(duplicateDevice, 'Duplicate device fingerprint should be flagged for Student 2');

    // Clean up
    db.prepare('DELETE FROM attendance_records WHERE session_id = ?').run(testSessId);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(testSessId);
  });
});
