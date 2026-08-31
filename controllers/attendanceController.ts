import { Request, Response } from 'express';
import db, { dao } from '../db-sqlite';

export function submitCheckIn(
  req: Request,
  res: Response,
  activeSessionsCache: Map<string, any>,
  verifyHmacToken: (id: string, otp: string, option: string, token: string) => boolean
) {
  try {
    const { sessionId, studentUsn, studentName, otpCode, isOnline, verificationOption, scannedAt, submittedAt, qrToken, deviceFingerprint } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Session ID is required.' });
    }
    if (!studentUsn || typeof studentUsn !== 'string' || studentUsn.trim().length === 0) {
      return res.status(400).json({ error: 'Student USN is required.' });
    }

    let session = activeSessionsCache.get(sessionId);
    if (!session) {
      session = db.prepare('SELECT * FROM sessions WHERE id = ? OR subject_code = ?').get(sessionId, sessionId) as any;
    }
    
    if (!session) {
      return res.status(404).json({ error: 'Verification session not found.' });
    }

    if (session.status !== 'ACTIVE' && session.status !== 'REOPENED') {
      return res.status(400).json({ error: 'This attendance session has already closed or is inactive.' });
    }

    if (isOnline && qrToken && !verifyHmacToken(session.id, otpCode, verificationOption, qrToken)) {
      return res.status(400).json({ error: 'Cryptographic validation failed: Invalid QR signature token.' });
    }

    if (isOnline && scannedAt && submittedAt) {
      const scanTime = new Date(scannedAt).getTime();
      const submitTime = new Date(submittedAt).getTime();
      const diffSeconds = (submitTime - scanTime) / 1000;
      if (diffSeconds > 120) {
        return res.status(400).json({ error: `Verification Session Expired! You must submit attendance within 120 seconds of scanning the QR code. (Elapsed: ${Math.round(diffSeconds)}s)` });
      }
    }

    const matchedStudent = db.prepare('SELECT * FROM students WHERE UPPER(usn) = ?').get(studentUsn.trim().toUpperCase()) as any;
    if (!matchedStudent) {
      return res.status(400).json({ error: 'Validation Error: Entered USN is not registered in the university roster.' });
    }

    if (isOnline && session.otp !== otpCode) {
      return res.status(400).json({ error: 'Invalid 4-digit verification code. Please look at the projector screen.' });
    }

    if (isOnline && verificationOption && session.verification_option && verificationOption !== session.verification_option) {
      return res.status(400).json({ error: 'Verification Avatar Mismatch: Please select the matching option displayed live on the lecturer screen.' });
    }

    const alreadyMarked = db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND UPPER(student_usn) = ?')
      .get(session.id, studentUsn.trim().toUpperCase());
    if (alreadyMarked) {
      return res.status(400).json({ error: 'Presence already verified! Duplicate attendance attempts are rejected.' });
    }

    let attendanceStatus = (session.status === 'REOPENED' || session.is_reopened === 1) ? 'late' : 'present';

    if (isOnline && deviceFingerprint) {
      const duplicateDevice = db.prepare('SELECT * FROM attendance_records WHERE session_id = ? AND device_fingerprint = ? AND UPPER(student_usn) != ?')
        .get(session.id, deviceFingerprint, studentUsn.trim().toUpperCase());
      if (duplicateDevice) {
        attendanceStatus = 'flagged';
      }
    }

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

      db.prepare('UPDATE sessions SET marked_count = marked_count + 1 WHERE id = ?').run(session.id);
    })();

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
}

export function syncOfflineRecords(
  req: Request,
  res: Response,
  verifyHmacToken: (id: string, otp: string, option: string, token: string, isOffline?: boolean) => boolean
) {
  try {
    const { records } = req.body;
    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'Invalid records format' });
    }

    let syncedCount = 0;
    let rejectedCount = 0;
    const syncResults: string[] = [];

    db.transaction(() => {
      for (const rec of records) {
        const session = db.prepare('SELECT * FROM sessions WHERE id = ? OR subject_code = ?').get(rec.sessionId, rec.sessionId) as any;
        if (!session) {
          rejectedCount++;
          syncResults.push(`Session ${rec.sessionId} not found.`);
          continue;
        }

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

        const matchedStudent = db.prepare('SELECT * FROM students WHERE UPPER(usn) = ?').get(rec.studentUsn.trim().toUpperCase()) as any;
        if (!matchedStudent) {
          rejectedCount++;
          syncResults.push(`USN ${rec.studentUsn} not registered in roster.`);
          continue;
        }

        if (rec.qrToken) {
          const otpVal = rec.otpCode || session.otp;
          const optVal = rec.verificationOption || session.verification_option;
          if (!verifyHmacToken(session.id, otpVal, optVal, rec.qrToken, true)) {
            rejectedCount++;
            syncResults.push(`USN ${rec.studentUsn} verification failed (invalid QR signature).`);
            continue;
          }
        }

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
}

export function getAttendanceRecords(req: Request, res: Response) {
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
    console.error('Get records error:', error);
    res.status(500).json({ error: error.message });
  }
}

export function toggleManualAttendance(req: Request, res: Response) {
  try {
    const { sessionId, studentUsn, present, reason } = req.body;
    
    if (!sessionId || !studentUsn) {
      return res.status(400).json({ error: 'sessionId and studentUsn parameters are required.' });
    }

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
          
          db.prepare(`
            INSERT INTO attendance_records (id, session_id, student_name, student_usn, marked_at, marked_online, verification_option, scanned_at, submitted_at, device_fingerprint, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(recordId, session.id, student.name, studentUsn.trim().toUpperCase(), nowStr, 1, 'BLUE_CIRCLE', nowStr, nowStr, 'lecturer_manual', 'present');
          
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
}

export function getOverrideAudits(req: Request, res: Response) {
  try {
    const audits = db.prepare('SELECT * FROM override_audits').all();
    res.json(audits);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export function getComplianceReports(req: Request, res: Response) {
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
}
