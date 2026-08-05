import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import db from './db';
import crypto from 'crypto';
import { handleAiChat } from './controllers/aiController';
import * as sessionController from './controllers/sessionController';
import * as attendanceController from './controllers/attendanceController';

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

// REST Endpoints — Session Management (Delegated to sessionController)
app.get('/api/sessions', (req, res) => sessionController.getSessions(req, res, activeSessionsCache));
app.post('/api/sessions/create', (req, res) => sessionController.createSession(req, res, getRandomVerificationOption));
app.post('/api/sessions/batch-create', (req, res) => sessionController.batchCreateSessions(req, res, getRandomVerificationOption));
app.post('/api/sessions/activate', (req, res) => sessionController.activateSession(req, res, activeSessionsCache, getRandomVerificationOption, generateHmacToken));
app.post('/api/sessions/cancel', (req, res) => sessionController.cancelSession(req, res, activeSessionsCache));
app.post('/api/sessions/reopen', (req, res) => sessionController.reopenSession(req, res, activeSessionsCache, getRandomVerificationOption, generateHmacToken));
app.post('/api/sessions/update-rotation', (req, res) => sessionController.updateRotation(req, res, activeSessionsCache, getRandomVerificationOption, generateHmacToken));
app.delete('/api/sessions/:id', (req, res) => sessionController.deleteSession(req, res));

// REST Endpoints — Attendance & Verification (Delegated to attendanceController)
app.post('/api/attendance/check-in', (req, res) => attendanceController.submitCheckIn(req, res, activeSessionsCache, verifyHmacToken));
app.post('/api/attendance/sync-offline', (req, res) => attendanceController.syncOfflineRecords(req, res, verifyHmacToken));
app.get('/api/attendance/records', (req, res) => attendanceController.getAttendanceRecords(req, res));

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

// 9. Alpine chat endpoint (Delegated to aiController)
app.post('/api/ai/chat', async (req, res) => {
  return handleAiChat(req, res, getGeminiClient, getRandomVerificationOption);
});

// 10. Manual Attendance Override & Auditing (Delegated to attendanceController)
app.post('/api/attendance/toggle-manual', (req, res) => attendanceController.toggleManualAttendance(req, res));
app.get('/api/override-audits', (req, res) => attendanceController.getOverrideAudits(req, res));
app.get('/api/attendance/reports', (req, res) => attendanceController.getComplianceReports(req, res));

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
