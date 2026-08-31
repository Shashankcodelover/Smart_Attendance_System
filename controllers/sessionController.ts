import { Request, Response } from 'express';
import db, { dao } from '../db-sqlite';

export function getSessions(req: Request, res: Response, activeSessionsCache: Map<string, any>) {
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
}

export function createSession(req: Request, res: Response, getRandomVerificationOption: () => string) {
  try {
    const { department, course, year, section, subjectCode, subjectName, status, lecturerEmail, timeline } = req.body;
    
    if (!subjectCode || typeof subjectCode !== 'string') {
      return res.status(400).json({ error: 'Subject code is required.' });
    }

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
}

export function batchCreateSessions(req: Request, res: Response, getRandomVerificationOption: () => string) {
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
}

export function activateSession(
  req: Request,
  res: Response,
  activeSessionsCache: Map<string, any>,
  getRandomVerificationOption: () => string,
  generateHmacToken: (id: string, otp: string, option: string) => string
) {
  try {
    const { sessionId } = req.body;
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    db.transaction(() => {
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
    console.error('Activate Session error:', error);
    res.status(500).json({ error: error.message });
  }
}

export function cancelSession(req: Request, res: Response, activeSessionsCache: Map<string, any>) {
  try {
    const { sessionId } = req.body;
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    db.prepare("UPDATE sessions SET status = 'INACTIVE' WHERE id = ?").run(sessionId);

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
}

export function reopenSession(
  req: Request,
  res: Response,
  activeSessionsCache: Map<string, any>,
  getRandomVerificationOption: () => string,
  generateHmacToken: (id: string, otp: string, option: string) => string
) {
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
}

export function updateRotation(
  req: Request,
  res: Response,
  activeSessionsCache: Map<string, any>,
  getRandomVerificationOption: () => string,
  generateHmacToken: (id: string, otp: string, option: string) => string
) {
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
}

export function deleteSession(req: Request, res: Response) {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    db.prepare('DELETE FROM attendance_records WHERE session_id = ?').run(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete Session error:', error);
    res.status(500).json({ error: error.message });
  }
}
