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
      if (!state.timetables) state.timetables = [];
      if (!state.override_audits) state.override_audits = [];
      if (!state.alert_configs) state.alert_configs = [];
      
      if (state.sessions) {
        state.sessions = state.sessions.map((s: any) => ({
          ...s,
          lecturer_email: s.lecturer_email || 'lecturer@sjce.edu',
          timeline: s.timeline || '10:00 AM - 11:00 AM'
        }));
      }
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
  if (code.startsWith('be')) return 'Computer Science (CSE)';
  return 'Computer Science (CSE)';
}

function getDegreeFromDeptAndYear(dept: string, year: number): string {
  const d = dept.toLowerCase();
  if (d.includes('data science') || d.includes('ds') || d.includes('software engineering') || d.includes('(se)')) {
    return 'M.Tech (Master of Technology)';
  }
  return 'B.E. (Bachelor of Engineering)';
}

/**
 * Sanitizes CSV cell strings to prevent CSV Formula Injection (=, +, -, @, tab, cr).
 */
function sanitizeCsvCell(cellVal: any): string {
  let str = String(cellVal ?? '');
  if (/^[=\+\-@\t\r]/.test(str)) {
    str = `'` + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

async function syncExcelSheetsAsync(state: DBState) {
  try {
    const exportsDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) {
      await fs.promises.mkdir(exportsDir, { recursive: true });
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
        headers.map(sanitizeCsvCell).join(','),
        ...rows.map(r => r.map(sanitizeCsvCell).join(','))
      ].join('\n');

      const targetDir = path.join(exportsDir, getCleanDirName(degree), getCleanDirName(dept), `Year ${year}`);
      if (!fs.existsSync(targetDir)) {
        await fs.promises.mkdir(targetDir, { recursive: true });
      }

      const filePath = path.join(targetDir, `Section_${section}_Attendance.csv`);
      await fs.promises.writeFile(filePath, csvContent, 'utf-8');
    }
  } catch (error) {
    console.error('[SyncExcelSheets Error]:', error);
  }
}

// Debounced async disk persistence queue
let saveDebounceTimer: NodeJS.Timeout | null = null;
function saveDB(state: DBState) {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(async () => {
    try {
      await fs.promises.writeFile(FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
      await syncExcelSheetsAsync(state);
    } catch (e) {
      console.error('[saveDB Async Error]:', e);
    }
  }, 100);
}

const dbState = loadDB();

export default {
  getState: () => dbState,
  saveState: () => saveDB(dbState),
  loadDB,
  saveDB,
  sanitizeCsvCell
};
