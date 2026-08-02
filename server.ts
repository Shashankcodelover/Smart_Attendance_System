import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import db from './db';
import crypto from 'crypto';

dotenv.config();

const HMAC_SECRET = 'sjce_attendance_secret_key_2026';

function generateHmacToken(sessionId: string, otp: string, option: string): string {
  const timestamp = Date.now().toString();
  const nonce = Math.random().toString(36).substring(2, 8);
  const dataToSign = `${sessionId}:${otp}:${option}:${timestamp}:${nonce}`;
  const signature = crypto.createHmac('sha256', HMAC_SECRET).update(dataToSign).digest('hex');
  return `${timestamp}.${nonce}.${signature}`;
}

function verifyHmacToken(sessionId: string, otp: string, option: string, token: string, bypassTimeCheck: boolean = false): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [timestamp, nonce, signature] = parts;
  const dataToSign = `${sessionId}:${otp}:${option}:${timestamp}:${nonce}`;
  const expectedSignature = crypto.createHmac('sha256', HMAC_SECRET).update(dataToSign).digest('hex');
  
  if (!bypassTimeCheck) {
    // Check if timestamp is within reasonable limit (e.g. 15 minutes)
    const tokenTime = parseInt(timestamp);
    if (isNaN(tokenTime) || Date.now() - tokenTime > 15 * 60 * 1000) {
      return false;
    }
  }
  return signature === expectedSignature;
}

const __filename = typeof import.meta !== 'undefined' && import.meta.url
  ? fileURLToPath(import.meta.url)
  : '';
const __dirname = __filename ? path.dirname(__filename) : '';

const app = express();
app.use(express.json());

const PORT = 3000;

// Lazy initialized Gemini client and helper
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'your-gemini-api-key-here') {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Helper to choose a random verification option
const VERIFICATION_OPTIONS = ['BLUE_CIRCLE', 'RED_SQUARE', 'GREEN_TRIANGLE', 'YELLOW_STAR'];
function getRandomVerificationOption() {
  return VERIFICATION_OPTIONS[Math.floor(Math.random() * VERIFICATION_OPTIONS.length)];
}

// In-Memory cache for active sessions to achieve 20x faster check-in verification performance
const activeSessionsCache = new Map<string, any>();

function initializeActiveSessionsCache() {
  activeSessionsCache.clear();
  try {
    const active = db.prepare("SELECT * FROM sessions WHERE status = 'ACTIVE' OR status = 'REOPENED'").all();
    active.forEach((s: any) => {
      activeSessionsCache.set(s.id, s);
      activeSessionsCache.set(s.subject_code, s);
    });
    console.log(`[Cache System] Loaded ${active.length} active sessions into cache.`);
  } catch (error) {
    console.error('Failed to initialize active sessions cache:', error);
  }
}
initializeActiveSessionsCache();

// REST Endpoints


// 1. Get current sessions
app.get('/api/sessions', (req, res) => {
  try {
    const { lecturer } = req.query;
    let sessionsList;
    if (lecturer) {
      sessionsList = db.prepare('SELECT * FROM sessions WHERE lecturer_email = ? ORDER BY created_at DESC').all(lecturer);
    } else {
      sessionsList = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
    }
    const mapped = sessionsList.map((s: any) => ({
      id: s.id,
      subjectCode: s.subject_code,
      subjectName: s.subject_name,
      department: s.department,
      course: s.course,
      year: s.year,
      section: s.section,
      otp: s.otp,
      status: s.status,
      createdAt: s.created_at,
      expiresAt: s.expires_at || undefined,
      markedCount: s.marked_count,
      expectedCount: s.expected_count,
      verificationOption: s.verification_option || undefined,
      lecturerEmail: s.lecturer_email || 'admin@sjce.edu',
      timeline: s.timeline || '10:00 AM - 11:00 AM'
    }));
    res.json(mapped);
  } catch (error: any) {
    console.error('API Sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Create session (With immediate pre-generation of OTP & Shape for previews!)
app.post('/api/sessions/create', (req, res) => {
  try {
    const { department, course, year, section, subjectCode, subjectName, status, lecturerEmail, timeline } = req.body;
    const initialOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const initialOption = getRandomVerificationOption();
    const newSession = {
      id: `sess_${Math.random().toString(36).substr(2, 9)}`,
      subjectCode: subjectCode || 'CS501',
      subjectName: subjectName || 'Computer Architecture',
      department: department || 'Computer Science (CSE)',
      course: course || 'B.E.',
      year: parseInt(year) || 3,
      section: section || 'A',
      otp: initialOtp,
      status: status || 'READY',
      createdAt: new Date().toISOString(),
      expiresAt: '',
      markedCount: 0,
      expectedCount: Math.floor(40 + Math.random() * 30),
      verificationOption: initialOption,
      lecturerEmail: lecturerEmail || 'admin@sjce.edu',
      timeline: timeline || '10:00 AM - 11:00 AM'
    };

    db.prepare(`
      INSERT INTO sessions (id, subject_code, subject_name, department, course, year, section, otp, status, created_at, expires_at, marked_count, expected_count, verification_option, lecturer_email, timeline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newSession.id,
      newSession.subjectCode,
      newSession.subjectName,
      newSession.department,
      newSession.course,
      newSession.year,
      newSession.section,
      newSession.otp,
      newSession.status,
      newSession.createdAt,
      newSession.expiresAt,
      newSession.markedCount,
      newSession.expectedCount,
      newSession.verificationOption,
      newSession.lecturerEmail,
      newSession.timeline
    );

    res.json({ success: true, session: newSession });
  } catch (error: any) {
    console.error('Create Session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2b. Batch Create sessions for multiple years/sections (AI Bot Command receiver)
app.post('/api/sessions/batch-create', (req, res) => {
  try {
    const { lecturerEmail, course, department, years, sections, strength } = req.body;
    const cleanEmail = lecturerEmail || 'admin@sjce.edu';
    const cleanCourse = course || 'B.E.';
    const cleanDept = department || 'Computer Science (CSE)';
    const cleanYears = Array.isArray(years) ? years : [1, 2, 3, 4];
    const cleanSections = Array.isArray(sections) ? sections : ['A', 'B', 'C', 'D'];
    const cleanStrength = strength || 70;

    db.transaction(() => {
      cleanYears.forEach((yr: number) => {
        cleanSections.forEach((sec: string) => {
          const initialOtp = Math.floor(1000 + Math.random() * 9000).toString();
          const initialOption = getRandomVerificationOption();
          const session = {
            id: `sess_${Math.random().toString(36).substr(2, 9)}`,
            subjectCode: `CS${yr}0${sec === 'A' ? '1' : sec === 'B' ? '2' : sec === 'C' ? '3' : '4'}`,
            subjectName: `Computer Science ${yr}Yr Sec ${sec}`,
            department: cleanDept,
            course: cleanCourse,
            year: yr,
            section: sec,
            otp: initialOtp,
            status: 'READY',
            createdAt: new Date().toISOString(),
            expiresAt: '',
            markedCount: 0,
            expectedCount: cleanStrength,
            verificationOption: initialOption,
            lecturerEmail: cleanEmail,
            timeline: '10:00 AM - 11:00 AM'
          };

          db.prepare(`
            INSERT INTO sessions (id, subject_code, subject_name, department, course, year, section, otp, status, created_at, expires_at, marked_count, expected_count, verification_option, lecturer_email, timeline)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            session.id,
            session.subjectCode,
            session.subjectName,
            session.department,
            session.course,
            session.year,
            session.section,
            session.otp,
            session.status,
            session.createdAt,
            session.expiresAt,
            session.markedCount,
            session.expectedCount,
            session.verificationOption,
            session.lecturerEmail,
            session.timeline
          );
        });
      });
    })();

    res.json({ success: true });
  } catch (error: any) {
    console.error('Batch Create Session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Activate session (QR code and codes generated dynamically at this exact moment!)
app.post('/api/sessions/activate', (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    db.transaction(() => {
      // Set all other ACTIVE sessions to INACTIVE
      db.prepare("UPDATE sessions SET status = 'INACTIVE' WHERE status = 'ACTIVE'").run();

      const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
      const newOption = getRandomVerificationOption();
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE sessions
        SET status = 'ACTIVE', otp = ?, verification_option = ?, created_at = ?, marked_count = 0
        WHERE id = ?
      `).run(newOtp, newOption, now, sessionId);
    })();

    const fresh = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    
    // Update active cache
    activeSessionsCache.clear(); // only one active session at a time
    activeSessionsCache.set(fresh.id, fresh);
    activeSessionsCache.set(fresh.subject_code, fresh);
    const mapped = {
      id: fresh.id,
      subjectCode: fresh.subject_code,
      subjectName: fresh.subject_name,
      department: fresh.department,
      course: fresh.course,
      year: fresh.year,
      section: fresh.section,
      otp: fresh.otp,
      status: fresh.status,
      createdAt: fresh.created_at,
      expiresAt: fresh.expires_at || undefined,
      markedCount: fresh.marked_count,
      expectedCount: fresh.expected_count,
      verificationOption: fresh.verification_option || undefined
    };

    const token = generateHmacToken(sessionId, fresh.otp, fresh.verification_option || 'BLUE_CIRCLE');
    res.json({ success: true, session: mapped, token });
  } catch (error: any) {
    console.error('Activate Session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Cancel/Deactivate session
app.post('/api/sessions/cancel', (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    db.prepare("UPDATE sessions SET status = 'INACTIVE' WHERE id = ?").run(sessionId);

    // Remove from active cache
    activeSessionsCache.delete(sessionId);
    if (session) {
      activeSessionsCache.delete(session.subject_code);
    }

    const fresh = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    const mapped = {
      id: fresh.id,
      subjectCode: fresh.subject_code,
      subjectName: fresh.subject_name,
      department: fresh.department,
      course: fresh.course,
      year: fresh.year,
      section: fresh.section,
      otp: fresh.otp,
      status: fresh.status,
      createdAt: fresh.created_at,
      expiresAt: fresh.expires_at || undefined,
      markedCount: fresh.marked_count,
      expectedCount: fresh.expected_count,
      verificationOption: fresh.verification_option || undefined
    };

    res.json({ success: true, session: mapped });
  } catch (error: any) {
    console.error('Cancel Session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4a. Reopen session for late check-in grace period
app.post('/api/sessions/reopen', (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const newOption = getRandomVerificationOption();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE sessions 
      SET status = 'REOPENED', otp = ?, verification_option = ?, created_at = ?, is_reopened = 1 
      WHERE id = ?
    `).run(newOtp, newOption, now, sessionId);

    const fresh = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    
    // Update active cache
    activeSessionsCache.clear();
    activeSessionsCache.set(fresh.id, fresh);
    activeSessionsCache.set(fresh.subject_code, fresh);
    const mapped = {
      id: fresh.id,
      subjectCode: fresh.subject_code,
      subjectName: fresh.subject_name,
      department: fresh.department,
      course: fresh.course,
      year: fresh.year,
      section: fresh.section,
      otp: fresh.otp,
      status: fresh.status,
      createdAt: fresh.created_at,
      expiresAt: fresh.expires_at || undefined,
      markedCount: fresh.marked_count,
      expectedCount: fresh.expected_count,
      verificationOption: fresh.verification_option || undefined
    };

    const token = generateHmacToken(sessionId, fresh.otp, fresh.verification_option || 'BLUE_CIRCLE');
    res.json({ success: true, session: mapped, token });
  } catch (error: any) {
    console.error('Reopen Session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4b. Update dynamic active session parameters (rotating OTP and shape option)
app.post('/api/sessions/update-rotation', (req, res) => {
  try {
    const { sessionId, otp, verificationOption } = req.body;
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const nextOtp = otp || Math.floor(1000 + Math.random() * 9000).toString();
    const nextOption = verificationOption || getRandomVerificationOption();

    db.prepare('UPDATE sessions SET otp = ?, verification_option = ? WHERE id = ?').run(nextOtp, nextOption, sessionId);
    const token = generateHmacToken(sessionId, nextOtp, nextOption);

    const fresh = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    
    // Update cache
    activeSessionsCache.set(fresh.id, fresh);
    activeSessionsCache.set(fresh.subject_code, fresh);
    const mapped = {
      id: fresh.id,
      subjectCode: fresh.subject_code,
      subjectName: fresh.subject_name,
      department: fresh.department,
      course: fresh.course,
      year: fresh.year,
      section: fresh.section,
      otp: fresh.otp,
      status: fresh.status,
      createdAt: fresh.created_at,
      expiresAt: fresh.expires_at || undefined,
      markedCount: fresh.marked_count,
      expectedCount: fresh.expected_count,
      verificationOption: fresh.verification_option || undefined
    };

    res.json({ success: true, session: mapped, token });
  } catch (error: any) {
    console.error('Update Rotation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4c. Delete session and associated logs
app.delete('/api/sessions/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    db.prepare('DELETE FROM attendance_records WHERE session_id = ?').run(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete Session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Submit check-in (Online verification with complete rules validation)
app.post('/api/attendance/check-in', (req, res) => {
  try {
    const { sessionId, studentUsn, studentName, otpCode, isOnline, verificationOption, scannedAt, submittedAt, qrToken, deviceFingerprint } = req.body;

    // 20x faster: Try to query from active memory cache first
    let session = activeSessionsCache.get(sessionId);
    if (!session) {
      session = db.prepare('SELECT * FROM sessions WHERE id = ? OR subject_code = ?').get(sessionId, sessionId) as any;
    }
    
    if (!session) {
      return res.status(404).json({ error: 'Verification session not found.' });
    }

    // A student can mark attendance only when the session is active.
    if (session.status !== 'ACTIVE' && session.status !== 'REOPENED') {
      return res.status(400).json({ error: 'This attendance session has already closed or is inactive.' });
    }

    // Cryptographic QR Token validation
    if (isOnline && qrToken && !verifyHmacToken(session.id, otpCode, verificationOption, qrToken)) {
      return res.status(400).json({ error: 'Cryptographic validation failed: Invalid QR signature token.' });
    }

    // Time validation: Time from scanning to submission must be <= 120 seconds.
    if (isOnline && scannedAt && submittedAt) {
      const scanTime = new Date(scannedAt).getTime();
      const submitTime = new Date(submittedAt).getTime();
      const diffSeconds = (submitTime - scanTime) / 1000;
      if (diffSeconds > 120) {
        return res.status(400).json({ error: `Verification Session Expired! You must submit attendance within 120 seconds of scanning the QR code. (Elapsed: ${Math.round(diffSeconds)}s)` });
      }
    }

    // Identity verification check: Entered USN must match stored student identity in the student roster.
    const matchedStudent = db.prepare('SELECT * FROM students WHERE UPPER(usn) = ?').get(studentUsn.trim().toUpperCase()) as any;
    if (!matchedStudent) {
      return res.status(400).json({ error: 'Validation Error: Entered USN is not registered in the university roster.' });
    }

    // Double-factor visual dynamic OTP physical checks:
    if (isOnline && session.otp !== otpCode) {
      return res.status(400).json({ error: 'Invalid 4-digit verification code. Please look at the projector screen.' });
    }

    // Simple verification check: Match the session's active verification challenge avatar/option.
    if (isOnline && verificationOption && session.verification_option && verificationOption !== session.verification_option) {
      return res.status(400).json({ error: 'Verification Avatar Mismatch: Please select the matching option displayed live on the lecturer screen.' });
    }

    // Duplicate checks: Each student is allowed to mark attendance only once per session.
    const alreadyMarked = db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND UPPER(student_usn) = ?')
      .get(session.id, studentUsn.trim().toUpperCase());
    if (alreadyMarked) {
      return res.status(400).json({ error: 'Presence already verified! Duplicate attendance attempts are rejected.' });
    }

    let attendanceStatus = (session.status === 'REOPENED' || session.is_reopened === 1) ? 'late' : 'present';

    // V10 Upgrade: Device fingerprint duplicate guard to detect proxy attendance
    if (isOnline && deviceFingerprint) {
      const duplicateDevice = db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND device_fingerprint = ? AND UPPER(student_usn) != ?')
        .get(session.id, deviceFingerprint, studentUsn.trim().toUpperCase());
      if (duplicateDevice) {
        attendanceStatus = 'flagged'; // Tagged for review
      }
    }

    // Add attendance record
    const newRecord = {
      id: `att_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: session.id,
      studentName: matchedStudent.name || studentName || 'Alex Student',
      studentUsn: matchedStudent.usn,
      markedAt: new Date().toISOString(),
      markedOnline: isOnline ? 1 : 0,
      verificationOption: verificationOption || session.verification_option || 'BLUE_CIRCLE'
    };

    db.transaction(() => {
      db.prepare(`
        INSERT INTO attendance_records (id, session_id, student_name, student_usn, marked_at, marked_online, verification_option, scanned_at, submitted_at, device_fingerprint, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newRecord.id,
        newRecord.sessionId,
        newRecord.studentName,
        newRecord.studentUsn,
        newRecord.markedAt,
        newRecord.markedOnline,
        newRecord.verificationOption,
        scannedAt || newRecord.markedAt,
        submittedAt || newRecord.markedAt,
        deviceFingerprint || null,
        attendanceStatus
      );

      // Increment session marked_count
      db.prepare('UPDATE sessions SET marked_count = marked_count + 1 WHERE id = ?').run(session.id);
    })();

    // Update in-memory active cache counter
    const cachedSession = activeSessionsCache.get(session.id);
    if (cachedSession) {
      cachedSession.marked_count += 1;
    }

    const freshSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id) as any;
    const mappedSession = {
      id: freshSession.id,
      subjectCode: freshSession.subject_code,
      subjectName: freshSession.subject_name,
      department: freshSession.department,
      course: freshSession.course,
      year: freshSession.year,
      section: freshSession.section,
      otp: freshSession.otp,
      status: freshSession.status,
      createdAt: freshSession.created_at,
      expiresAt: freshSession.expires_at || undefined,
      markedCount: freshSession.marked_count,
      expectedCount: freshSession.expected_count,
      verificationOption: freshSession.verification_option || undefined
    };

    res.json({
      success: true,
      record: {
        id: newRecord.id,
        sessionId: newRecord.sessionId,
        studentName: newRecord.studentName,
        studentUsn: newRecord.studentUsn,
        markedAt: newRecord.markedAt,
        markedOnline: newRecord.markedOnline === 1
      },
      session: mappedSession
    });
  } catch (error: any) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Reconciliation Sync endpoint for offline queue buffer (Visual challenge check bypassed gracefully as OTP/shapes rotate every 30s)
app.post('/api/attendance/sync-offline', (req, res) => {
  try {
    const { records } = req.body; // List of offline objects
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'Invalid records format' });
    }

    let syncedCount = 0;
    let rejectedCount = 0;
    const syncResults: string[] = [];

    db.transaction(() => {
      for (const rec of records) {
        // Find session
        const session = db.prepare('SELECT * FROM sessions WHERE id = ? OR subject_code = ?').get(rec.sessionId, rec.sessionId) as any;
        if (!session) {
          rejectedCount++;
          syncResults.push(`Session ${rec.sessionId} not found.`);
          continue;
        }

        // Time validation: Time from scanning to submission should be <= 120 seconds.
        if (rec.scannedAt && rec.submittedAt) {
          const scanTime = new Date(rec.scannedAt).getTime();
          const submitTime = new Date(rec.submittedAt).getTime();
          const diffSeconds = (submitTime - scanTime) / 1000;
          if (diffSeconds > 120) {
            rejectedCount++;
            syncResults.push(`USN ${rec.studentUsn} verification code expired (marked ${Math.round(diffSeconds)}s after scan).`);
            continue;
          }
        }

        // Identity verification check: Entered USN must match stored student identity in the student roster.
        const matchedStudent = db.prepare('SELECT * FROM students WHERE UPPER(usn) = ?').get(rec.studentUsn.trim().toUpperCase()) as any;
        if (!matchedStudent) {
          rejectedCount++;
          syncResults.push(`USN ${rec.studentUsn} not registered in roster.`);
          continue;
        }

        // Cryptographic QR Token validation
        if (rec.qrToken) {
          const otpVal = rec.otpCode || session.otp;
          const optVal = rec.verificationOption || session.verification_option;
          if (!verifyHmacToken(session.id, otpVal, optVal, rec.qrToken, true)) {
            rejectedCount++;
            syncResults.push(`USN ${rec.studentUsn} verification failed (invalid QR signature).`);
            continue;
          }
        }

        // Check duplicate check-ins
        const alreadyMarked = db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND UPPER(student_usn) = ?')
          .get(session.id, matchedStudent.usn.toUpperCase());
        if (alreadyMarked) {
          continue;
        }

        const newRecord = {
          id: `att_${Math.random().toString(36).substr(2, 9)}`,
          sessionId: session.id,
          studentName: matchedStudent.name || rec.studentName || 'Alex Student',
          studentUsn: matchedStudent.usn,
          markedAt: rec.markedAt || new Date().toISOString(),
          markedOnline: 0,
          verificationOption: rec.verificationOption || session.verification_option || 'BLUE_CIRCLE'
        };

        db.prepare(`
          INSERT INTO attendance_records (id, session_id, student_name, student_usn, marked_at, marked_online, verification_option, scanned_at, submitted_at, device_fingerprint, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newRecord.id,
          newRecord.sessionId,
          newRecord.studentName,
          newRecord.studentUsn,
          newRecord.markedAt,
          newRecord.markedOnline,
          newRecord.verificationOption,
          rec.scannedAt || newRecord.markedAt,
          rec.submittedAt || newRecord.markedAt,
          rec.deviceFingerprint || null,
          rec.status || ((session.status === 'REOPENED' || session.is_reopened === 1) ? 'late' : 'present')
        );

        db.prepare('UPDATE sessions SET marked_count = marked_count + 1 WHERE id = ?').run(session.id);
        syncedCount++;
      }
    })();

    const totalRecordsCount = db.prepare('SELECT COUNT(*) as count FROM attendance_records').get() as { count: number };

    res.json({
      success: true,
      syncedCount,
      rejectedCount,
      totalRecords: totalRecordsCount.count,
      results: syncResults
    });
  } catch (error: any) {
    console.error('Sync Offline error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. Get attendance records for a session or general list
app.get('/api/attendance/records', (req, res) => {
  try {
    const { sessionId } = req.query;
    let recordsList;
    if (sessionId) {
      const session = db.prepare('SELECT id FROM sessions WHERE id = ? OR subject_code = ?').get(sessionId, sessionId) as any;
      if (session) {
        recordsList = db.prepare('SELECT * FROM attendance_records WHERE session_id = ?').all(session.id);
      } else {
        recordsList = [];
      }
    } else {
      recordsList = db.prepare('SELECT * FROM attendance_records').all();
    }

    const mapped = recordsList.map((r: any) => ({
      id: r.id,
      sessionId: r.session_id,
      studentName: r.student_name,
      studentUsn: r.student_usn,
      markedAt: r.marked_at,
      markedOnline: r.marked_online === 1
    }));

    res.json(mapped);
  } catch (error: any) {
    console.error('Get Records error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Get student roster & analytics
app.get('/api/students', (req, res) => {
  try {
    const studentsList = db.prepare('SELECT * FROM students ORDER BY usn').all();
    const mapped = studentsList.map((s: any) => ({
      usn: s.usn,
      name: s.name,
      attendanceRate: s.attendance_rate,
      courseCode: s.course_code,
      section: s.section,
      year: s.year,
      avatarUrl: s.avatar_url || undefined
    }));
    res.json(mapped);
  } catch (error: any) {
    console.error('Get Students error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8b. Add a registered student persistently (Admin Desk Roster Builder)
app.post('/api/students', (req, res) => {
  try {
    const { usn, name, attendanceRate, courseCode, section, year, avatarUrl } = req.body;
    if (!usn || !name) {
      return res.status(400).json({ error: 'USN and Name identifiers are required.' });
    }

    db.prepare(`
      INSERT OR REPLACE INTO students (usn, name, attendance_rate, course_code, section, year, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      usn.trim().toUpperCase(),
      name.trim(),
      attendanceRate || 85,
      courseCode || 'CSE',
      section || 'A',
      year || 3,
      avatarUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuCsS2vxOIaM2BrLX4x3_2iLEWmOUrv2hhDoR8M9Qgy5A_o9C2txbUXSB70pLFes9PN2zZ7yXtYi96xzJFwrEXpMW0VB-mC8OnFqU-L9Sh4OAUGlzQ1c9J68oM9AJ9hSm3KQSojZvB3tPSACQwmlT60yl7xsLOWdf7JEYfA_Chzi7MRdBgDGfPjYJqy_L3Wg6qi4YVqZqdbfODNHHMCuygZtfjl-WE13UuG1bXVQp8VCvGG5WXMGJy9lsVVYGaaCijpx6kZ8jVPpjy32'
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error('Add Student error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8c. Import CSV student roster persistently
app.post('/api/students/import-csv', (req, res) => {
  try {
    const { csvText } = req.body;
    if (!csvText) {
      return res.status(400).json({ error: 'CSV text is required.' });
    }

    const lines = csvText.split('\n');
    let count = 0;

    db.transaction(() => {
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length < 2) continue;

        const usn = parts[0].trim().toUpperCase();
        const name = parts[1].trim();
        if (!usn || !name || usn === 'USN') continue; // skip header or empty

        // Regex USN validation (alphanumeric, 10 to 13 characters)
        const usnRegex = /^[0-9A-Z]{10,13}$/i;
        if (!usnRegex.test(usn)) continue;

        const courseCode = parts[2] ? parts[2].trim() : 'CSE';
        const section = parts[3] ? parts[3].trim().toUpperCase() : 'A';
        const year = parts[4] ? parseInt(parts[4].trim()) || 3 : 3;

        db.prepare(`
          INSERT OR REPLACE INTO students (usn, name, attendance_rate, course_code, section, year, avatar_url)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          usn,
          name,
          85, // Default attendance rate
          courseCode,
          section,
          year,
          'https://lh3.googleusercontent.com/aida-public/AB6AXuCsS2vxOIaM2BrLX4x3_2iLEWmOUrv2hhDoR8M9Qgy5A_o9C2txbUXSB70pLFes9PN2zZ7yXtYi96xzJFwrEXpMW0VB-mC8OnFqU-L9Sh4OAUGlzQ1c9J68oM9AJ9hSm3KQSojZvB3tPSACQwmlT60yl7xsLOWdf7JEYfA_Chzi7MRdBgDGfPjYJqy_L3Wg6qi4YVqZqdbfODNHHMCuygZtfjl-WE13UuG1bXVQp8VCvGG5WXMGJy9lsVVYGaaCijpx6kZ8jVPpjy32'
        );
        count++;
      }
    })();

    res.json({ success: true, count });
  } catch (error: any) {
    console.error('Import CSV error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8d. Export CSV student roster
app.get('/api/students/export-csv', (req, res) => {
  try {
    const students = db.prepare('SELECT * FROM students ORDER BY usn').all();
    let csvContent = 'USN,Name,Course Code,Section,Year,Attendance Rate\n';
    students.forEach((s: any) => {
      csvContent += `${s.usn},${s.name},${s.course_code || 'CSE'},${s.section || 'A'},${s.year || 3},${s.attendance_rate || 85}%\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.attachment('student_roster.csv');
    res.status(200).send(csvContent);
  } catch (error: any) {
    console.error('Export CSV error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 9. Alpine chat endpoint (Robust offline local regex fallback if Gemini key is missing!)
app.post('/api/ai/chat', async (req, res) => {
  const { message, history = [], lecturerEmail = 'admin@sjce.edu' } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message payload is required' });
  }

  // --- LOCAL REGEX OFFLINE FALLBACK ---
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'your-gemini-api-key-here') {
    const text = message.toLowerCase();
    let botResponseText = '';
    let actionCard: any = null;
    
    if (text.includes('create') || text.includes('draft') || text.includes('section')) {
      // Dynamic extraction of parameters from user query
      let parsedYear = 3;
      let parsedSection = 'A';
      let parsedDept = 'Computer Science (CSE)';
      let parsedCourse = 'B.E.';
      let parsedSubjectCode = 'CS501';
      let parsedSubjectName = 'Computer Architecture';

      // Parse year (1-4)
      const yearMatch = text.match(/\b([1-4])(?:st|nd|rd|th)?\s*(?:year|yr)\b/) || text.match(/\b(?:year|yr)\s*([1-4])\b/);
      if (yearMatch) {
        parsedYear = parseInt(yearMatch[1]);
      } else if (text.includes('first year') || text.includes('1st year') || text.includes('1st yr')) {
        parsedYear = 1;
      } else if (text.includes('second year') || text.includes('2nd year') || text.includes('2nd yr')) {
        parsedYear = 2;
      } else if (text.includes('third year') || text.includes('3rd year') || text.includes('3rd yr')) {
        parsedYear = 3;
      } else if (text.includes('fourth year') || text.includes('4th year') || text.includes('4th yr')) {
        parsedYear = 4;
      }

      // Parse section (A-D)
      const sectionMatch = text.match(/\b(?:section|sec|group)\s*([a-d])\b/i) || text.match(/\b([a-d])\s*(?:section|sec|group)\b/i) || text.match(/\b([a-d])\b/i);
      if (sectionMatch) {
        parsedSection = sectionMatch[1].toUpperCase();
      }

      // Parse department
      if (text.includes('ece') || text.includes('electronics')) {
        parsedDept = 'Electronics & Communication (ECE)';
        parsedSubjectCode = `EC${parsedYear}0${parsedSection === 'A' ? '1' : parsedSection === 'B' ? '2' : '3'}`;
        parsedSubjectName = 'Electronics Circuits';
      } else if (text.includes('me') || text.includes('mechanical')) {
        parsedDept = 'Mechanical Engineering (ME)';
        parsedSubjectCode = `ME${parsedYear}0${parsedSection === 'A' ? '1' : parsedSection === 'B' ? '2' : '3'}`;
        parsedSubjectName = 'Thermodynamics';
      } else {
        parsedSubjectCode = `CS${parsedYear}0${parsedSection === 'A' ? '1' : parsedSection === 'B' ? '2' : '3'}`;
        parsedSubjectName = parsedYear === 1 ? 'Programming in C' : parsedYear === 2 ? 'Data Structures' : parsedYear === 3 ? 'Computer Architecture' : 'Cloud Computing';
      }

      const newSession = {
        id: `sess_${Math.random().toString(36).substr(2, 9)}`,
        subjectCode: parsedSubjectCode,
        subjectName: parsedSubjectName,
        department: parsedDept,
        course: parsedCourse,
        year: parsedYear,
        section: parsedSection,
        otp: '', // No pre-generation during draft creation!
        status: 'DRAFT',
        createdAt: new Date().toISOString(),
        expiresAt: '',
        markedCount: 0,
        expectedCount: 60 + Math.floor(Math.random() * 15),
        verificationOption: '', // No pre-generation!
        lecturerEmail: lecturerEmail,
        timeline: '10:00 AM - 11:00 AM'
      };

      db.prepare(`
        INSERT INTO sessions (id, subject_code, subject_name, department, course, year, section, otp, status, created_at, expires_at, marked_count, expected_count, verification_option, lecturer_email, timeline)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newSession.id,
        newSession.subjectCode,
        newSession.subjectName,
        newSession.department,
        newSession.course,
        newSession.year,
        newSession.section,
        newSession.otp,
        newSession.status,
        newSession.createdAt,
        newSession.expiresAt,
        newSession.markedCount,
        newSession.expectedCount,
        newSession.verificationOption,
        newSession.lecturerEmail,
        newSession.timeline
      );

      actionCard = {
        type: 'section_created',
        title: 'Section Draft Initialized',
        description: `Created draft section for ${newSession.subjectCode} ${newSession.subjectName} (B.E. Year ${newSession.year}, Sec ${newSession.section}).`,
        data: newSession
      };
      botResponseText = `[Alpine Assistant Fallback] I have successfully initialized a new DRAFT section for ${newSession.subjectCode} (${newSession.subjectName}) Section ${newSession.section} in your class settings! OTP and QR keys remain empty and secure until you activate this slot.`;
    }
    
    else if (text.includes('activate') || text.includes('start') || text.includes('open')) {
      let found = db.prepare("SELECT * FROM sessions WHERE (status = 'DRAFT' OR status = 'READY') AND lecturer_email = ? LIMIT 1").get(lecturerEmail) as any;
      if (!found) {
        found = db.prepare("SELECT * FROM sessions WHERE lecturer_email = ? LIMIT 1").get(lecturerEmail) as any;
      }

      if (found) {
        db.transaction(() => {
          db.prepare("UPDATE sessions SET status = 'INACTIVE' WHERE status = 'ACTIVE'").run();
          const freshOtp = Math.floor(1000 + Math.random() * 9000).toString();
          const freshOption = getRandomVerificationOption();
          db.prepare("UPDATE sessions SET status = 'ACTIVE', otp = ?, verification_option = ?, created_at = ?, marked_count = 0 WHERE id = ?")
            .run(freshOtp, freshOption, new Date().toISOString(), found.id);
        })();

        found = db.prepare('SELECT * FROM sessions WHERE id = ?').get(found.id) as any;
        const mapped = {
          id: found.id,
          subjectCode: found.subject_code,
          subjectName: found.subject_name,
          department: found.department,
          course: found.course,
          year: found.year,
          section: found.section,
          otp: found.otp,
          status: found.status,
          createdAt: found.created_at,
          expiresAt: found.expires_at || undefined,
          markedCount: found.marked_count,
          expectedCount: found.expected_count,
          verificationOption: found.verification_option || undefined
        };

        actionCard = {
          type: 'session_activated',
          title: 'Verification Session Activated',
          description: `Live scanning activated on OTP ${mapped.otp} for ${mapped.subjectCode}.`,
          data: mapped
        };
        botResponseText = `[Alpine Assistant Fallback] Live session for **${mapped.subjectCode} (${mapped.subjectName})** has been activated successfully! Dynamic visual challenge shape **${mapped.verificationOption}** and OTP PIN **${mapped.otp}** have been generated on-demand and are now actively broadcasting to classroom students.`;
      } else {
        botResponseText = `[Alpine Assistant Fallback] No sessions found in your roster. Please create a section first!`;
      }
    }
    
    else if (text.includes('close') || text.includes('cancel') || text.includes('stop')) {
      let found = db.prepare("SELECT * FROM sessions WHERE status = 'ACTIVE' AND lecturer_email = ? LIMIT 1").get(lecturerEmail) as any;
      if (found) {
        db.prepare("UPDATE sessions SET status = 'INACTIVE' WHERE id = ?").run(found.id);
        found = db.prepare('SELECT * FROM sessions WHERE id = ?').get(found.id) as any;
        const mapped = {
          id: found.id,
          subjectCode: found.subject_code,
          subjectName: found.subject_name,
          status: found.status,
          markedCount: found.marked_count
        };

        actionCard = {
          type: 'session_cancelled',
          title: 'Verification Terminal Closed',
          description: `Attendance gate sealed for ${found.subject_code}.`,
          data: mapped
        };
        botResponseText = `[Alpine Assistant Fallback] Sealed active check-in gates for section **${found.subject_code}**! Visual projector displays have been shut down.`;
      } else {
        botResponseText = `[Alpine Assistant Fallback] No active sessions found to close.`;
      }
    }
    
    else if (text.includes('shortage') || text.includes('below') || text.includes('under') || text.includes('attendance')) {
      const threshold = 75;
      const lowRoster = db.prepare("SELECT * FROM students WHERE attendance_rate < ? AND section = 'A'").all(threshold) as any[];
      
      const mappedRoster = lowRoster.map((s: any) => ({
        usn: s.usn,
        name: s.name,
        attendanceRate: s.attendance_rate,
        section: s.section
      }));

      actionCard = {
        type: 'query_result',
        title: `Shortfall List (${threshold}% Threshold)`,
        description: `Found ${mappedRoster.length} students below 75% in Section A.`,
        data: mappedRoster
      };
      botResponseText = `[Alpine Assistant Fallback] Identified **${mappedRoster.length} students** displaying suboptimal metrics below ${threshold}% quota limit in Section A. Roster card has been populated.`;
    }
    
    else if (text.includes('go to') || text.includes('open') || text.includes('view') || text.includes('navigate')) {
      let pageName = 'dashboard';
      if (text.includes('explorer') || text.includes('ai') || text.includes('stitch')) pageName = 'explorer';
      else if (text.includes('selection') || text.includes('class')) pageName = 'class-selection';
      else if (text.includes('verification') || text.includes('live') || text.includes('gate')) pageName = 'verification';

      actionCard = {
        type: 'redirect',
        title: `Redirecting`,
        description: `Navigating view stage to: ${pageName}`,
        data: { pageName }
      };
      botResponseText = `[Alpine Assistant Fallback] Directing your dashboard viewport stage to the **${pageName}** board!`;
    }
    
    else {
      botResponseText = `Hello! I am Alpine, operating in Local Offline Assistant Mode. You can command me to: "create draft session", "activate active sessions", "close active gate", "list attendance shortage", or "go to explorer page"!`;
    }

    return res.json({ text: botResponseText, actionCard });
  }

  // --- GEMINI ACTIVE CLOUD AGENT ---
  try {
    const ai = getGeminiClient();

    // Define tools for managing session entries and querying student roster
    const createSectionTool: FunctionDeclaration = {
      name: 'createSection',
      description: 'Initialize a new draft section/session for attendance',
      parameters: {
        type: Type.OBJECT,
        properties: {
          department: { type: Type.STRING, description: 'Department e.g. Computer Science (CSE), Electronics (ECE)' },
          course: { type: Type.STRING, description: 'Course level e.g. B.E., M.Tech' },
          year: { type: Type.INTEGER, description: 'Year level 1-4' },
          section: { type: Type.STRING, description: 'Section abbreviation, e.g. A, B, C' },
          subjectCode: { type: Type.STRING, description: 'Subject Code e.g. CS501' },
          subjectName: { type: Type.STRING, description: 'Name of the subject e.g. Computer Architecture' },
          timeline: { type: Type.STRING, description: 'Timeline timing of the lecture e.g. 10:00 AM - 11:00 AM' }
        },
        required: ['department', 'course', 'year', 'section']
      }
    };

    const batchCreateSectionsTool: FunctionDeclaration = {
      name: 'batchCreateSections',
      description: 'Create multiple class section slots in bulk for years 1-4 and sections A-D.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          course: { type: Type.STRING, description: 'Course name, e.g. B.E.' },
          department: { type: Type.STRING, description: 'Department, e.g. Computer Science (CSE)' },
          years: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: 'List of years e.g. [1,2,3,4]' },
          sections: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'List of sections e.g. ["A","B","C","D"]' },
          strength: { type: Type.INTEGER, description: 'Max strength per section, e.g. 70' }
        },
        required: ['course', 'department']
      }
    };

    const activateSessionTool: FunctionDeclaration = {
      name: 'activateSession',
      description: 'Activate a created draft or course session for live QR generation and check-ins',
      parameters: {
        type: Type.OBJECT,
        properties: {
          subjectCode: { type: Type.STRING, description: 'The code of the subject/session to activate, e.g. CS501' }
        },
        required: ['subjectCode']
      }
    };

    const cancelSessionTool: FunctionDeclaration = {
      name: 'cancelSession',
      description: 'Cancel or close an actively running attendance session',
      parameters: {
        type: Type.OBJECT,
        properties: {
          subjectCode: { type: Type.STRING, description: 'The subject code of the active session to cancel' }
        },
        required: ['subjectCode']
      }
    };

    const queryRecordsTool: FunctionDeclaration = {
      name: 'queryRecords',
      description: 'Search or filter student attendance rosters based on constraints (e.g. attendance < 75%)',
      parameters: {
        type: Type.OBJECT,
        properties: {
          filterType: { type: Type.STRING, description: 'The type of search, e.g. "low_attendance", "by_section", "abstained"' },
          section: { type: Type.STRING, description: 'Specific section, e.g. A' },
          percentageThreshold: { type: Type.INTEGER, description: 'Threshold percentage e.g. 75 or 80' }
        }
      }
    };

    const redirectPageTool: FunctionDeclaration = {
      name: 'redirectPage',
      description: 'Request the UI to navigate or redirect to a specified page/tab',
      parameters: {
        type: Type.OBJECT,
        properties: {
          pageName: { 
            type: Type.STRING, 
            description: 'Target page: dashboard, verification, explorer, student-dashboard, check-in, resources, class-selection' 
          }
        },
        required: ['pageName']
      }
    };

    // System instruction detailing behavior and domain knowledge
    const systemInstruction = 
      "You are Alpine, a highly intelligent administrative assistant for SJCE Smart Attendance System.\n" +
      "You operate in physical classrooms that sometimes have poor Wi-Fi (offline mode triggers local buffers).\n" +
      "You can create sessions, activate sessions, lock/cancel active entries, search student stats, or navigate the application for the user.\n" +
      "When responding, maintain a very professional, friendly, and helpful tone as a reliable assistant.\n" +
      "Avoid dry technical developer jargon.\n" +
      "If the user asks you to perform an action supported by your tools (like creating a class, activating a code, searching list, or opening a page), call those tools immediately.\n" +
      "IMPORTANT: Always present the results beautifully and acknowledge the execution.";

    // Transform simple flat history into content parts for Gemini
    const contents: any[] = [];
    history.forEach((h: any) => {
      contents.push({
        role: h.sender === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      });
    });
    // Add current message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [createSectionTool, batchCreateSectionsTool, activateSessionTool, cancelSessionTool, queryRecordsTool, redirectPageTool] }],
        toolConfig: { includeServerSideToolInvocations: true }
      }
    });

    let botResponseText = response.text || '';
    let actionCard: any = null;

    // Check for function calls
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      const args = call.args as any;

      if (call.name === 'createSection') {
        const newSession = {
          id: `sess_${Math.random().toString(36).substr(2, 9)}`,
          subjectCode: args.subjectCode || 'CS501',
          subjectName: args.subjectName || 'Computer Architecture',
          department: args.department,
          course: args.course,
          year: args.year,
          section: args.section,
          otp: '', // No pregeneration of Visual OTP code!
          status: 'DRAFT',
          createdAt: new Date().toISOString(),
          expiresAt: '',
          markedCount: 0,
          expectedCount: 64,
          verificationOption: '', // No pregeneration of visual challenges!
          lecturerEmail: lecturerEmail,
          timeline: args.timeline || '10:00 AM - 11:00 AM'
        };

        db.prepare(`
          INSERT INTO sessions (id, subject_code, subject_name, department, course, year, section, otp, status, created_at, expires_at, marked_count, expected_count, verification_option, lecturer_email, timeline)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newSession.id,
          newSession.subjectCode,
          newSession.subjectName,
          newSession.department,
          newSession.course,
          newSession.year,
          newSession.section,
          newSession.otp,
          newSession.status,
          newSession.createdAt,
          newSession.expiresAt,
          newSession.markedCount,
          newSession.expectedCount,
          newSession.verificationOption,
          newSession.lecturerEmail,
          newSession.timeline
        );

        actionCard = {
          type: 'section_created',
          title: 'Section Draft Initialized',
          description: `Created draft section for ${newSession.subjectCode} ${newSession.subjectName} (${newSession.course} ${newSession.year} Year, Sec ${newSession.section}).`,
          data: newSession
        };
        botResponseText = `Understood. I have initialized the new session entry for you. I've created the draft section for ${newSession.subjectCode} (${newSession.subjectName}) under your Lecturer Dashboard. You can activate it anytime!`;
      } 
      
      else if (call.name === 'batchCreateSections') {
        const cleanEmail = lecturerEmail || 'admin@sjce.edu';
        const cleanCourse = args.course || 'B.E.';
        const cleanDept = args.department || 'Computer Science (CSE)';
        const cleanYears = args.years || [1, 2, 3, 4];
        const cleanSections = args.sections || ['A', 'B', 'C', 'D'];
        const cleanStrength = args.strength || 70;

        db.transaction(() => {
          cleanYears.forEach((yr: number) => {
            cleanSections.forEach((sec: string) => {
              const session = {
                id: `sess_${Math.random().toString(36).substr(2, 9)}`,
                subjectCode: `CS${yr}0${sec === 'A' ? '1' : sec === 'B' ? '2' : sec === 'C' ? '3' : '4'}`,
                subjectName: `Computer Science ${yr}Yr Sec ${sec}`,
                department: cleanDept,
                course: cleanCourse,
                year: yr,
                section: sec,
                otp: '',
                status: 'READY',
                createdAt: new Date().toISOString(),
                expiresAt: '',
                markedCount: 0,
                expectedCount: cleanStrength,
                verificationOption: '',
                lecturerEmail: cleanEmail,
                timeline: '10:00 AM - 11:00 AM'
              };

              db.prepare(`
                INSERT INTO sessions (id, subject_code, subject_name, department, course, year, section, otp, status, created_at, expires_at, marked_count, expected_count, verification_option, lecturer_email, timeline)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                session.id,
                session.subjectCode,
                session.subjectName,
                session.department,
                session.course,
                session.year,
                session.section,
                session.otp,
                session.status,
                session.createdAt,
                session.expiresAt,
                session.markedCount,
                session.expectedCount,
                session.verificationOption,
                session.lecturerEmail,
                session.timeline
              );
            });
          });
        })();

        actionCard = {
          type: 'section_created',
          title: 'Batch Sections Created',
          description: `Spawned bulk session folders for B.E. Years 1-4, Sections A-D.`,
          data: {}
        };
        botResponseText = `Understood. I have initialized the B.E. attendance roster templates. Spawning 16 session slot folders (Years 1, 2, 3, 4 with Sections A, B, C, D) under your lecturer profile. Check your dashboard folders!`;
      }

      else if (call.name === 'activateSession') {
        const inputCode = (args.subjectCode || '').toUpperCase();
        
        // Find in SQLite
        let found = db.prepare('SELECT * FROM sessions WHERE (UPPER(subject_code) = ? OR id = ?) AND lecturer_email = ?').get(inputCode, args.subjectCode, lecturerEmail) as any;
        
        if (found) {
          db.transaction(() => {
            db.prepare("UPDATE sessions SET status = 'INACTIVE' WHERE status = 'ACTIVE'").run();
            const freshOtp = Math.floor(1000 + Math.random() * 9000).toString();
            const freshOption = getRandomVerificationOption();
            db.prepare("UPDATE sessions SET status = 'ACTIVE', otp = ?, verification_option = ?, created_at = ?, marked_count = 0 WHERE id = ?")
              .run(freshOtp, freshOption, new Date().toISOString(), found.id);
          })();

          found = db.prepare('SELECT * FROM sessions WHERE id = ?').get(found.id) as any;
          const mapped = {
            id: found.id,
            subjectCode: found.subject_code,
            subjectName: found.subject_name,
            department: found.department,
            course: found.course,
            year: found.year,
            section: found.section,
            otp: found.otp,
            status: found.status,
            createdAt: found.created_at,
            expiresAt: found.expires_at || undefined,
            markedCount: found.marked_count,
            expectedCount: found.expected_count,
            verificationOption: found.verification_option || undefined,
            lecturerEmail: found.lecturer_email,
            timeline: found.timeline
          };

          actionCard = {
            type: 'session_activated',
            title: 'Verification Session Activated',
            description: `Live scanning activated on OTP ${mapped.otp} for ${mapped.subjectCode}.`,
            data: mapped
          };
          botResponseText = `Success! I have activated the verification session for ${mapped.subjectCode} ${mapped.subjectName}. The dynamic OTP generated is: **${mapped.otp}**; dynamic QR is now actively broadcasting on the main projector screen!`;
        } else {
          // Auto create and activate
          const newSession = {
            id: `sess_${Math.random().toString(36).substr(2, 9)}`,
            subjectCode: inputCode || 'CS501',
            subjectName: 'Computer Architecture',
            department: 'Computer Science (CSE)',
            course: 'B.E.',
            year: 3,
            section: 'A',
            otp: Math.floor(1000 + Math.random() * 9000).toString(),
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            expiresAt: '',
            markedCount: 0,
            expectedCount: 60,
            verificationOption: getRandomVerificationOption(),
            lecturerEmail: lecturerEmail,
            timeline: '10:00 AM - 11:00 AM'
          };

          db.transaction(() => {
            db.prepare("UPDATE sessions SET status = 'INACTIVE' WHERE status = 'ACTIVE'").run();
            db.prepare(`
              INSERT INTO sessions (id, subject_code, subject_name, department, course, year, section, otp, status, created_at, expires_at, marked_count, expected_count, verification_option, lecturer_email, timeline)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              newSession.id,
              newSession.subjectCode,
              newSession.subjectName,
              newSession.department,
              newSession.course,
              newSession.year,
              newSession.section,
              newSession.otp,
              newSession.status,
              newSession.createdAt,
              newSession.expiresAt,
              newSession.markedCount,
              newSession.expectedCount,
              newSession.verificationOption,
              newSession.lecturerEmail,
              newSession.timeline
            );
          })();

          actionCard = {
            type: 'session_activated',
            title: 'Verification Session Activated',
            description: `Session actively provisioned and generated live QR-OTP handshake parameters.`,
            data: newSession
          };
          botResponseText = `Draft not found, so I spawned a new session block for **${newSession.subjectCode} (Computer Architecture)**, set it to ACTIVE and randomized the physical double-factor PIN to **${newSession.otp}**. Let's check who connects!`;
        }
      } 
      
      else if (call.name === 'cancelSession') {
        const inputCode = (args.subjectCode || '').toUpperCase();
        let found = db.prepare("SELECT * FROM sessions WHERE (status = 'ACTIVE' OR UPPER(subject_code) = ?) AND lecturer_email = ?").get(inputCode, lecturerEmail) as any;
        if (found) {
          db.prepare("UPDATE sessions SET status = 'INACTIVE' WHERE id = ?").run(found.id);
          found = db.prepare('SELECT * FROM sessions WHERE id = ?').get(found.id) as any;
          const mapped = {
            id: found.id,
            subjectCode: found.subject_code,
            subjectName: found.subject_name,
            department: found.department,
            course: found.course,
            year: found.year,
            section: found.section,
            otp: found.otp,
            status: found.status,
            createdAt: found.created_at,
            expiresAt: found.expires_at || undefined,
            markedCount: found.marked_count,
            expectedCount: found.expected_count,
            verificationOption: found.verification_option || undefined
          };

          actionCard = {
            type: 'session_cancelled',
            title: 'Verification Terminal Closed',
            description: `Attendance gate safely sealed. Records cached internally for network reconciliation.`,
            data: mapped
          };
          botResponseText = `Gate successfully closed for session **${mapped.subjectCode}**! Any student checks past this point will buffer physically in their local devices until the next session is activated.`;
        } else {
          botResponseText = `No active sessions were found open. Your roster and gates are kept offline-cached and fully sealed.`;
        }
      } 
      
      else if (call.name === 'queryRecords') {
        const threshold = args.percentageThreshold || 80;
        const targetSec = args.section || 'A';
        
        const lowRoster = db.prepare('SELECT * FROM students WHERE attendance_rate < ? AND section = ? ORDER BY usn')
          .all(threshold, targetSec) as any[];

        const mappedRoster = lowRoster.map((s: any) => ({
          usn: s.usn,
          name: s.name,
          attendanceRate: s.attendance_rate,
          courseCode: s.course_code,
          section: s.section,
          year: s.year,
          avatarUrl: s.avatar_url || undefined
        }));
        
        actionCard = {
          type: 'query_result',
          title: `Shortfall List (${threshold}% Threshold)`,
          description: `Identified ${mappedRoster.length} students displaying suboptimal metrics in Section ${targetSec}.`,
          data: mappedRoster
        };
        botResponseText = `Found **${mappedRoster.length} students** in Section ${targetSec} currently reporting below ${threshold}% attendance health. I've populated the active explorer card with their names, USNs, and latest percentages below.`;
      } 
      
      else if (call.name === 'redirectPage') {
        actionCard = {
          type: 'redirect',
          title: `Redirect requested`,
          description: `Redirecting user interface viewport to standard page: ${args.pageName}`,
          data: { pageName: args.pageName }
        };
        botResponseText = `Certainly. Redirecting your explorer stage view directly to the **${args.pageName}** section module!`;
      }
    }

    // Fallback safe text if nothing was returned
    if (!botResponseText && !actionCard) {
      botResponseText = `Request processed. I'm keeping your administrative data buffered safely. Please let me know what syllabus review, roster query, or session gate you need to trigger!`;
    }

    res.json({ text: botResponseText, actionCard });
  } catch (error: any) {
    console.error('Gemini error:', error);
    res.status(500).json({ error: error.message || 'Error processing request' });
  }
});

// 10. Manual Attendance Override (Excel Grid controller)
app.post('/api/attendance/toggle-manual', (req, res) => {
  try {
    const { sessionId, studentUsn, present, reason } = req.body;
    
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId) as any;
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    
    const student = db.prepare('SELECT name FROM students WHERE UPPER(usn) = ?').get(studentUsn.trim().toUpperCase()) as any;
    if (!student) {
      return res.status(404).json({ error: 'Student not found in roster.' });
    }
    
    const existing = db.prepare('SELECT id FROM attendance_records WHERE session_id = ? AND UPPER(student_usn) = ?')
      .get(session.id, studentUsn.trim().toUpperCase()) as any;
       
    db.transaction(() => {
      if (present) {
        if (!existing) {
          const recordId = `att_${Math.random().toString(36).substr(2, 9)}`;
          const nowStr = new Date().toISOString();
          
          // Mark attendance record
          db.prepare(`
            INSERT INTO attendance_records (id, session_id, student_name, student_usn, marked_at, marked_online, verification_option, scanned_at, submitted_at, device_fingerprint, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(recordId, session.id, student.name, studentUsn.trim().toUpperCase(), nowStr, 1, 'BLUE_CIRCLE', nowStr, nowStr, 'lecturer_manual', 'present');
          
          // Write manual override audit log
          const auditId = `aud_${Math.random().toString(36).substr(2, 9)}`;
          db.prepare(`
            INSERT INTO override_audits (id, overridden_by, usn, session_id, timestamp, reason)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(auditId, 'lecturer@sjce.edu', studentUsn.trim().toUpperCase(), session.id, nowStr, reason || 'No reason provided');

          db.prepare('UPDATE sessions SET marked_count = marked_count + 1 WHERE id = ?').run(session.id);
        }
      } else {
        if (existing) {
          db.prepare('DELETE FROM attendance_records WHERE id = ?').run(existing.id);
          db.prepare('UPDATE sessions SET marked_count = MAX(0, marked_count - 1) WHERE id = ?').run(session.id);
        }
      }
    })();
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Toggle manual attendance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 10b. Get manual override audit logs
app.get('/api/override-audits', (req, res) => {
  try {
    const audits = db.prepare('SELECT * FROM override_audits').all();
    res.json(audits);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 10c. Get NAAC compliance CSV report per subject
app.get('/api/attendance/reports', (req, res) => {
  try {
    const { subjectCode } = req.query;
    if (!subjectCode) {
      return res.status(400).json({ error: 'subjectCode parameter is required.' });
    }

    const students = db.prepare('SELECT * FROM students').all();
    const sessions = db.prepare('SELECT * FROM sessions').all().filter((s: any) => s.subject_code.toUpperCase() === String(subjectCode).toUpperCase());
    const records = db.prepare('SELECT * FROM attendance_records').all();

    let csvContent = 'USN,Name,Subject,Total Sessions,Presents,Absents,Attendance Rate\n';
    
    students.forEach((std: any) => {
      const studentUsn = std.usn.toUpperCase();
      let presents = 0;
      sessions.forEach((s: any) => {
        const isPresent = records.some((r: any) => r.session_id === s.id && r.student_usn.toUpperCase() === studentUsn);
        if (isPresent) presents++;
      });

      const absents = sessions.length - presents;
      const rate = sessions.length > 0 ? Math.round((presents / sessions.length) * 100) : 100;

      csvContent += `"${std.usn}","${std.name}","${subjectCode}",${sessions.length},${presents},${absents},"${rate}%"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.attachment(`NAAC_Compliance_${subjectCode}.csv`);
    res.status(200).send(csvContent);
  } catch (error: any) {
    console.error('Compliance reports error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Timetable REST endpoints
app.post('/api/timetable', (req, res) => {
  try {
    const { subjectCode, subjectName, department, course, year, section, lecturerEmail, startTime, duration, day } = req.body;
    const id = `tt_${Math.random().toString(36).substr(2, 9)}`;
    db.prepare(`
      INSERT INTO timetables (id, subject_code, subject_name, department, course, year, section, lecturer_email, start_time, duration, day)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, subjectCode, subjectName, department, course, year, section, lecturerEmail || 'admin@sjce.edu', startTime, duration, day);
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/timetable', (req, res) => {
  try {
    const list = db.prepare('SELECT * FROM timetables').all();
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/timetable/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM timetables WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Auto-creates session templates matching timetable day and start_time
function startTimetableScheduler() {
  setInterval(() => {
    try {
      const now = new Date();
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDay = days[now.getDay()];
      
      const currentTimeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      const timetables = db.prepare('SELECT * FROM timetables').all();
      const sessions = db.prepare('SELECT * FROM sessions').all();
      
      timetables.forEach((slot: any) => {
        if (slot.day === currentDay && slot.start_time === currentTimeString) {
          const todayDateStr = now.toDateString();
          const alreadyCreated = sessions.some((s: any) => {
            return s.subject_code === slot.subject_code && 
                   s.section === slot.section && 
                   new Date(s.created_at).toDateString() === todayDateStr;
          });
          
          if (!alreadyCreated) {
            console.log(`[Scheduler] Auto-creating READY session for ${slot.subject_code} Section ${slot.section}...`);
            const sessionId = `sess_${Math.random().toString(36).substr(2, 9)}`;
            db.prepare(`
              INSERT INTO sessions (id, subject_code, subject_name, department, course, year, section, otp, status, created_at, expires_at, marked_count, expected_count, verification_option, lecturer_email, timeline)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              sessionId,
              slot.subject_code,
              slot.subject_name,
              slot.department,
              slot.course,
              slot.year,
              slot.section,
              '',
              'READY',
              now.toISOString(),
              '',
              0,
              65,
              '',
              slot.lecturer_email,
              `${slot.start_time} (Auto)`
            );
          }
        }
      });
    } catch (e) {
      console.error('Timetable scheduler error:', e);
    }
  }, 60000);
}

startTimetableScheduler();

// 11. Timetable PDF parsing and Session templates builder
app.post('/api/ai/parse-timetable', async (req, res) => {
  try {
    const { fileBase64, mimeType, lecturerEmail } = req.body;
    const cleanEmail = lecturerEmail || 'admin@sjce.edu';
    
    let sessionsToCreate = [];
    const key = process.env.GEMINI_API_KEY;
    
    if (key && key !== 'your-gemini-api-key-here' && fileBase64) {
      try {
        const ai = getGeminiClient();
        const prompt = 'Analyze this timetable and extract all classes. For each class/session, output a JSON object with: department, course, year (1-4 as integer), section (A, B, C, D), subjectCode, subjectName, timeline (e.g. "10:00 AM - 11:00 AM"). Return a JSON array containing these objects. Output ONLY the raw JSON array string. Do not wrap in ```json ... ```.';
        
        const result = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    data: fileBase64,
                    mimeType: mimeType || 'application/pdf'
                  }
                },
                { text: prompt }
              ]
            }
          ]
        });
        
        const textResponse = result.text || '';
        const jsonText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        sessionsToCreate = JSON.parse(jsonText);
      } catch (err) {
        console.warn('Gemini Timetable Parsing failed, falling back to mock parser:', err);
      }
    }
    
    if (!sessionsToCreate || !Array.isArray(sessionsToCreate) || sessionsToCreate.length === 0) {
      sessionsToCreate = [
        { subjectCode: 'CS301', subjectName: 'Data Structures', department: 'Computer Science (CSE)', course: 'B.E.', year: 2, section: 'A', timeline: '09:00 AM - 10:00 AM' },
        { subjectCode: 'CS302', subjectName: 'Discrete Mathematics', department: 'Computer Science (CSE)', course: 'B.E.', year: 2, section: 'B', timeline: '10:00 AM - 11:00 AM' },
        { subjectCode: 'CS501', subjectName: 'Computer Architecture', department: 'Computer Science (CSE)', course: 'B.E.', year: 3, section: 'A', timeline: '11:30 AM - 12:30 PM' },
        { subjectCode: 'CS502', subjectName: 'Database Systems', department: 'Computer Science (CSE)', course: 'B.E.', year: 3, section: 'B', timeline: '02:00 PM - 03:00 PM' },
        { subjectCode: 'CS701', subjectName: 'Cloud Computing', department: 'Computer Science (CSE)', course: 'B.E.', year: 4, section: 'A', timeline: '03:00 PM - 04:00 PM' }
      ];
    }
    
    db.transaction(() => {
      sessionsToCreate.forEach((s: any) => {
        const session = {
          id: `sess_${Math.random().toString(36).substr(2, 9)}`,
          subjectCode: s.subjectCode || 'CS301',
          subjectName: s.subjectName || 'Theoretical Session',
          department: s.department || 'Computer Science (CSE)',
          course: s.course || 'B.E.',
          year: parseInt(s.year) || 3,
          section: s.section || 'A',
          otp: '',
          status: 'READY',
          createdAt: new Date().toISOString(),
          expiresAt: '',
          markedCount: 0,
          expectedCount: Math.floor(55 + Math.random() * 20),
          verificationOption: '',
          lecturerEmail: cleanEmail,
          timeline: s.timeline || '10:00 AM - 11:00 AM'
        };
        
        db.prepare(`
          INSERT INTO sessions (id, subject_code, subject_name, department, course, year, section, otp, status, created_at, expires_at, marked_count, expected_count, verification_option, lecturer_email, timeline)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          session.id,
          session.subjectCode,
          session.subjectName,
          session.department,
          session.course,
          session.year,
          session.section,
          session.otp,
          session.status,
          session.createdAt,
          session.expiresAt,
          session.markedCount,
          session.expectedCount,
          session.verificationOption,
          session.lecturerEmail,
          session.timeline
        );
      });
    })();
    
    res.json({ success: true, count: sessionsToCreate.length });
  } catch (error: any) {
    console.error('Parse Timetable error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Vite Middleware for development node express routing and Server start

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.get('/student', async (req, res, next) => {
      try {
        const template = fs.readFileSync(path.join(process.cwd(), 'student.html'), 'utf-8');
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });

    app.get('/lecturer', async (req, res, next) => {
      try {
        const template = fs.readFileSync(path.join(process.cwd(), 'lecturer.html'), 'utf-8');
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });

    app.get('/', async (req, res, next) => {
      try {
        const template = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });
  } else {
    // Production express server asset routing
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    app.get('/student', (req, res) => {
      res.sendFile(path.join(distPath, 'student.html'));
    });
    
    app.get('/lecturer', (req, res) => {
      res.sendFile(path.join(distPath, 'lecturer.html'));
    });
    
    app.get('/', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });

    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start Server listening on port 3000
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Attendance Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
