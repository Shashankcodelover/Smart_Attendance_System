import fs from 'fs';
import path from 'path';

const FILE_PATH = path.join(process.cwd(), 'attendance.json');

// Interface for DB state
interface DBState {
  students: any[];
  sessions: any[];
  attendance_records: any[];
  timetables: any[];
  override_audits: any[];
  alert_configs: any[];
}

// Load database from file or initialize with seed data
function loadDB(): DBState {
  if (fs.existsSync(FILE_PATH)) {
    try {
      const state = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
      // Ensure arrays exist
      if (!state.timetables) state.timetables = [];
      if (!state.override_audits) state.override_audits = [];
      if (!state.alert_configs) state.alert_configs = [];
      
      // Ensure lecturer_email and timeline exist on all loaded sessions
      if (state.sessions) {
        state.sessions = state.sessions.map((s: any) => ({
          ...s,
          lecturer_email: s.lecturer_email || 'admin@sjce.edu',
          timeline: s.timeline || '10:00 AM - 11:00 AM'
        }));
      }
      return state;
    } catch (e) {
      console.error('Error reading attendance.json:', e);
    }
  }

  // Fresh empty start — no demo seed data
  const dbState: DBState = {
    students: [],
    sessions: [],
    attendance_records: [],
    timetables: [],
    override_audits: [],
    alert_configs: []
  };

  saveDB(dbState);
  return dbState;
}

function getDeptFromCourseCode(courseCode: string): string {
  const code = (courseCode || '').toLowerCase();
  if (code.includes('cse') || code.startsWith('cs')) return 'Computer Science (CSE)';
  if (code.includes('ece') || code.startsWith('ec')) return 'Electronics & Communication (ECE)';
  if (code.includes('ise') || code.startsWith('is')) return 'Information Science (ISE)';
  if (code.includes('ds')) return 'Data Science (DS)';
  if (code.includes('se')) return 'Software Engineering (SE)';
  if (code.startsWith('be')) return 'Computer Science (CSE)'; // Bio-Engineering or CSE fallback
  return 'Computer Science (CSE)';
}

function getDegreeFromDeptAndYear(dept: string, year: number): string {
  const d = dept.toLowerCase();
  if (d.includes('data science') || d.includes('ds') || d.includes('software engineering') || d.includes('(se)')) {
    return 'M.Tech (Master of Technology)';
  }
  return 'B.E. (Bachelor of Engineering)';
}

function syncExcelSheets(state: DBState) {
  try {
    const exportsDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const students = state.students || [];
    const sessions = state.sessions || [];
    const records = state.attendance_records || [];

    const getCleanDirName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_');
    const sectionsToSync = new Set<string>();

    students.forEach((std: any) => {
      const dept = getDeptFromCourseCode(std.course_code);
      const degree = getDegreeFromDeptAndYear(dept, std.year);
      const year = std.year || 1;
      const section = (std.section || 'A').toUpperCase();
      sectionsToSync.add(`${degree}|${dept}|${year}|${section}`);
    });

    sessions.forEach((s: any) => {
      const degree = s.course === 'B.E.' ? 'B.E. (Bachelor of Engineering)' : s.course === 'M.Tech' ? 'M.Tech (Master of Technology)' : s.course || 'B.E. (Bachelor of Engineering)';
      const dept = s.department || 'Computer Science (CSE)';
      const year = s.year || 1;
      const section = (s.section || 'A').toUpperCase();
      sectionsToSync.add(`${degree}|${dept}|${year}|${section}`);
    });

    for (const key of sectionsToSync) {
      const [degree, dept, yearStr, section] = key.split('|');
      const year = Number(yearStr);

      const sectionStudents = students.filter((std: any) => {
        const stdDept = getDeptFromCourseCode(std.course_code);
        const stdDegree = getDegreeFromDeptAndYear(stdDept, std.year);
        return stdDegree === degree && stdDept === dept && std.year === year && (std.section || 'A').toUpperCase() === section;
      });

      const sectionSessions = sessions.filter((s: any) => {
        const sDegree = s.course === 'B.E.' ? 'B.E. (Bachelor of Engineering)' : s.course === 'M.Tech' ? 'M.Tech (Master of Technology)' : s.course || 'B.E. (Bachelor of Engineering)';
        const deptKeyword = dept.split(' ')[0].toLowerCase();
        const sessionDept = (s.department || '').toLowerCase();
        return sDegree === degree && (sessionDept.includes(deptKeyword) || deptKeyword.includes(sessionDept)) && s.year === year && (s.section || 'A').toUpperCase() === section;
      });

      sectionSessions.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      const headers = ['USN', 'Name', 'Course Code', 'Year', 'Section', 'Overall Attendance Rate (%)'];
      
      sectionSessions.forEach((s: any) => {
        const dateStr = s.created_at ? new Date(s.created_at).toLocaleDateString().replace(/\//g, '-') : 'Date';
        headers.push(`${s.subject_code}_${dateStr}_${s.timeline.replace(/[\s:-]+/g, '_')}`);
      });

      const rows = sectionStudents.map((std: any) => {
        const studentUsnUpper = std.usn.toUpperCase();
        let presentCount = 0;
        const rowSessionStatuses = sectionSessions.map((s: any) => {
          const isPresent = records.some((r: any) => r.session_id === s.id && r.student_usn.toUpperCase() === studentUsnUpper);
          if (isPresent) presentCount++;
          return isPresent ? 'P' : 'A';
        });

        const rate = sectionSessions.length > 0 
          ? Math.round((presentCount / sectionSessions.length) * 100)
          : std.attendance_rate || 100;

        return [
          std.usn,
          std.name,
          std.course_code,
          String(std.year),
          std.section,
          `${rate}%`,
          ...rowSessionStatuses
        ];
      });

      const csvContent = [
        headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
        ...rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const targetDir = path.join(exportsDir, getCleanDirName(degree), getCleanDirName(dept), `Year ${year}`);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const filePath = path.join(targetDir, `Section_${section}_Attendance.csv`);
      fs.writeFileSync(filePath, csvContent, 'utf-8');
    }
  } catch (error) {
    console.error('Error in syncExcelSheets:', error);
  }
}

function saveDB(state: DBState) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
    syncExcelSheets(state);
  } catch (e) {
    console.error('Error writing attendance.json:', e);
  }
}

// Initial synchronization on module load
try {
  if (fs.existsSync(FILE_PATH)) {
    const raw = fs.readFileSync(FILE_PATH, 'utf-8');
    if (raw) {
      const state = JSON.parse(raw);
      syncExcelSheets(state);
    }
  }
} catch (e) {
  console.error('Startup Excel CSV sync failed:', e);
}

const db = {
  pragma: (stmt: string) => {},
  exec: (stmt: string) => {},
  transaction: <T extends (...args: any[]) => any>(fn: T): T => {
    return ((...args: any[]) => fn(...args)) as any;
  },
  prepare: (sql: string) => {
    const cleanedSql = sql.replace(/\s+/g, ' ').trim();
    
    return {
      all: (...args: any[]): any[] => {
        const state = loadDB();
        
        // 1. SELECT * FROM sessions WHERE lecturer_email = ? ORDER BY created_at DESC
        if (cleanedSql.includes('SELECT * FROM sessions') && cleanedSql.includes('WHERE lecturer_email = ?') && cleanedSql.includes('ORDER BY created_at DESC')) {
          const [email] = args;
          return [...state.sessions]
            .filter(s => s.lecturer_email === email)
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        }

        // 1b. SELECT * FROM sessions ORDER BY created_at DESC (Fallback/All)
        if (cleanedSql.includes('SELECT * FROM sessions') && cleanedSql.includes('ORDER BY created_at DESC')) {
          return [...state.sessions].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        }
        
        // 2. SELECT * FROM students ORDER BY usn
        if (cleanedSql.includes('SELECT * FROM students') && cleanedSql.includes('ORDER BY usn')) {
          return [...state.students].sort((a, b) => a.usn.localeCompare(b.usn));
        }

        // 3. SELECT * FROM students WHERE attendance_rate < ? AND section = ? ORDER BY usn
        if (cleanedSql.includes('SELECT * FROM students WHERE attendance_rate < ?')) {
          const [threshold, section] = args;
          return state.students
            .filter(s => s.attendance_rate < threshold && s.section === section)
            .sort((a, b) => a.usn.localeCompare(b.usn));
        }

        // 4. SELECT * FROM attendance_records WHERE session_id = ?
        if (cleanedSql.includes('SELECT * FROM attendance_records WHERE session_id = ?')) {
          const [sessionId] = args;
          return state.attendance_records.filter(r => r.session_id === sessionId);
        }

        // 5. SELECT * FROM attendance_records
        if (cleanedSql.includes('SELECT * FROM attendance_records')) {
          return state.attendance_records;
        }

        // 6. SELECT * FROM timetables
        if (cleanedSql.includes('SELECT * FROM timetables')) {
          return state.timetables || [];
        }

        // 7. SELECT * FROM override_audits
        if (cleanedSql.includes('SELECT * FROM override_audits')) {
          return state.override_audits || [];
        }

        // 8. SELECT * FROM alert_configs
        if (cleanedSql.includes('SELECT * FROM alert_configs')) {
          return state.alert_configs || [];
        }

        return [];
      },
      
      get: (...args: any[]): any => {
        const state = loadDB();

        // 1. SELECT COUNT(*) as count FROM students
        if (cleanedSql.includes('SELECT COUNT(*) as count FROM students')) {
          return { count: state.students.length };
        }

        // 2. SELECT COUNT(*) as count FROM sessions
        if (cleanedSql.includes('SELECT COUNT(*) as count FROM sessions')) {
          return { count: state.sessions.length };
        }

        // 3. SELECT COUNT(*) as count FROM attendance_records
        if (cleanedSql.includes('SELECT COUNT(*) as count FROM attendance_records')) {
          return { count: state.attendance_records.length };
        }

        // 4. SELECT * FROM students WHERE UPPER(usn) = ?
        if (cleanedSql.includes('SELECT * FROM students WHERE UPPER(usn) = ?')) {
          const [usn] = args;
          return state.students.find(s => s.usn.toUpperCase() === usn.toUpperCase());
        }

        // 5. SELECT * FROM sessions WHERE id = ? OR subject_code = ?
        if (cleanedSql.includes('SELECT * FROM sessions WHERE id = ? OR subject_code = ?')) {
          const [id, subject_code] = args;
          return state.sessions.find(s => s.id === id || s.subject_code === subject_code);
        }

        // 6. SELECT * FROM sessions WHERE id = ?
        if (cleanedSql.includes('SELECT * FROM sessions WHERE id = ?')) {
          const [id] = args;
          return state.sessions.find(s => s.id === id);
        }

        // 7. SELECT id FROM sessions WHERE id = ? OR subject_code = ?
        if (cleanedSql.includes('SELECT id FROM sessions WHERE id = ? OR subject_code = ?')) {
          const [id, subject_code] = args;
          const found = state.sessions.find(s => s.id === id || s.subject_code === subject_code);
          return found ? { id: found.id } : undefined;
        }

        // 8. SELECT * FROM sessions WHERE (status = 'ACTIVE' OR UPPER(subject_code) = ?) AND lecturer_email = ?
        if (cleanedSql.includes("SELECT * FROM sessions WHERE (status = 'ACTIVE' OR UPPER(subject_code) = ?) AND lecturer_email = ?")) {
          const [inputCode, email] = args;
          return state.sessions.find(s => s.lecturer_email === email && (s.status === 'ACTIVE' || s.subject_code.toUpperCase() === String(inputCode).toUpperCase()));
        }

        // 8b. SELECT * FROM sessions WHERE status = 'ACTIVE' OR UPPER(subject_code) = ?
        if (cleanedSql.includes("SELECT * FROM sessions WHERE status = 'ACTIVE' OR UPPER(subject_code) = ?")) {
          const [inputCode] = args;
          return state.sessions.find(s => s.status === 'ACTIVE' || s.subject_code.toUpperCase() === String(inputCode).toUpperCase());
        }

        // 8c. SELECT * FROM sessions WHERE (status = 'DRAFT' OR status = 'READY') AND lecturer_email = ?
        if (cleanedSql.includes("SELECT * FROM sessions WHERE (status = 'DRAFT' OR status = 'READY') AND lecturer_email = ?")) {
          const [email] = args;
          return state.sessions.find(s => s.lecturer_email === email && (s.status === 'DRAFT' || s.status === 'READY'));
        }

        // 8d. SELECT * FROM sessions WHERE status = 'ACTIVE' AND lecturer_email = ?
        if (cleanedSql.includes("SELECT * FROM sessions WHERE status = 'ACTIVE' AND lecturer_email = ?")) {
          const [email] = args;
          return state.sessions.find(s => s.lecturer_email === email && s.status === 'ACTIVE');
        }

        // 9. SELECT * FROM attendance_records WHERE session_id = ? AND UPPER(student_usn) = ?
        if (cleanedSql.includes('SELECT * FROM attendance_records WHERE session_id = ? AND UPPER(student_usn) = ?')) {
          const [sessionId, studentUsn] = args;
          return state.attendance_records.find(r => r.session_id === sessionId && r.student_usn.toUpperCase() === studentUsn.toUpperCase());
        }

        // 9b. SELECT * FROM attendance_records WHERE session_id = ? AND device_fingerprint = ? AND UPPER(student_usn) != ?
        if (cleanedSql.includes('SELECT * FROM attendance_records WHERE session_id = ? AND device_fingerprint = ? AND UPPER(student_usn) != ?')) {
          const [sessionId, fingerprint, studentUsn] = args;
          return state.attendance_records.find(r => r.session_id === sessionId && r.device_fingerprint === fingerprint && (r.student_usn || '').toUpperCase() !== (studentUsn || '').toUpperCase());
        }

        // 10. SELECT * FROM timetables WHERE id = ?
        if (cleanedSql.includes('SELECT * FROM timetables WHERE id = ?')) {
          const [id] = args;
          return (state.timetables || []).find(t => t.id === id);
        }

        // 11. SELECT * FROM alert_configs WHERE UPPER(student_usn) = ? AND UPPER(subject_code) = ?
        if (cleanedSql.includes('SELECT * FROM alert_configs WHERE UPPER(student_usn) = ? AND UPPER(subject_code) = ?')) {
          const [usn, subject_code] = args;
          return (state.alert_configs || []).find(c => c.student_usn.toUpperCase() === usn.toUpperCase() && c.subject_code.toUpperCase() === subject_code.toUpperCase());
        }

        // 12. SELECT * FROM alert_configs WHERE UPPER(student_usn) = ?
        if (cleanedSql.includes('SELECT * FROM alert_configs WHERE UPPER(student_usn) = ?')) {
          const [usn] = args;
          return (state.alert_configs || []).find(c => c.student_usn.toUpperCase() === usn.toUpperCase());
        }

        return null;
      },
      
      run: (...args: any[]): any => {
        const state = loadDB();

        // 1. UPDATE sessions SET status = 'INACTIVE' WHERE status = 'ACTIVE'
        if (cleanedSql.includes("UPDATE sessions SET status = 'INACTIVE' WHERE status = 'ACTIVE'")) {
          state.sessions.forEach(s => {
            if (s.status === 'ACTIVE') s.status = 'INACTIVE';
          });
          saveDB(state);
          return { changes: 1 };
        }

        // 2. UPDATE sessions SET status = 'INACTIVE' WHERE id = ?
        if (cleanedSql.includes("UPDATE sessions SET status = 'INACTIVE' WHERE id = ?")) {
          const [id] = args;
          const found = state.sessions.find(s => s.id === id);
          if (found) found.status = 'INACTIVE';
          saveDB(state);
          return { changes: 1 };
        }

        // 3. UPDATE sessions SET otp = ?, verification_option = ? WHERE id = ?
        if (cleanedSql.includes("UPDATE sessions SET otp = ?, verification_option = ? WHERE id = ?")) {
          const [otp, verification_option, id] = args;
          const found = state.sessions.find(s => s.id === id);
          if (found) {
            found.otp = otp;
            found.verification_option = verification_option;
          }
          saveDB(state);
          return { changes: 1 };
        }

        // 4. UPDATE sessions SET otp = ? WHERE id = ?
        if (cleanedSql.includes("UPDATE sessions SET otp = ? WHERE id = ?")) {
          const [otp, id] = args;
          const found = state.sessions.find(s => s.id === id);
          if (found) found.otp = otp;
          saveDB(state);
          return { changes: 1 };
        }

        // 5. UPDATE sessions SET status = 'ACTIVE', otp = ?, verification_option = ?, created_at = ?, marked_count = 0 WHERE id = ?
        if (cleanedSql.includes("UPDATE sessions SET status = 'ACTIVE'")) {
          const [otp, verification_option, created_at, id] = args;
          const found = state.sessions.find(s => s.id === id);
          if (found) {
            found.status = 'ACTIVE';
            found.otp = otp;
            found.verification_option = verification_option;
            found.created_at = created_at;
            found.marked_count = 0;
          }
          saveDB(state);
          return { changes: 1 };
        }

        // 6. UPDATE sessions SET marked_count = marked_count + 1 WHERE id = ?
        if (cleanedSql.includes("UPDATE sessions SET marked_count = marked_count + 1 WHERE id = ?")) {
          const [id] = args;
          const found = state.sessions.find(s => s.id === id);
          if (found) found.marked_count = (found.marked_count || 0) + 1;
          saveDB(state);
          return { changes: 1 };
        }

        // 7. INSERT INTO sessions
        if (cleanedSql.startsWith('INSERT INTO sessions')) {
          if (args.length >= 16) {
            const [
              id, subject_code, subject_name, department, course, year, section, otp, status, created_at, expires_at, marked_count, expected_count, verification_option,
              lecturer_email, timeline
            ] = args;
            
            state.sessions = state.sessions.filter(s => s.id !== id);
            state.sessions.push({
              id,
              subject_code,
              subject_name,
              department,
              course,
              year,
              section,
              otp,
              status,
              created_at,
              expires_at,
              marked_count,
              expected_count,
              verification_option,
              lecturer_email: lecturer_email || 'admin@sjce.edu',
              timeline: timeline || '10:00 AM - 11:00 AM'
            });
          } else {
            const [id, subject_code, subject_name, department, course, year, section, otp, status, created_at, expires_at, marked_count, expected_count, verification_option] = args;
            
            state.sessions = state.sessions.filter(s => s.id !== id);
            state.sessions.push({
              id,
              subject_code,
              subject_name,
              department,
              course,
              year,
              section,
              otp,
              status,
              created_at,
              expires_at,
              marked_count,
              expected_count,
              verification_option,
              lecturer_email: 'admin@sjce.edu',
              timeline: '10:00 AM - 11:00 AM'
            });
          }
          saveDB(state);
          return { changes: 1 };
        }

        // 8. INSERT INTO attendance_records
        if (cleanedSql.startsWith('INSERT INTO attendance_records')) {
          const [id, session_id, student_name, student_usn, marked_at, marked_online, verification_option, scanned_at, submitted_at, device_fingerprint, status] = args;
          
          state.attendance_records = state.attendance_records.filter(r => !(r.session_id === session_id && r.student_usn === student_usn));
          
          state.attendance_records.push({
            id,
            session_id,
            student_name,
            student_usn,
            marked_at,
            marked_online,
            verification_option,
            scanned_at: scanned_at || marked_at,
            submitted_at: submitted_at || marked_at,
            device_fingerprint: device_fingerprint || null,
            status: status || 'present'
          });
          saveDB(state);
          return { changes: 1 };
        }

        // DELETE FROM sessions WHERE id = ?
        if (cleanedSql.includes('DELETE FROM sessions WHERE id = ?')) {
          const [id] = args;
          state.sessions = state.sessions.filter(s => s.id !== id);
          saveDB(state);
          return { changes: 1 };
        }

        // DELETE FROM attendance_records WHERE session_id = ?
        if (cleanedSql.includes('DELETE FROM attendance_records WHERE session_id = ?')) {
          const [sessionId] = args;
          state.attendance_records = state.attendance_records.filter(r => r.session_id !== sessionId);
          saveDB(state);
          return { changes: 1 };
        }

        // INSERT INTO timetables
        if (cleanedSql.startsWith('INSERT INTO timetables')) {
          const [id, subject_code, subject_name, department, course, year, section, lecturer_email, start_time, duration, day] = args;
          state.timetables = state.timetables.filter(t => t.id !== id);
          state.timetables.push({
            id,
            subject_code,
            subject_name,
            department,
            course,
            year,
            section,
            lecturer_email,
            start_time,
            duration,
            day
          });
          saveDB(state);
          return { changes: 1 };
        }

        // DELETE FROM timetables WHERE id = ?
        if (cleanedSql.includes('DELETE FROM timetables WHERE id = ?')) {
          const [id] = args;
          state.timetables = state.timetables.filter(t => t.id !== id);
          saveDB(state);
          return { changes: 1 };
        }

        // INSERT INTO override_audits
        if (cleanedSql.startsWith('INSERT INTO override_audits')) {
          const [id, overridden_by, usn, session_id, timestamp, reason] = args;
          state.override_audits.push({
            id,
            overridden_by,
            usn,
            session_id,
            timestamp,
            reason
          });
          saveDB(state);
          return { changes: 1 };
        }

        // INSERT OR REPLACE INTO alert_configs
        if (cleanedSql.startsWith('INSERT OR REPLACE INTO alert_configs')) {
          const [id, student_usn, subject_code, threshold] = args;
          state.alert_configs = state.alert_configs.filter(c => !(c.student_usn.toUpperCase() === student_usn.toUpperCase() && c.subject_code.toUpperCase() === subject_code.toUpperCase()));
          state.alert_configs.push({
            id,
            student_usn,
            subject_code,
            threshold
          });
          saveDB(state);
          return { changes: 1 };
        }

        // 9. INSERT OR REPLACE INTO students
        if (cleanedSql.startsWith('INSERT OR REPLACE INTO students')) {
          const [usn, name, attendance_rate, course_code, section, year, avatar_url] = args;
          
          state.students = state.students.filter(s => s.usn.toUpperCase() !== usn.toUpperCase());
          
          state.students.push({
            usn,
            name,
            attendance_rate,
            course_code,
            section,
            year,
            avatar_url
          });
          saveDB(state);
          return { changes: 1 };
        }

        return { changes: 0 };
      }
    };
  }
};

export default db;
