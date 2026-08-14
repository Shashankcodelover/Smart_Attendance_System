import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

const DB_PATH = path.join(process.cwd(), 'attendance.sqlite');

// Initialize DB with WAL mode
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// Run migrations / schema initialization
export function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      emailOrUsn TEXT PRIMARY KEY,
      pin TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS students (
      usn TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      attendanceRate INTEGER DEFAULT 100,
      courseCode TEXT,
      section TEXT,
      year INTEGER,
      avatarUrl TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      subject_code TEXT,
      subject_name TEXT,
      department TEXT,
      course TEXT,
      year INTEGER,
      section TEXT,
      otp TEXT,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      marked_count INTEGER DEFAULT 0,
      expected_count INTEGER DEFAULT 60,
      verification_option TEXT,
      lecturer_email TEXT,
      timeline TEXT,
      class_lat REAL,
      class_lng REAL,
      is_reopened INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      student_usn TEXT NOT NULL,
      student_name TEXT,
      scanned_at DATETIME,
      submitted_at DATETIME,
      is_online INTEGER,
      verification_option TEXT,
      status TEXT,
      device_fingerprint TEXT,
      crypto_attestation TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      details TEXT
    );
  `);
}

// Data Access Object
export const dao = {
  getUsers: () => db.prepare('SELECT * FROM users').all(),
  getUserByEmail: (email: string) => db.prepare('SELECT * FROM users WHERE emailOrUsn = ?').get(email),
  insertUser: (user: any) => {
    const stmt = db.prepare('INSERT INTO users (emailOrUsn, pin, name, role) VALUES (?, ?, ?, ?)');
    stmt.run(user.emailOrUsn, user.pin, user.name, user.role);
  },
  
  getStudents: () => db.prepare('SELECT * FROM students').all(),
  insertStudent: (student: any) => {
    const stmt = db.prepare('INSERT INTO students (usn, name, attendanceRate, courseCode, section, year, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?)');
    stmt.run(student.usn, student.name, student.attendanceRate, student.courseCode, student.section, student.year, student.avatarUrl);
  },

  getSessions: () => db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all(),
  getSessionById: (id: string) => db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any,
  insertSession: (s: any) => {
    const stmt = db.prepare(`
      INSERT INTO sessions (id, subject_code, subject_name, department, course, year, section, otp, status, expires_at, marked_count, expected_count, verification_option, lecturer_email, timeline, class_lat, class_lng)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(s.id, s.subject_code, s.subject_name, s.department, s.course, s.year, s.section, s.otp, s.status, s.expires_at, s.marked_count, s.expected_count, s.verification_option, s.lecturer_email, s.timeline, s.class_lat, s.class_lng);
  },
  updateSessionStatus: (id: string, status: string, isReopened: number = 0) => {
    const stmt = db.prepare('UPDATE sessions SET status = ?, is_reopened = ? WHERE id = ?');
    stmt.run(status, isReopened, id);
  },
  incrementSessionCount: (id: string) => {
    db.prepare('UPDATE sessions SET marked_count = marked_count + 1 WHERE id = ?').run(id);
  },
  deleteSession: (id: string) => {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  },

  getAttendanceRecords: () => db.prepare('SELECT * FROM attendance_records').all(),
  getAttendanceForSession: (sessionId: string) => db.prepare('SELECT * FROM attendance_records WHERE session_id = ?').all(sessionId),
  
  // Transactional insert to act as our Mutex
  insertAttendanceRecord: (record: any) => {
    const transaction = db.transaction(() => {
      // 1. Check duplicate inside transaction (Atomic)
      const exists = db.prepare('SELECT 1 FROM attendance_records WHERE session_id = ? AND student_usn = ? COLLATE NOCASE').get(record.session_id, record.student_usn);
      if (exists) {
        throw new Error('Presence already verified for this session.');
      }
      
      // 2. Check proxy limits (Atomic)
      if (record.is_online && record.device_fingerprint) {
        const fpCountRows = db.prepare('SELECT count(*) as cnt FROM attendance_records WHERE session_id = ? AND device_fingerprint = ?').get(record.session_id, record.device_fingerprint) as any;
        if (fpCountRows.cnt >= 1) {
          throw new Error('Proxy Blocked: This device has already been used for a check-in in this session.');
        }
      }

      const stmt = db.prepare(`
        INSERT INTO attendance_records (id, session_id, student_usn, student_name, scanned_at, submitted_at, is_online, verification_option, status, device_fingerprint, crypto_attestation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        record.id || crypto.randomUUID(),
        record.session_id,
        record.student_usn,
        record.student_name,
        record.scanned_at,
        record.submitted_at,
        record.is_online ? 1 : 0,
        record.verification_option,
        record.status,
        record.device_fingerprint,
        record.crypto_attestation
      );

      // Increment count
      db.prepare('UPDATE sessions SET marked_count = marked_count + 1 WHERE id = ?').run(record.session_id);
    });

    transaction();
  },

  // Audit Logs
  insertAuditLog: (action: string, entityId: string, actorEmail: string, details: string) => {
    db.prepare('INSERT INTO audit_logs (action, entity_id, actor_email, details) VALUES (?, ?, ?, ?)').run(action, entityId, actorEmail, details);
  },

  // Test Utilities
  unsafeWipe: () => {
    db.exec('DELETE FROM attendance_records; DELETE FROM sessions; DELETE FROM users; DELETE FROM audit_logs; DELETE FROM students;');
  }
};

export default db;
