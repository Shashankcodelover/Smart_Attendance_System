import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

let DB_PATH = path.join(process.cwd(), 'attendance.sqlite');

// On Vercel / serverless, process.cwd() is read-only. Copy sqlite db to /tmp if needed
if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const tmpPath = path.join('/tmp', 'attendance.sqlite');
  try {
    if (!fs.existsSync(tmpPath) && fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, tmpPath);
    }
    if (fs.existsSync(tmpPath)) {
      DB_PATH = tmpPath;
    }
  } catch (e) {
    console.warn('[DB] Could not copy sqlite to /tmp:', e);
  }
}

// Initialize DB with WAL mode
let db: any;
try {
  db = new Database(DB_PATH);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
  } catch (e) {
    console.warn('[DB] Pragma configuration warning:', e);
  }
} catch (err) {
  console.error('[DB] SQLite connection error:', err);
}


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

    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      student_usn TEXT NOT NULL,
      course_code TEXT NOT NULL,
      course_name TEXT NOT NULL,
      department TEXT NOT NULL,
      semester INTEGER NOT NULL,
      section TEXT NOT NULL,
      academic_year TEXT DEFAULT '2026-2027',
      status TEXT DEFAULT 'ENROLLED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS academic_relations (
      id TEXT PRIMARY KEY,
      lecturer_email TEXT NOT NULL,
      lecturer_name TEXT NOT NULL,
      course_code TEXT NOT NULL,
      course_name TEXT NOT NULL,
      department TEXT NOT NULL,
      section TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      classroom_room TEXT DEFAULT 'Hall-301',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    CREATE INDEX IF NOT EXISTS idx_enrollments_usn ON enrollments(student_usn);
    CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_code);
    CREATE INDEX IF NOT EXISTS idx_academic_relations_lecturer ON academic_relations(lecturer_email);
    CREATE INDEX IF NOT EXISTS idx_academic_relations_course ON academic_relations(course_code);
  `);

  // Ensure default academic relations exist
  try {
    const existingRelations = db.prepare('SELECT COUNT(*) as cnt FROM academic_relations').get() as any;
    if (!existingRelations || existingRelations.cnt === 0) {
      const defaultRelations = [
        { id: 'rel_01', lecturer_email: 'dr.ramesh@sjce.edu', lecturer_name: 'Dr. Ramesh Kumar', course_code: 'CS501', course_name: 'Computer Networks', department: 'Computer Science (CSE)', section: 'A', relation_type: 'primary_instructor', classroom_room: 'CS-Lab-1' },
        { id: 'rel_02', lecturer_email: 'dr.priya@sjce.edu', lecturer_name: 'Dr. Priya Sharma', course_code: 'CS502', course_name: 'Database Management Systems', department: 'Computer Science (CSE)', section: 'A', relation_type: 'primary_instructor', classroom_room: 'CS-301' },
        { id: 'rel_03', lecturer_email: 'dr.ramesh@sjce.edu', lecturer_name: 'Dr. Ramesh Kumar', course_code: 'CS503', course_name: 'Operating Systems', department: 'Computer Science (CSE)', section: 'A', relation_type: 'primary_instructor', classroom_room: 'CS-301' },
        { id: 'rel_04', lecturer_email: 'dr.priya@sjce.edu', lecturer_name: 'Dr. Priya Sharma', course_code: 'CS504', course_name: 'Software Engineering', department: 'Computer Science (CSE)', section: 'A', relation_type: 'course_coordinator', classroom_room: 'CS-301' },
        { id: 'rel_05', lecturer_email: 'prof.suresh@sjce.edu', lecturer_name: 'Prof. Suresh N.', course_code: 'CS501L', course_name: 'Networks & Protocols Laboratory', department: 'Computer Science (CSE)', section: 'A', relation_type: 'lab_coordinator', classroom_room: 'Network-Lab-2' },
        { id: 'rel_06', lecturer_email: 'dr.ramesh@sjce.edu', lecturer_name: 'Dr. Ramesh Kumar', course_code: 'CS505', course_name: 'Computer Architecture', department: 'Computer Science (CSE)', section: 'A', relation_type: 'elective_advisor', classroom_room: 'CS-302' },
        { id: 'rel_07', lecturer_email: 'dr.ananya@sjce.edu', lecturer_name: 'Dr. Ananya Ray', course_code: 'EC301', course_name: 'Signals & Systems', department: 'Electronics & Communication (ECE)', section: 'A', relation_type: 'primary_instructor', classroom_room: 'EC-201' }
      ];
      const relStmt = db.prepare(`INSERT INTO academic_relations (id, lecturer_email, lecturer_name, course_code, course_name, department, section, relation_type, classroom_room) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const r of defaultRelations) {
        relStmt.run(r.id, r.lecturer_email, r.lecturer_name, r.course_code, r.course_name, r.department, r.section, r.relation_type, r.classroom_room);
      }
    }
  } catch (e) {
    // Ignore if table not yet ready
  }

  // Ensure default enrollments exist
  try {
    const existingEnrollments = db.prepare('SELECT COUNT(*) as cnt FROM enrollments').get() as any;
    if (!existingEnrollments || existingEnrollments.cnt === 0) {
      const defaultCourses = [
        { code: 'CS501', name: 'Computer Networks' },
        { code: 'CS502', name: 'Database Management Systems' },
        { code: 'CS503', name: 'Operating Systems' },
        { code: 'CS504', name: 'Software Engineering' },
        { code: 'CS505', name: 'Computer Architecture' }
      ];
      const studentsList = db.prepare('SELECT usn, name FROM students WHERE section = "A" LIMIT 15').all() as any[];
      if (studentsList && studentsList.length > 0) {
        const enrStmt = db.prepare(`INSERT OR IGNORE INTO enrollments (id, student_usn, course_code, course_name, department, semester, section, academic_year, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const st of studentsList) {
          for (const c of defaultCourses) {
            enrStmt.run(`enr_${crypto.randomUUID().slice(0, 8)}`, st.usn, c.code, c.name, 'Computer Science (CSE)', 5, 'A', '2026-2027', 'ENROLLED');
          }
        }
      }
    }
  } catch (e) {
    // Ignore
  }

  // Ensure default academic resources exist
  try {
    const existingResources = db.prepare('SELECT COUNT(*) as cnt FROM academic_resources').get() as any;
    if (!existingResources || existingResources.cnt === 0) {
      const defaultResources = [
        {
          id: 'res_cs501',
          subject_code: 'CS501',
          subject_name: 'Computer Networks',
          credits: 4,
          department: 'Computer Science (CSE)',
          course: 'B.E.',
          year: 3,
          syllabus_json: JSON.stringify([
            { unit: 'Unit I', title: 'Network Layer & IP Architecture', topic: 'IPv4/IPv6 packet addressing, subnetting, CIDR, and routing protocols (OSPF, BGP).' },
            { unit: 'Unit II', title: 'Transport Layer & Congestion Control', topic: 'TCP 3-way handshake, flow control, window management, UDP, and QUIC / HTTP/3.' },
            { unit: 'Unit III', title: 'Data Link Layer & MAC Protocols', topic: 'Ethernet, CSMA/CD, framing, error detection/correction, and VLAN switching.' },
            { unit: 'Unit IV', title: 'Network Security & Cryptography', topic: 'TLS 1.3 handshake, symmetric/asymmetric ciphers, SHA-256, and zero-trust perimeter.' }
          ])
        },
        {
          id: 'res_cs502',
          subject_code: 'CS502',
          subject_name: 'Database Management Systems',
          credits: 4,
          department: 'Computer Science (CSE)',
          course: 'B.E.',
          year: 3,
          syllabus_json: JSON.stringify([
            { unit: 'Unit I', title: 'Relational Model & Relational Algebra', topic: 'ER diagrams, relational schema mapping, tuple calculus, and SQL DDL/DML.' },
            { unit: 'Unit II', title: 'Schema Refinement & Normalization', topic: 'Functional dependencies, 1NF, 2NF, 3NF, BCNF, and lossless join decomposition.' },
            { unit: 'Unit III', title: 'Transaction Processing & ACID Properties', topic: 'Serializability, 2PL lock manager, deadlocks, and write-ahead logging (WAL).' },
            { unit: 'Unit IV', title: 'Indexing & Distributed DB Engines', topic: 'B+ trees, hash indexes, LSM trees, CAP theorem, and distributed replication.' }
          ])
        },
        {
          id: 'res_cs503',
          subject_code: 'CS503',
          subject_name: 'Operating Systems',
          credits: 4,
          department: 'Computer Science (CSE)',
          course: 'B.E.',
          year: 3,
          syllabus_json: JSON.stringify([
            { unit: 'Unit I', title: 'Process Management & Multithreading', topic: 'PCB structures, context switching, CPU scheduling algorithms, and POSIX threads.' },
            { unit: 'Unit II', title: 'Memory Virtualization & Paging', topic: 'Virtual address translation, TLBs, page fault handlers, and inverted page tables.' },
            { unit: 'Unit III', title: 'File Systems & Storage I/O', topic: 'Inode allocation, journaled filesystems, disk arm scheduling, and buffer cache.' }
          ])
        },
        {
          id: 'res_ai402',
          subject_code: 'AI402',
          subject_name: 'Applied Machine Learning & Deep Networks',
          credits: 4,
          department: 'Computer Science (CSE)',
          course: 'B.E.',
          year: 3,
          syllabus_json: JSON.stringify([
            { unit: 'Unit I', title: 'Supervised Learning & Regularization', topic: 'Gradient descent, cross-entropy loss, L1/L2 regularization, and feature spaces.' },
            { unit: 'Unit II', title: 'Deep Neural Architectures', topic: 'Backpropagation, activation functions, CNNs for computer vision, and Transformer attention.' }
          ])
        }
      ];
      const resStmt = db.prepare(`INSERT OR IGNORE INTO academic_resources (id, subject_code, subject_name, credits, department, course, year, syllabus_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const resItem of defaultResources) {
        resStmt.run(resItem.id, resItem.subject_code, resItem.subject_name, resItem.credits, resItem.department, resItem.course, resItem.year, resItem.syllabus_json);
      }
    }
  } catch (e) {
    // Ignore
  }
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

  recordAttendance: (
    sessionId: string,
    studentUsn: string,
    verificationOption: string = 'PRESENT',
    status: string = 'PRESENT',
    lat?: number,
    lng?: number,
    cryptoAttestation?: string
  ) => {
    const student = db.prepare('SELECT name FROM students WHERE usn = ? COLLATE NOCASE').get(studentUsn) as any;
    const stmt = db.prepare(`
      INSERT INTO attendance_records (id, session_id, student_usn, student_name, scanned_at, submitted_at, is_online, verification_option, status, crypto_attestation)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    stmt.run(id, sessionId, studentUsn, student?.name || 'Student Candidate', now, now, verificationOption, status, cryptoAttestation || null);
    db.prepare('UPDATE sessions SET marked_count = marked_count + 1 WHERE id = ?').run(sessionId);
    return { id, sessionId, studentUsn, status };
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
  // ATTENDANCE DELETIONS & CUSTODY PURGE
  // ═══════════════════════════════════════════════════════════
  deleteAttendanceRecord: (id: string | number) => {
    const rec = db.prepare('SELECT session_id FROM attendance_records WHERE id = ?').get(id) as any;
    db.prepare('DELETE FROM attendance_records WHERE id = ?').run(id);
    if (rec?.session_id) {
      db.prepare('UPDATE sessions SET marked_count = MAX(marked_count - 1, 0) WHERE id = ?').run(rec.session_id);
    }
  },
  deleteAttendanceBySessionAndStudent: (sessionId: string, studentUsn: string) => {
    const res = db.prepare('DELETE FROM attendance_records WHERE session_id = ? AND student_usn = ? COLLATE NOCASE').run(sessionId, studentUsn);
    if (res.changes > 0) {
      db.prepare('UPDATE sessions SET marked_count = MAX(marked_count - 1, 0) WHERE id = ?').run(sessionId);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // ENROLLMENTS RELATIONS OPERATIONS
  // ═══════════════════════════════════════════════════════════
  getEnrollments: (filters?: { studentUsn?: string; courseCode?: string; section?: string }) => {
    let query = 'SELECT * FROM enrollments WHERE 1=1';
    const params: any[] = [];
    if (filters?.studentUsn) {
      query += ' AND student_usn = ? COLLATE NOCASE';
      params.push(filters.studentUsn);
    }
    if (filters?.courseCode) {
      query += ' AND course_code = ? COLLATE NOCASE';
      params.push(filters.courseCode);
    }
    if (filters?.section) {
      query += ' AND section = ? COLLATE NOCASE';
      params.push(filters.section);
    }
    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params);
  },
  insertEnrollment: (e: any) => {
    const id = e.id || `enr_${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO enrollments (id, student_usn, course_code, course_name, department, semester, section, academic_year, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, e.student_usn || e.studentUsn, e.course_code || e.courseCode,
      e.course_name || e.courseName || 'Core Course',
      e.department || 'Computer Science (CSE)',
      e.semester || 5, e.section || 'A',
      e.academic_year || '2026-2027', e.status || 'ENROLLED'
    );
    return { id, ...e };
  },
  deleteEnrollment: (id: string) => {
    db.prepare('DELETE FROM enrollments WHERE id = ?').run(id);
  },

  // ═══════════════════════════════════════════════════════════
  // ACADEMIC RELATIONS & FACULTY ALLOCATION MESH
  // ═══════════════════════════════════════════════════════════
  getAcademicRelations: (filters?: { lecturerEmail?: string; courseCode?: string; department?: string }) => {
    let query = 'SELECT * FROM academic_relations WHERE 1=1';
    const params: any[] = [];
    if (filters?.lecturerEmail) {
      query += ' AND lecturer_email = ? COLLATE NOCASE';
      params.push(filters.lecturerEmail);
    }
    if (filters?.courseCode) {
      query += ' AND course_code = ? COLLATE NOCASE';
      params.push(filters.courseCode);
    }
    if (filters?.department) {
      query += ' AND department LIKE ?';
      params.push(`%${filters.department}%`);
    }
    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params);
  },
  insertAcademicRelation: (r: any) => {
    const id = r.id || `rel_${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO academic_relations (id, lecturer_email, lecturer_name, course_code, course_name, department, section, relation_type, classroom_room)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, r.lecturer_email || r.lecturerEmail, r.lecturer_name || r.lecturerName || 'Faculty',
      r.course_code || r.courseCode, r.course_name || r.courseName,
      r.department || 'Computer Science (CSE)', r.section || 'A',
      r.relation_type || r.relationType || 'primary_instructor',
      r.classroom_room || r.classroomRoom || 'Room 101'
    );
    return { id, ...r };
  },
  deleteAcademicRelation: (id: string) => {
    db.prepare('DELETE FROM academic_relations WHERE id = ?').run(id);
  },

  // ═══════════════════════════════════════════════════════════
  // BATCH BULK INGESTION ("UPLOADATION")
  // ═══════════════════════════════════════════════════════════
  bulkUpsertStudents: (studentsList: any[]) => {
    const transaction = db.transaction((list: any[]) => {
      let count = 0;
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
          roll_number = COALESCE(excluded.roll_number, students.roll_number)
      `);
      for (const st of list) {
        if (!st.usn || !st.name) continue;
        stmt.run(
          st.usn.trim().toUpperCase(), st.name.trim(), st.attendanceRate || 85,
          st.courseCode || st.department || 'CSE', st.section || 'A', st.year || 3,
          st.department || 'Computer Science (CSE)', st.course || 'B.E.',
          st.phone || null, st.email || null, st.roll_number || null, st.avatarUrl || null,
          new Date().toISOString()
        );
        count++;
      }
      return count;
    });
    return transaction(studentsList);
  },

  bulkInsertAttendance: (recordsList: any[]) => {
    const transaction = db.transaction((list: any[]) => {
      let count = 0;
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO attendance_records (id, session_id, student_usn, student_name, submitted_at, is_online, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const rec of list) {
        if (!rec.sessionId || !rec.studentUsn) continue;
        stmt.run(
          rec.id || crypto.randomUUID(), rec.sessionId, rec.studentUsn.trim().toUpperCase(),
          rec.studentName || 'Student', rec.submittedAt || new Date().toISOString(),
          rec.isOnline !== undefined ? (rec.isOnline ? 1 : 0) : 1,
          rec.status || 'VERIFIED'
        );
        db.prepare('UPDATE sessions SET marked_count = marked_count + 1 WHERE id = ?').run(rec.sessionId);
        count++;
      }
      return count;
    });
    return transaction(recordsList);
  },

  bulkInsertTimetable: (entriesList: any[]) => {
    const transaction = db.transaction((list: any[]) => {
      let count = 0;
      const stmt = db.prepare(`
        INSERT INTO timetable_entries (day, time_slot, subject_code, subject_name, lecturer_email, lecturer_name, department, course, year, section, room)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const e of list) {
        if (!e.day || !e.subject_code) continue;
        stmt.run(
          e.day, e.time_slot || e.timeSlot || '10:00 - 11:00',
          e.subject_code || e.subjectCode, e.subject_name || e.subjectName || 'Lecture',
          e.lecturer_email || e.lecturerEmail || null, e.lecturer_name || e.lecturerName || null,
          e.department || 'Computer Science (CSE)', e.course || 'B.E.',
          e.year || 3, e.section || 'A', e.room || 'Room 101'
        );
        count++;
      }
      return count;
    });
    return transaction(entriesList);
  },

  bulkInsertEnrollments: (enrollmentsList: any[]) => {
    const transaction = db.transaction((list: any[]) => {
      let count = 0;
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO enrollments (id, student_usn, course_code, course_name, department, semester, section, academic_year, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const enr of list) {
        if (!enr.studentUsn || !enr.courseCode) continue;
        stmt.run(
          enr.id || `enr_${crypto.randomUUID().slice(0, 8)}`,
          enr.studentUsn.trim().toUpperCase(), enr.courseCode.trim().toUpperCase(),
          enr.courseName || 'Core Subject', enr.department || 'Computer Science (CSE)',
          enr.semester || 5, enr.section || 'A', enr.academicYear || '2026-2027',
          enr.status || 'ENROLLED'
        );
        count++;
      }
      return count;
    });
    return transaction(enrollmentsList);
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
      rows = db.prepare('SELECT * FROM academic_resources WHERE department LIKE ? AND year = ? ORDER BY subject_code').all(`%${department.split(' ')[0]}%`, year);
    } else if (department) {
      rows = db.prepare('SELECT * FROM academic_resources WHERE department LIKE ? ORDER BY subject_code').all(`%${department.split(' ')[0]}%`);
    } else {
      rows = db.prepare('SELECT * FROM academic_resources ORDER BY subject_code').all();
    }
    if (rows.length === 0) {
      return [
        {
          id: 'res_cs501',
          subjectCode: 'CS501',
          subjectName: 'Computer Networks',
          credits: 4,
          department: department || 'Computer Science (CSE)',
          course: 'B.E.',
          year: year || 3,
          syllabus: [
            { unit: 'Unit I', title: 'OSI Physical & Data Link Layers', topic: 'Framing, error detection, sliding window protocols.' },
            { unit: 'Unit II', title: 'Network Layer & IP Addressing', topic: 'IPv4/IPv6, subnetting, Dijkstra and Bellman-Ford routing.' },
            { unit: 'Unit III', title: 'Transport Layer & TCP Congestion', topic: 'TCP three-way handshake, flow control, sliding window.' }
          ]
        },
        {
          id: 'res_cs502',
          subjectCode: 'CS502',
          subjectName: 'Database Management Systems',
          credits: 4,
          department: department || 'Computer Science (CSE)',
          course: 'B.E.',
          year: year || 3,
          syllabus: [
            { unit: 'Unit I', title: 'Relational Model & Algebra', topic: 'ER modeling, relational calculus, SQL DDL/DML constraints.' },
            { unit: 'Unit II', title: 'Normalization & Normal Forms', topic: '1NF, 2NF, 3NF, BCNF lossless decomposition.' }
          ]
        }
      ];
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
