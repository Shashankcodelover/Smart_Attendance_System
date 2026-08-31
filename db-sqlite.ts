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
      department TEXT,
      phone TEXT,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS students (
      usn TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      attendanceRate INTEGER DEFAULT 100,
      courseCode TEXT,
      section TEXT,
      year INTEGER,
      department TEXT,
      course TEXT DEFAULT 'B.E.',
      phone TEXT,
      email TEXT,
      roll_number TEXT,
      avatarUrl TEXT,
      onboarded_at DATETIME
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
      details TEXT,
      signature TEXT
    );

    CREATE TABLE IF NOT EXISTS device_bindings (
      usn TEXT NOT NULL,
      device_fingerprint TEXT NOT NULL,
      bound_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      PRIMARY KEY (usn, device_fingerprint)
    );

    CREATE TABLE IF NOT EXISTS timetable_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      lecturer_email TEXT,
      lecturer_name TEXT,
      department TEXT,
      course TEXT DEFAULT 'B.E.',
      year INTEGER,
      section TEXT,
      room TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS academic_resources (
      id TEXT PRIMARY KEY,
      subject_code TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      credits INTEGER DEFAULT 4,
      department TEXT,
      course TEXT DEFAULT 'B.E.',
      year INTEGER,
      syllabus_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id TEXT PRIMARY KEY,
      student_usn TEXT NOT NULL,
      student_name TEXT,
      type TEXT NOT NULL,
      reason TEXT,
      from_date TEXT,
      to_date TEXT,
      sessions_affected TEXT,
      status TEXT DEFAULT 'PENDING',
      reviewer_email TEXT,
      review_comment TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME
    );

    -- Performance indexes
    CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_records(session_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_usn);
    CREATE INDEX IF NOT EXISTS idx_sessions_lecturer ON sessions(lecturer_email);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_dept_year ON sessions(department, year, section);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_id);
    CREATE INDEX IF NOT EXISTS idx_timetable_day ON timetable_entries(day, department, year, section);
    CREATE INDEX IF NOT EXISTS idx_resources_dept ON academic_resources(department, year);
    CREATE INDEX IF NOT EXISTS idx_leave_student ON leave_requests(student_usn);
  `);
}

// Data Access Object
export const dao = {
  // ═══════════════════════════════════════════════════════════
  // USER OPERATIONS
  // ═══════════════════════════════════════════════════════════
  getUsers: () => db.prepare('SELECT * FROM users').all(),
  getUserByEmail: (email: string) => db.prepare('SELECT * FROM users WHERE emailOrUsn = ?').get(email),
  insertUser: (user: any) => {
    const stmt = db.prepare('INSERT INTO users (emailOrUsn, pin, name, role, department, phone) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(user.emailOrUsn, user.pin, user.name, user.role, user.department || null, user.phone || null);
  },
  updateUserPin: (emailOrUsn: string, newPin: string) => {
    db.prepare('UPDATE users SET pin = ? WHERE emailOrUsn = ?').run(newPin, emailOrUsn);
  },
  updateLastLogin: (emailOrUsn: string) => {
    db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE emailOrUsn = ?').run(emailOrUsn);
  },

  // ═══════════════════════════════════════════════════════════
  // STUDENT OPERATIONS
  // ═══════════════════════════════════════════════════════════
  getStudents: () => db.prepare('SELECT * FROM students ORDER BY usn').all(),
  getStudentByUsn: (usn: string) => db.prepare('SELECT * FROM students WHERE usn = ? COLLATE NOCASE').get(usn),
  getStudentsBySection: (department: string, year: number, section: string) =>
    db.prepare('SELECT * FROM students WHERE department = ? AND year = ? AND section = ? COLLATE NOCASE ORDER BY usn').all(department, year, section),
  insertStudent: (student: any) => {
    const stmt = db.prepare('INSERT INTO students (usn, name, attendanceRate, courseCode, section, year, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?)');
    stmt.run(student.usn, student.name, student.attendanceRate, student.courseCode, student.section, student.year, student.avatarUrl);
  },
  upsertStudent: (student: any) => {
    const stmt = db.prepare(`
      INSERT INTO students (usn, name, attendanceRate, courseCode, section, year, department, course, phone, email, roll_number, avatarUrl, onboarded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(usn) DO UPDATE SET
        name = excluded.name,
        section = COALESCE(excluded.section, students.section),
        year = COALESCE(excluded.year, students.year),
        department = COALESCE(excluded.department, students.department),
        course = COALESCE(excluded.course, students.course),
        phone = COALESCE(excluded.phone, students.phone),
        email = COALESCE(excluded.email, students.email),
        roll_number = COALESCE(excluded.roll_number, students.roll_number),
        onboarded_at = COALESCE(excluded.onboarded_at, students.onboarded_at)
    `);
    stmt.run(
      student.usn, student.name, student.attendanceRate || 100,
      student.courseCode || student.department || null,
      student.section || null, student.year || null,
      student.department || null, student.course || 'B.E.',
      student.phone || null, student.email || null,
      student.roll_number || null, student.avatarUrl || null,
      student.onboarded_at || null
    );
  },
  updateStudent: (usn: string, updates: any) => {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) { fields.push(`${key} = ?`); values.push(val); }
    }
    if (fields.length === 0) return;
    values.push(usn);
    db.prepare(`UPDATE students SET ${fields.join(', ')} WHERE usn = ?`).run(...values);
  },
  deleteStudent: (usn: string) => {
    db.prepare('DELETE FROM students WHERE usn = ? COLLATE NOCASE').run(usn);
    db.prepare('DELETE FROM users WHERE emailOrUsn = ? COLLATE NOCASE').run(usn);
    db.prepare('DELETE FROM attendance_records WHERE student_usn = ? COLLATE NOCASE').run(usn);
  },

  // ═══════════════════════════════════════════════════════════
  // SESSION OPERATIONS
  // ═══════════════════════════════════════════════════════════
  getSessions: () => db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all(),
  getSessionById: (id: string) => db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any,
  getSessionByIdOrCode: (idOrCode: string) =>
    db.prepare('SELECT * FROM sessions WHERE id = ? OR subject_code = ?').get(idOrCode, idOrCode) as any,
  getSessionsByLecturer: (email: string) =>
    db.prepare('SELECT * FROM sessions WHERE lecturer_email = ? ORDER BY created_at DESC').all(email),
  getActiveSessions: () =>
    db.prepare("SELECT * FROM sessions WHERE status IN ('ACTIVE', 'REOPENED') ORDER BY created_at DESC").all(),
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
  updateSessionOtp: (id: string, otp: string, verificationOption: string) => {
    db.prepare('UPDATE sessions SET otp = ?, verification_option = ? WHERE id = ?').run(otp, verificationOption, id);
  },
  incrementSessionCount: (id: string) => {
    db.prepare('UPDATE sessions SET marked_count = marked_count + 1 WHERE id = ?').run(id);
  },
  deleteSession: (id: string) => {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  },

  // ═══════════════════════════════════════════════════════════
  // ATTENDANCE OPERATIONS
  // ═══════════════════════════════════════════════════════════
  getAttendanceRecords: () => db.prepare('SELECT * FROM attendance_records ORDER BY submitted_at DESC').all(),
  getAttendanceForSession: (sessionId: string) => db.prepare('SELECT * FROM attendance_records WHERE session_id = ?').all(sessionId),
  getAttendanceForStudent: (usn: string) =>
    db.prepare(`
      SELECT ar.*, s.subject_code, s.subject_name, s.department, s.section, s.year, s.timeline, s.created_at as session_date
      FROM attendance_records ar
      JOIN sessions s ON ar.session_id = s.id
      WHERE ar.student_usn = ? COLLATE NOCASE
      ORDER BY ar.submitted_at DESC
    `).all(usn),
  getStudentAttendanceStats: (usn: string) =>
    db.prepare(`
      SELECT
        s.subject_code,
        s.subject_name,
        s.department,
        s.section,
        s.year,
        COUNT(DISTINCT s.id) as total_sessions,
        COUNT(DISTINCT ar.session_id) as attended_sessions
      FROM sessions s
      LEFT JOIN attendance_records ar ON s.id = ar.session_id AND ar.student_usn = ? COLLATE NOCASE
      GROUP BY s.subject_code, s.department, s.section, s.year
      ORDER BY s.subject_code
    `).all(usn),
  getAttendanceRecordBySessionAndStudent: (sessionId: string, usn: string) =>
    db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND student_usn = ? COLLATE NOCASE').get(sessionId, usn),

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

  // Toggle manual attendance (for lecturer manual override)
  toggleAttendanceManual: (sessionId: string, studentUsn: string, studentName: string, actorEmail: string) => {
    const transaction = db.transaction(() => {
      const existing = db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND student_usn = ? COLLATE NOCASE').get(sessionId, studentUsn) as any;

      if (existing) {
        // Remove attendance
        db.prepare('DELETE FROM attendance_records WHERE session_id = ? AND student_usn = ? COLLATE NOCASE').run(sessionId, studentUsn);
        db.prepare('UPDATE sessions SET marked_count = MAX(marked_count - 1, 0) WHERE id = ?').run(sessionId);
        db.prepare('INSERT INTO audit_logs (action, entity_id, actor_email, details, signature) VALUES (?, ?, ?, ?, ?)').run(
          'ATTENDANCE_MANUAL_REMOVE', sessionId, actorEmail,
          `Manually removed attendance for ${studentUsn} (${studentName}) from session ${sessionId}`,
          crypto.createHash('sha256').update(`REMOVE:${sessionId}:${studentUsn}:${actorEmail}:${Date.now()}`).digest('hex')
        );
        return { action: 'removed', studentUsn };
      } else {
        // Add attendance
        db.prepare(`
          INSERT INTO attendance_records (id, session_id, student_usn, student_name, submitted_at, is_online, status)
          VALUES (?, ?, ?, ?, ?, 0, 'MANUAL')
        `).run(crypto.randomUUID(), sessionId, studentUsn, studentName, new Date().toISOString());
        db.prepare('UPDATE sessions SET marked_count = marked_count + 1 WHERE id = ?').run(sessionId);
        db.prepare('INSERT INTO audit_logs (action, entity_id, actor_email, details, signature) VALUES (?, ?, ?, ?, ?)').run(
          'ATTENDANCE_MANUAL_ADD', sessionId, actorEmail,
          `Manually added attendance for ${studentUsn} (${studentName}) to session ${sessionId}`,
          crypto.createHash('sha256').update(`ADD:${sessionId}:${studentUsn}:${actorEmail}:${Date.now()}`).digest('hex')
        );
        return { action: 'added', studentUsn };
      }
    });

    return transaction();
  },

  // ═══════════════════════════════════════════════════════════
  // DEVICE BINDINGS
  // ═══════════════════════════════════════════════════════════
  getDeviceBinding: (usn: string) =>
    db.prepare('SELECT * FROM device_bindings WHERE usn = ? AND is_active = 1').get(usn),
  bindDevice: (usn: string, fingerprint: string) => {
    db.prepare('INSERT OR REPLACE INTO device_bindings (usn, device_fingerprint, is_active) VALUES (?, ?, 1)').run(usn, fingerprint);
  },

  // ═══════════════════════════════════════════════════════════
  // TIMETABLE OPERATIONS
  // ═══════════════════════════════════════════════════════════
  getTimetableEntries: (department?: string, year?: number, section?: string) => {
    if (department && year && section) {
      return db.prepare('SELECT * FROM timetable_entries WHERE department = ? AND year = ? AND section = ? ORDER BY day, time_slot').all(department, year, section);
    }
    if (department) {
      return db.prepare('SELECT * FROM timetable_entries WHERE department = ? ORDER BY day, time_slot').all(department);
    }
    return db.prepare('SELECT * FROM timetable_entries ORDER BY day, time_slot').all();
  },
  insertTimetableEntry: (entry: any) => {
    const stmt = db.prepare(`
      INSERT INTO timetable_entries (day, time_slot, subject_code, subject_name, lecturer_email, lecturer_name, department, course, year, section, room)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(entry.day, entry.time_slot, entry.subject_code, entry.subject_name, entry.lecturer_email || null, entry.lecturer_name || null, entry.department || 'Computer Science (CSE)', entry.course || 'B.E.', entry.year || 3, entry.section || 'A', entry.room || 'Room 101');
    return { id: res.lastInsertRowid, ...entry };
  },
  deleteTimetableEntry: (id: number | string) => {
    db.prepare('DELETE FROM timetable_entries WHERE id = ?').run(id);
  },
  clearTimetable: (department?: string, year?: number, section?: string) => {
    if (department && year && section) {
      db.prepare('DELETE FROM timetable_entries WHERE department = ? AND year = ? AND section = ?').run(department, year, section);
    } else {
      db.prepare('DELETE FROM timetable_entries').run();
    }
  },

  // ═══════════════════════════════════════════════════════════
  // ACADEMIC RESOURCES & SYLLABUS OPERATIONS
  // ═══════════════════════════════════════════════════════════
  getAcademicResources: (department?: string, year?: number) => {
    let rows: any[];
    if (department && year) {
      rows = db.prepare('SELECT * FROM academic_resources WHERE department = ? AND year = ? ORDER BY subject_code').all(department, year);
    } else if (department) {
      rows = db.prepare('SELECT * FROM academic_resources WHERE department = ? ORDER BY subject_code').all(department);
    } else {
      rows = db.prepare('SELECT * FROM academic_resources ORDER BY subject_code').all();
    }
    return rows.map(r => ({
      id: r.id,
      subjectCode: r.subject_code,
      subjectName: r.subject_name,
      credits: r.credits,
      department: r.department,
      course: r.course,
      year: r.year,
      syllabus: JSON.parse(r.syllabus_json || '[]')
    }));
  },
  insertAcademicResource: (res: any) => {
    const id = res.id || `res_${crypto.randomUUID().slice(0, 8)}`;
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO academic_resources (id, subject_code, subject_name, credits, department, course, year, syllabus_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      res.subjectCode || res.subject_code,
      res.subjectName || res.subject_name,
      res.credits || 4,
      res.department || 'Computer Science (CSE)',
      res.course || 'B.E.',
      res.year || 3,
      typeof res.syllabus === 'string' ? res.syllabus : JSON.stringify(res.syllabus || [])
    );
    return { id, ...res };
  },
  deleteAcademicResource: (id: string) => {
    db.prepare('DELETE FROM academic_resources WHERE id = ?').run(id);
  },

  // ═══════════════════════════════════════════════════════════
  // LIVE CLASS PREVIEW METRICS
  // ═══════════════════════════════════════════════════════════
  getClassPreview: (department: string, course: string, year: number, section: string) => {
    // 1. Live student headcount
    const studentCountRow = db.prepare(`
      SELECT COUNT(*) as total FROM students
      WHERE department LIKE ? AND year = ? AND section = ? COLLATE NOCASE
    `).get(`%${department.split(' ')[0]}%`, year, section) as any;

    const totalStudents = studentCountRow?.total || 0;

    // 2. Average attendance percentage from real attendance records
    const attendanceStatsRow = db.prepare(`
      SELECT
        COUNT(DISTINCT s.id) as total_sessions,
        SUM(s.marked_count) as total_marked,
        SUM(s.expected_count) as total_expected
      FROM sessions s
      WHERE s.department LIKE ? AND s.year = ? AND s.section = ? COLLATE NOCASE
    `).get(`%${department.split(' ')[0]}%`, year, section) as any;

    let avgAttendance = 85;
    if (attendanceStatsRow && attendanceStatsRow.total_expected > 0) {
      avgAttendance = Math.round((attendanceStatsRow.total_marked / attendanceStatsRow.total_expected) * 100);
    }

    // 3. Recommended / upcoming subject from timetable
    const timetableRow = db.prepare(`
      SELECT subject_code, subject_name FROM timetable_entries
      WHERE department LIKE ? AND year = ? AND section = ? COLLATE NOCASE
      LIMIT 1
    `).get(`%${department.split(' ')[0]}%`, year, section) as any;

    const subject = timetableRow ? `${timetableRow.subject_name} (${timetableRow.subject_code})` : `${department.includes('ECE') ? 'Digital Signals (EC403)' : 'Computer Architecture (CS501)'}`;

    return {
      total: totalStudents || (year === 4 ? 52 : year === 3 ? 64 : 58),
      avg: avgAttendance || 82,
      subject,
      department,
      course,
      year,
      section
    };
  },

  // ═══════════════════════════════════════════════════════════
  // LEAVE REQUESTS
  // ═══════════════════════════════════════════════════════════
  getLeaveRequests: (filter?: { studentUsn?: string; status?: string }) => {
    if (filter?.studentUsn) {
      return db.prepare('SELECT * FROM leave_requests WHERE student_usn = ? ORDER BY submitted_at DESC').all(filter.studentUsn);
    }
    if (filter?.status) {
      return db.prepare('SELECT * FROM leave_requests WHERE status = ? ORDER BY submitted_at DESC').all(filter.status);
    }
    return db.prepare('SELECT * FROM leave_requests ORDER BY submitted_at DESC').all();
  },
  insertLeaveRequest: (req: any) => {
    const id = req.id || `leave_${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO leave_requests (id, student_usn, student_name, type, reason, from_date, to_date, sessions_affected, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(id, req.student_usn, req.student_name || 'Student', req.type || 'MEDICAL', req.reason || '', req.from_date || '', req.to_date || '', req.sessions_affected || null);
    return { id, ...req, status: 'PENDING' };
  },
  reviewLeaveRequest: (id: string, decision: string, reviewerEmail: string, comment?: string) => {
    db.prepare('UPDATE leave_requests SET status = ?, reviewer_email = ?, review_comment = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(decision, reviewerEmail, comment || null, id);
  },

  // ═══════════════════════════════════════════════════════════
  // AUDIT LOGS
  // ═══════════════════════════════════════════════════════════
  getAuditLogs: (entityId?: string) => {
    if (entityId) {
      return db.prepare('SELECT * FROM audit_logs WHERE entity_id = ? ORDER BY timestamp DESC').all(entityId);
    }
    return db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200').all();
  },
  insertAuditLog: (action: string, entityId: string, actorEmail: string, details: string) => {
    const signature = crypto.createHash('sha256').update(`${action}:${entityId}:${actorEmail}:${Date.now()}`).digest('hex');
    db.prepare('INSERT INTO audit_logs (action, entity_id, actor_email, details, signature) VALUES (?, ?, ?, ?, ?)').run(action, entityId, actorEmail, details, signature);
  },

  // ═══════════════════════════════════════════════════════════
  // ANALYTICS & REPORTING
  // ═══════════════════════════════════════════════════════════
  getDepartmentStats: () =>
    db.prepare(`
      SELECT
        s.department,
        s.year,
        s.section,
        COUNT(DISTINCT s.id) as total_sessions,
        SUM(s.marked_count) as total_checkins,
        SUM(s.expected_count) as total_expected,
        ROUND(CAST(SUM(s.marked_count) AS REAL) / NULLIF(SUM(s.expected_count), 0) * 100, 1) as avg_attendance_pct
      FROM sessions s
      GROUP BY s.department, s.year, s.section
      ORDER BY s.department, s.year, s.section
    `).all(),
  getStudentsBelowThreshold: (threshold: number = 75) =>
    db.prepare(`
      SELECT
        st.usn, st.name, st.department, st.section, st.year,
        COUNT(DISTINCT s.id) as total_sessions,
        COUNT(DISTINCT ar.session_id) as attended,
        ROUND(CAST(COUNT(DISTINCT ar.session_id) AS REAL) / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 1) as attendance_pct
      FROM students st
      CROSS JOIN sessions s ON s.department = st.department AND s.year = st.year AND s.section = st.section
      LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_usn = st.usn
      GROUP BY st.usn
      HAVING attendance_pct < ? OR attendance_pct IS NULL
      ORDER BY attendance_pct ASC
    `).all(threshold),

  // ═══════════════════════════════════════════════════════════
  // SAMPLE DATA SEEDER
  // ═══════════════════════════════════════════════════════════
  seedSampleData: () => {
    const transaction = db.transaction(() => {
      // Check if data already seeded
      const existingStudents = db.prepare('SELECT COUNT(*) as cnt FROM students').get() as any;
      if (existingStudents.cnt > 5) return { alreadySeeded: true };

      // --- DEPARTMENTS / BRANCHES ---
      const departments = ['Computer Science (CSE)', 'Electronics & Communication (ECE)', 'Mechanical Engineering (ME)', 'Information Science (ISE)'];

      // --- SAMPLE LECTURERS ---
      const lecturers = [
        { emailOrUsn: 'dr.ramesh@sjce.edu', pin: '$2b$10$placeholder', name: 'Dr. Ramesh Kumar', role: 'lecturer', department: 'Computer Science (CSE)' },
        { emailOrUsn: 'dr.priya@sjce.edu', pin: '$2b$10$placeholder', name: 'Dr. Priya Sharma', role: 'lecturer', department: 'Computer Science (CSE)' },
        { emailOrUsn: 'dr.suresh@sjce.edu', pin: '$2b$10$placeholder', name: 'Dr. Suresh Nair', role: 'lecturer', department: 'Electronics & Communication (ECE)' },
        { emailOrUsn: 'dr.anitha@sjce.edu', pin: '$2b$10$placeholder', name: 'Dr. Anitha Reddy', role: 'lecturer', department: 'Mechanical Engineering (ME)' },
        { emailOrUsn: 'admin@sjce.edu', pin: '$2b$10$placeholder', name: 'Admin User', role: 'admin', department: 'Administration' },
      ];

      for (const l of lecturers) {
        db.prepare('INSERT OR IGNORE INTO users (emailOrUsn, pin, name, role, department) VALUES (?, ?, ?, ?, ?)').run(l.emailOrUsn, l.pin, l.name, l.role, l.department);
      }

      // --- SAMPLE STUDENTS (Across CSE 3rd year A & B, ECE 3rd year A) ---
      const cseStudents3A = [
        '4JC21CS001', '4JC21CS002', '4JC21CS003', '4JC21CS004', '4JC21CS005',
        '4JC21CS006', '4JC21CS007', '4JC21CS008', '4JC21CS009', '4JC21CS010',
        '4JC21CS011', '4JC21CS012', '4JC21CS013', '4JC21CS014', '4JC21CS015',
      ];
      const cseStudents3B = [
        '4JC21CS031', '4JC21CS032', '4JC21CS033', '4JC21CS034', '4JC21CS035',
        '4JC21CS036', '4JC21CS037', '4JC21CS038', '4JC21CS039', '4JC21CS040',
      ];
      const eceStudents3A = [
        '4JC21EC001', '4JC21EC002', '4JC21EC003', '4JC21EC004', '4JC21EC005',
        '4JC21EC006', '4JC21EC007', '4JC21EC008', '4JC21EC009', '4JC21EC010',
      ];

      const firstNames = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Shaurya', 'Atharv', 'Advik', 'Pranav', 'Advaith', 'Dhruv', 'Kabir', 'Ritvik', 'Aarush', 'Kayaan', 'Darsh', 'Veer', 'Sahil', 'Rohan', 'Yash', 'Manav', 'Virat', 'Arnav', 'Laksh', 'Harshan', 'Naveen', 'Suhas', 'Karthik', 'Rahul', 'Amit'];
      const lastNames = ['Sharma', 'Patel', 'Reddy', 'Kumar', 'Singh', 'Nair', 'Rao', 'Gupta', 'Joshi', 'Verma', 'Das', 'Iyer', 'Hegde', 'Shetty', 'Gowda'];

      const insertStudentBatch = (usns: string[], dept: string, sec: string) => {
        for (let i = 0; i < usns.length; i++) {
          const name = `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`;
          db.prepare(`INSERT OR IGNORE INTO students (usn, name, attendanceRate, courseCode, section, year, department, course, roll_number)
            VALUES (?, ?, ?, ?, ?, 3, ?, 'B.E.', ?)`).run(
            usns[i], name, Math.floor(Math.random() * 30) + 70,
            dept === 'Computer Science (CSE)' ? 'CS' : 'EC',
            sec, dept, usns[i].slice(-3)
          );
          db.prepare('INSERT OR IGNORE INTO users (emailOrUsn, pin, name, role, department) VALUES (?, ?, ?, ?, ?)')
            .run(usns[i], '$2b$10$placeholder', name, 'student', dept);
        }
      };

      insertStudentBatch(cseStudents3A, 'Computer Science (CSE)', 'A');
      insertStudentBatch(cseStudents3B, 'Computer Science (CSE)', 'B');
      insertStudentBatch(eceStudents3A, 'Electronics & Communication (ECE)', 'A');

      // --- SAMPLE TIMETABLE ---
      const cse3ATimetable = [
        { day: 'Monday', time_slot: '09:00 - 10:00', subject_code: 'CS501', subject_name: 'Computer Networks', lecturer_email: 'dr.ramesh@sjce.edu', lecturer_name: 'Dr. Ramesh Kumar', room: 'CS-301' },
        { day: 'Monday', time_slot: '10:00 - 11:00', subject_code: 'CS502', subject_name: 'Database Management Systems', lecturer_email: 'dr.priya@sjce.edu', lecturer_name: 'Dr. Priya Sharma', room: 'CS-301' },
        { day: 'Monday', time_slot: '11:15 - 12:15', subject_code: 'CS503', subject_name: 'Operating Systems', lecturer_email: 'dr.ramesh@sjce.edu', lecturer_name: 'Dr. Ramesh Kumar', room: 'CS-301' },
        { day: 'Tuesday', time_slot: '09:00 - 10:00', subject_code: 'CS504', subject_name: 'Software Engineering', lecturer_email: 'dr.priya@sjce.edu', lecturer_name: 'Dr. Priya Sharma', room: 'CS-301' },
        { day: 'Tuesday', time_slot: '10:00 - 11:00', subject_code: 'CS501', subject_name: 'Computer Networks', lecturer_email: 'dr.ramesh@sjce.edu', lecturer_name: 'Dr. Ramesh Kumar', room: 'CS-301' },
        { day: 'Tuesday', time_slot: '11:15 - 12:15', subject_code: 'CS505', subject_name: 'Computer Architecture', lecturer_email: 'dr.ramesh@sjce.edu', lecturer_name: 'Dr. Ramesh Kumar', room: 'CS-Lab-2' },
        { day: 'Wednesday', time_slot: '09:00 - 10:00', subject_code: 'CS502', subject_name: 'Database Management Systems', lecturer_email: 'dr.priya@sjce.edu', lecturer_name: 'Dr. Priya Sharma', room: 'CS-301' },
        { day: 'Wednesday', time_slot: '10:00 - 11:00', subject_code: 'CS503', subject_name: 'Operating Systems', lecturer_email: 'dr.ramesh@sjce.edu', lecturer_name: 'Dr. Ramesh Kumar', room: 'CS-301' },
        { day: 'Wednesday', time_slot: '11:15 - 12:15', subject_code: 'CS504', subject_name: 'Software Engineering', lecturer_email: 'dr.priya@sjce.edu', lecturer_name: 'Dr. Priya Sharma', room: 'CS-301' },
        { day: 'Thursday', time_slot: '09:00 - 10:00', subject_code: 'CS505', subject_name: 'Computer Architecture', lecturer_email: 'dr.ramesh@sjce.edu', lecturer_name: 'Dr. Ramesh Kumar', room: 'CS-301' },
        { day: 'Thursday', time_slot: '10:00 - 11:00', subject_code: 'CS501', subject_name: 'Computer Networks', lecturer_email: 'dr.ramesh@sjce.edu', lecturer_name: 'Dr. Ramesh Kumar', room: 'CS-Lab-1' },
        { day: 'Thursday', time_slot: '11:15 - 12:15', subject_code: 'CS502', subject_name: 'Database Management Systems', lecturer_email: 'dr.priya@sjce.edu', lecturer_name: 'Dr. Priya Sharma', room: 'CS-301' },
        { day: 'Friday', time_slot: '09:00 - 10:00', subject_code: 'CS503', subject_name: 'Operating Systems', lecturer_email: 'dr.ramesh@sjce.edu', lecturer_name: 'Dr. Ramesh Kumar', room: 'CS-301' },
        { day: 'Friday', time_slot: '10:00 - 11:00', subject_code: 'CS504', subject_name: 'Software Engineering', lecturer_email: 'dr.priya@sjce.edu', lecturer_name: 'Dr. Priya Sharma', room: 'CS-301' },
        { day: 'Friday', time_slot: '11:15 - 12:15', subject_code: 'CS505', subject_name: 'Computer Architecture', lecturer_email: 'dr.ramesh@sjce.edu', lecturer_name: 'Dr. Ramesh Kumar', room: 'CS-301' },
      ];

      for (const entry of cse3ATimetable) {
        db.prepare(`INSERT INTO timetable_entries (day, time_slot, subject_code, subject_name, lecturer_email, lecturer_name, department, course, year, section, room)
          VALUES (?, ?, ?, ?, ?, ?, 'Computer Science (CSE)', 'B.E.', 3, 'A', ?)`).run(entry.day, entry.time_slot, entry.subject_code, entry.subject_name, entry.lecturer_email, entry.lecturer_name, entry.room);
      }

      // --- SAMPLE ACADEMIC RESOURCES / SYLLABUS ---
      const sampleResources = [
        {
          id: 'res_cs501',
          subjectCode: 'CS501',
          subjectName: 'Computer Architecture',
          credits: 4,
          department: 'Computer Science (CSE)',
          year: 3,
          syllabus: [
            { unit: 'Unit I', title: 'Basic Structure of Computers', topic: 'Functional units, Basic operational concepts, Bus structures, Software performance, Memory locations and addresses, Instruction sequencing.' },
            { unit: 'Unit II', title: 'Arithmetic Operations', topic: 'Addition and subtraction of signed numbers, Fast adders, Signed operand multiplication, Booth algorithm, Integer division.' },
            { unit: 'Unit III', title: 'Basic Processing Unit', topic: 'Fundamental concepts, Complete instruction execution, Multiple bus organization, Hardwired & Microprogrammed control.' },
            { unit: 'Unit IV', title: 'Memory System', topic: 'Semiconductor RAM/ROM, Cache memories mapping functions, Replacement algorithms, Virtual memory management.' },
          ]
        },
        {
          id: 'res_cs502',
          subjectCode: 'CS502',
          subjectName: 'Database Management Systems',
          credits: 4,
          department: 'Computer Science (CSE)',
          year: 3,
          syllabus: [
            { unit: 'Unit I', title: 'Introduction & Data Models', topic: 'Database system architecture, Relational data model, E-R diagrams, Relational algebra and calculus operations.' },
            { unit: 'Unit II', title: 'SQL & Normalization', topic: 'Complex SQL queries, Triggers, Views, Functional dependencies, 1NF, 2NF, 3NF, BCNF decomposition.' },
            { unit: 'Unit III', title: 'Transaction Processing', topic: 'ACID properties, Concurrency control, Two-phase locking (2PL), Deadlock handling, Write-Ahead Logging (WAL).' },
          ]
        },
        {
          id: 'res_ai402',
          subjectCode: 'AI402',
          subjectName: 'Neural Networks & Deep Learning',
          credits: 3,
          department: 'Computer Science (CSE)',
          year: 4,
          syllabus: [
            { unit: 'Unit I', title: 'Brain & Perceptron Models', topic: 'Biological neural systems, Models of a Neuron, Directed graphs, Single & Multilayer Perceptrons, Backpropagation algorithm.' },
            { unit: 'Unit II', title: 'Deep Architectures', topic: 'Convolutional Neural Networks (CNN), Recurrent Neural Networks (RNN), LSTM, Attention mechanisms and Transformers.' },
          ]
        }
      ];

      for (const r of sampleResources) {
        db.prepare(`
          INSERT INTO academic_resources (id, subject_code, subject_name, credits, department, course, year, syllabus_json)
          VALUES (?, ?, ?, ?, ?, 'B.E.', ?, ?)
        `).run(r.id, r.subjectCode, r.subjectName, r.credits, r.department, r.year, JSON.stringify(r.syllabus));
      }

      // --- SAMPLE SESSIONS ---
      const now = Date.now();
      const sampleSessions = [
        { id: `sess_${crypto.randomUUID().slice(0, 8)}`, subject_code: 'CS501', subject_name: 'Computer Networks', department: 'Computer Science (CSE)', course: 'B.E.', year: 3, section: 'A', otp: '1234', status: 'COMPLETED', marked_count: 12, expected_count: 15, verification_option: 'BLUE_CIRCLE', lecturer_email: 'dr.ramesh@sjce.edu', timeline: '09:00 AM - 10:00 AM', class_lat: 12.3142, class_lng: 76.6134 },
        { id: `sess_${crypto.randomUUID().slice(0, 8)}`, subject_code: 'CS502', subject_name: 'Database Management Systems', department: 'Computer Science (CSE)', course: 'B.E.', year: 3, section: 'A', otp: '5678', status: 'COMPLETED', marked_count: 14, expected_count: 15, verification_option: 'RED_SQUARE', lecturer_email: 'dr.priya@sjce.edu', timeline: '10:00 AM - 11:00 AM', class_lat: 12.3142, class_lng: 76.6134 },
        { id: `sess_${crypto.randomUUID().slice(0, 8)}`, subject_code: 'CS503', subject_name: 'Operating Systems', department: 'Computer Science (CSE)', course: 'B.E.', year: 3, section: 'A', otp: '9012', status: 'COMPLETED', marked_count: 11, expected_count: 15, verification_option: 'GREEN_TRIANGLE', lecturer_email: 'dr.ramesh@sjce.edu', timeline: '11:15 AM - 12:15 PM', class_lat: 12.3142, class_lng: 76.6134 },
      ];

      for (const sess of sampleSessions) {
        db.prepare(`INSERT OR IGNORE INTO sessions (id, subject_code, subject_name, department, course, year, section, otp, status, marked_count, expected_count, verification_option, lecturer_email, timeline, class_lat, class_lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(sess.id, sess.subject_code, sess.subject_name, sess.department, sess.course, sess.year, sess.section, sess.otp, sess.status, sess.marked_count, sess.expected_count, sess.verification_option, sess.lecturer_email, sess.timeline, sess.class_lat, sess.class_lng);

        const attendeeCount = sess.marked_count;
        for (let i = 0; i < attendeeCount && i < cseStudents3A.length; i++) {
          const studentName = `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`;
          db.prepare(`INSERT OR IGNORE INTO attendance_records (id, session_id, student_usn, student_name, submitted_at, is_online, status)
            VALUES (?, ?, ?, ?, ?, 1, 'VERIFIED')`)
            .run(crypto.randomUUID(), sess.id, cseStudents3A[i], studentName, new Date(now - Math.random() * 86400000).toISOString());
        }
      }

      return { seeded: true, students: cseStudents3A.length + cseStudents3B.length + eceStudents3A.length, sessions: sampleSessions.length };
    });

    return transaction();
  },

  // ═══════════════════════════════════════════════════════════
  // TEST UTILITIES
  // ═══════════════════════════════════════════════════════════
  unsafeWipe: () => {
    db.exec('DELETE FROM attendance_records; DELETE FROM sessions; DELETE FROM users; DELETE FROM audit_logs; DELETE FROM students; DELETE FROM device_bindings; DELETE FROM timetable_entries; DELETE FROM academic_resources; DELETE FROM leave_requests;');
  }
};

export default db;
