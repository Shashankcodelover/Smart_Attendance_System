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
});
