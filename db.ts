import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FILE_PATH = path.resolve(__dirname, 'attendance.json');
const EXPORTS_DIR = path.resolve(__dirname, 'exports');

// Interface for DB state
export interface DBState {
  students: any[];
  sessions: any[];
  attendance_records: any[];
  timetables: any[];
  override_audits: any[];
  alert_configs: any[];
  users: any[];
  device_bindings?: Record<string, string>; // usn -> hardwareId
}

let inMemoryState: DBState | null = null;

// Load database from file or initialize with seed data
function loadDB(): DBState {
  if (inMemoryState) return inMemoryState;

  if (fs.existsSync(FILE_PATH)) {
    try {
      const state = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
      if (!state.timetables) state.timetables = [];
      if (!state.override_audits) state.override_audits = [];
      if (!state.alert_configs) state.alert_configs = [];
      if (!state.users) state.users = [];
      if (!state.device_bindings) state.device_bindings = {};
      
      if (state.sessions) {
        state.sessions = state.sessions.map((s: any) => ({
          ...s,
          lecturer_email: s.lecturer_email || 'lecturer@sjce.edu',
          timeline: s.timeline || '10:00 AM - 11:00 AM'
        }));
      }
      inMemoryState = state;
      return state;
    } catch (e) {
      console.error('[DB Load Error]: Error reading attendance.json:', e);
    }
  }

  const dbState: DBState = {
    students: [],
    sessions: [],
    attendance_records: [],
    timetables: [],
    override_audits: [],
    alert_configs: [],
    users: [],
    device_bindings: {}
  };

  saveDB(dbState);
  inMemoryState = dbState;
  return dbState;
}

function getDeptFromCourseCode(courseCode: string): string {
  const code = (courseCode || '').toLowerCase();
  if (code.includes('cse') || code.startsWith('cs')) return 'Computer Science (CSE)';
  if (code.includes('ece') || code.startsWith('ec')) return 'Electronics & Communication (ECE)';
  if (code.includes('ise') || code.startsWith('is')) return 'Information Science (ISE)';
  if (code.includes('ds')) return 'Data Science (DS)';
  if (code.includes('se')) return 'Software Engineering (SE)';
  if (code.startsWith('be')) return 'Computer Science (CSE)';
  return 'Computer Science (CSE)';
}

function getDegreeFromDeptAndYear(dept: string, year: number): string {
  const d = (dept || '').toLowerCase();
  if (d.includes('data science') || d.includes('ds') || d.includes('software engineering') || d.includes('(se)')) {
    return 'M.Tech (Master of Technology)';
  }
  return year > 4 ? 'M.Tech (Master of Technology)' : 'B.E. (Bachelor of Engineering)';
}

/**
 * Sanitizes CSV cell strings to prevent CSV Formula Injection (=, +, -, @, tab, cr).
 */
export function sanitizeCsvCell(cellVal: any): string {
  let str = String(cellVal ?? '');
  if (/^[=\+\-@\t\r]/.test(str)) {
    str = `'` + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

async function syncExcelSheetsAsync(state: DBState): Promise<void> {
  try {
    if (!fs.existsSync(EXPORTS_DIR)) {
      await fs.promises.mkdir(EXPORTS_DIR, { recursive: true });
    }

    const students = state.students || [];
    const sessions = state.sessions || [];
    const records = state.attendance_records || [];

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
        headers.push(`${s.subject_code}_${dateStr}_${(s.timeline || '10_00').replace(/[\s:-]+/g, '_')}`);
      });

      const rows = sectionStudents.map((std: any) => {
        const studentUsnUpper = std.usn.toUpperCase();
        let presentCount = 0;
        const rowSessionStatuses = sectionSessions.map((s: any) => {
          const isPresent = records.some((r: any) => r.session_id === s.id && (r.student_usn || '').toUpperCase() === studentUsnUpper);
          if (isPresent) presentCount++;
          return isPresent ? 'P' : 'A';
        });

        const rate = sectionSessions.length > 0 
          ? Math.round((presentCount / sectionSessions.length) * 100) 
          : 100;

        return [
          sanitizeCsvCell(std.usn),
          sanitizeCsvCell(std.name),
          sanitizeCsvCell(std.course_code),
          sanitizeCsvCell(std.year),
          sanitizeCsvCell(std.section),
          sanitizeCsvCell(`${rate}%`),
          ...rowSessionStatuses.map(st => sanitizeCsvCell(st))
        ].join(',');
      });

      const csvContent = [headers.map(h => sanitizeCsvCell(h)).join(','), ...rows].join('\n');
      const filename = `Attendance_${degree.split(' ')[0]}_${dept.split(' ')[0]}_Year${year}_Sec${section}.csv`.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = path.join(EXPORTS_DIR, filename);

      await fs.promises.writeFile(filePath, csvContent, 'utf-8');
    }
  } catch (err) {
    console.error('[Export Pipeline Error]: Failed to sync excel sheets:', err);
  }
}

// Atomic file writing to prevent JSON truncation
function saveDB(state: DBState) {
  inMemoryState = state;
  try {
    const tempPath = `${FILE_PATH}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempPath, FILE_PATH);
    
    // Safely execute async CSV export with error boundary
    syncExcelSheetsAsync(state).catch(err => {
      console.error('[Background Export Error]:', err);
    });
  } catch (e) {
    console.error('[DB Save Error]: Error saving attendance.json:', e);
  }
}

export default {
  getState: () => loadDB(),
  saveState: () => {
    if (inMemoryState) saveDB(inMemoryState);
  },
  sanitizeCsvCell,
  getExportsDir: () => EXPORTS_DIR
};
