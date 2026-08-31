import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import db, { dao } from '../db-sqlite';

export async function handleAiChat(
  req: any,
  res: any,
  getGeminiClient: () => GoogleGenAI,
  getRandomVerificationOption: () => string
) {
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

    // 1. ADD TIMETABLE ENTRY
    if (text.includes('timetable') && (text.includes('add') || text.includes('create') || text.includes('schedule'))) {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const matchedDay = days.find(d => text.includes(d.toLowerCase())) || 'Monday';
      
      const timeMatch = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*-\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i) || text.match(/at\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
      const timeSlot = timeMatch ? timeMatch[1] : '10:00 AM - 11:00 AM';

      const codeMatch = text.match(/\b([A-Z]{2,4}\d{3})\b/i);
      const subjectCode = codeMatch ? codeMatch[1].toUpperCase() : 'CS501';

      const roomMatch = text.match(/\b(?:room|lab|hall)\s*([a-z0-9-]+)\b/i);
      const room = roomMatch ? `Room ${roomMatch[1].toUpperCase()}` : 'Room 301';

      let parsedYear = 3;
      const yrMatch = text.match(/\b([1-4])(?:st|nd|rd|th)?\s*(?:year|yr)\b/);
      if (yrMatch) parsedYear = parseInt(yrMatch[1]);

      let parsedSection = 'A';
      const secMatch = text.match(/\b(?:section|sec)\s*([a-d])\b/i);
      if (secMatch) parsedSection = secMatch[1].toUpperCase();

      let department = 'Computer Science (CSE)';
      if (text.includes('ece') || text.includes('electronics')) department = 'Electronics & Communication (ECE)';
      else if (text.includes('me') || text.includes('mechanical')) department = 'Mechanical Engineering (ME)';

      const entry = {
        day: matchedDay,
        time_slot: timeSlot,
        subject_code: subjectCode,
        subject_name: subjectCode === 'CS501' ? 'Computer Networks' : subjectCode === 'CS502' ? 'Database Management Systems' : 'Advanced Engineering Elective',
        lecturer_email: lecturerEmail,
        lecturer_name: 'Faculty Incharge',
        department,
        course: 'B.E.',
        year: parsedYear,
        section: parsedSection,
        room
      };

      dao.insertTimetableEntry(entry);

      actionCard = {
        type: 'timetable_added',
        title: 'Timetable Slot Scheduled',
        description: `Scheduled ${entry.subject_code} (${entry.day} ${entry.time_slot}) in ${entry.room} for ${entry.department} Year ${entry.year} Sec ${entry.section}.`,
        data: entry
      };
      botResponseText = `I have successfully scheduled **${entry.subject_code}** on **${entry.day} (${entry.time_slot})** in **${entry.room}** for ${entry.department} Year ${entry.year} Section ${entry.section} into the database.`;
    }
    // 2. ADD STUDENT ENROLLMENT
    else if (text.includes('add student') || text.includes('enroll student') || text.includes('register student')) {
      const usnMatch = text.match(/\b(4[A-Z0-9]{9})\b/i) || text.match(/usn\s*([A-Z0-9]+)/i);
      const studentUsn = usnMatch ? usnMatch[1].toUpperCase() : `4JC22CS${Math.floor(100 + Math.random() * 899)}`;

      const nameMatch = text.match(/student\s+(?:named\s+|usn\s+\w+\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      const studentName = nameMatch ? nameMatch[1] : 'Enrolled Candidate';

      let parsedYear = 3;
      const yrMatch = text.match(/\b([1-4])(?:st|nd|rd|th)?\s*(?:year|yr)\b/);
      if (yrMatch) parsedYear = parseInt(yrMatch[1]);

      let parsedSection = 'A';
      const secMatch = text.match(/\b(?:section|sec)\s*([a-d])\b/i);
      if (secMatch) parsedSection = secMatch[1].toUpperCase();

      let department = 'Computer Science (CSE)';
      if (text.includes('ece') || text.includes('electronics')) department = 'Electronics & Communication (ECE)';

      const student = {
        usn: studentUsn,
        name: studentName,
        attendanceRate: 90,
        courseCode: department.includes('CSE') ? 'CS' : 'EC',
        section: parsedSection,
        year: parsedYear,
        department,
        course: 'B.E.',
        roll_number: studentUsn.slice(-3),
        onboarded_at: new Date().toISOString()
      };

      dao.upsertStudent(student);

      actionCard = {
        type: 'student_enrolled',
        title: 'Student Enrolled Successfully',
        description: `Enrolled ${student.name} (${student.usn}) in ${student.department} Year ${student.year} Sec ${student.section}.`,
        data: student
      };
      botResponseText = `Student **${student.name} (${student.usn})** has been enrolled into **${student.department} Year ${student.year} Section ${student.section}** and saved directly to the database.`;
    }
    // 3. CREATE / DRAFT SESSION
    else if (text.includes('create') || text.includes('draft') || text.includes('section')) {
      let parsedYear = 3;
      let parsedSection = 'A';
      let parsedDept = 'Computer Science (CSE)';
      let parsedCourse = 'B.E.';
      let parsedSubjectCode = 'CS501';
      let parsedSubjectName = 'Computer Architecture';

      const yearMatch = text.match(/\b([1-4])(?:st|nd|rd|th)?\s*(?:year|yr)\b/) || text.match(/\b(?:year|yr)\s*([1-4])\b/);
      if (yearMatch) parsedYear = parseInt(yearMatch[1]);

      const sectionMatch = text.match(/\b(?:section|sec|group)\s*([a-d])\b/i) || text.match(/\b([a-d])\s*(?:section|sec|group)\b/i) || text.match(/\b([a-d])\b/i);
      if (sectionMatch) parsedSection = sectionMatch[1].toUpperCase();

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
        subject_code: parsedSubjectCode,
        subject_name: parsedSubjectName,
        department: parsedDept,
        course: parsedCourse,
        year: parsedYear,
        section: parsedSection,
        otp: '',
        status: 'DRAFT',
        created_at: new Date().toISOString(),
        expires_at: '',
        marked_count: 0,
        expected_count: 60,
        verification_option: '',
        lecturer_email: lecturerEmail,
        timeline: '10:00 AM - 11:00 AM'
      };

      dao.insertSession(newSession);

      actionCard = {
        type: 'section_created',
        title: 'Section Draft Initialized',
        description: `Created draft section for ${newSession.subject_code} ${newSession.subject_name} (B.E. Year ${newSession.year}, Sec ${newSession.section}).`,
        data: newSession
      };
      botResponseText = `I have initialized a new DRAFT session for **${newSession.subject_code} (${newSession.subject_name}) Section ${newSession.section}** in your lecturer dashboard.`;
    }
    // 4. ACTIVATE SESSION
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

        found = dao.getSessionById(found.id);
        actionCard = {
          type: 'session_activated',
          title: 'Verification Session Activated',
          description: `Live scanning activated on OTP ${found.otp} for ${found.subject_code}.`,
          data: found
        };
        botResponseText = `Live session for **${found.subject_code} (${found.subject_name})** has been activated! Dynamic challenge **${found.verification_option}** and OTP **${found.otp}** are now active for student scanning.`;
      } else {
        botResponseText = `No sessions found in your roster. Please create a section first!`;
      }
    }
    // 5. CLOSE SESSION
    else if (text.includes('close') || text.includes('cancel') || text.includes('stop')) {
      let found = db.prepare("SELECT * FROM sessions WHERE status = 'ACTIVE' AND lecturer_email = ? LIMIT 1").get(lecturerEmail) as any;
      if (found) {
        dao.updateSessionStatus(found.id, 'INACTIVE');
        actionCard = {
          type: 'session_cancelled',
          title: 'Verification Terminal Closed',
          description: `Attendance gate sealed for ${found.subject_code}.`,
          data: found
        };
        botResponseText = `Sealed active check-in gates for section **${found.subject_code}**!`;
      } else {
        botResponseText = `No active sessions were found open.`;
      }
    }
    // 6. QUERY ATTENDANCE / SHORTAGE
    else if (text.includes('shortage') || text.includes('below') || text.includes('under') || text.includes('attendance') || text.includes('risk')) {
      const usnMatch = text.match(/\b(4[A-Z0-9]{9})\b/i);
      if (usnMatch) {
        const usn = usnMatch[1].toUpperCase();
        const student: any = dao.getStudentByUsn(usn);
        const stats = dao.getStudentAttendanceStats(usn);
        actionCard = {
          type: 'student_stats',
          title: `Attendance Record: ${usn}`,
          description: student ? `${student.name} — ${stats.length} courses tracked` : 'Student details',
          data: { student, stats }
        };
        botResponseText = student
          ? `Found records for **${student.name} (${student.usn})** in ${student.department} Section ${student.section}. Overall attendance status loaded.`
          : `No student found with USN ${usn}.`;
      } else {
        const threshold = 75;
        const lowRoster = dao.getStudentsBelowThreshold(threshold);
        actionCard = {
          type: 'query_result',
          title: `Detention Risk List (< ${threshold}%)`,
          description: `Found ${lowRoster.length} students below ${threshold}% across departments.`,
          data: lowRoster
        };
        botResponseText = `Identified **${lowRoster.length} students** falling below the mandatory ${threshold}% attendance threshold.`;
      }
    }
    // 7. NAVIGATION
    else if (text.includes('go to') || text.includes('open') || text.includes('view') || text.includes('navigate')) {
      let pageName = 'dashboard';
      if (text.includes('explorer') || text.includes('ai')) pageName = 'explorer';
      else if (text.includes('selection') || text.includes('class')) pageName = 'class-selection';
      else if (text.includes('verification') || text.includes('live')) pageName = 'verification';
      else if (text.includes('resources') || text.includes('timetable') || text.includes('syllabus')) pageName = 'resources';

      actionCard = {
        type: 'redirect',
        title: `Redirecting`,
        description: `Navigating to: ${pageName}`,
        data: { pageName }
      };
      botResponseText = `Navigating to **${pageName}**!`;
    } else {
      botResponseText = `Hello! I am Alpine, your Smart Attendance AI Assistant. You can tell me in natural language:\n- "Schedule timetable slot for Monday 10 AM CS501 in Room 301"\n- "Add student 4JC22CS045 Sneha Rao to CSE 3rd Year Sec A"\n- "Start live attendance session for CS501"\n- "Check attendance for 4JC21CS001" or "Show students below 75%"\n- "Go to timetable resources page"`;
    }

    return res.json({ text: botResponseText, actionCard });
  }

  // --- GEMINI ACTIVE CLOUD AGENT ---
  try {
    const ai = getGeminiClient();

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

    const addTimetableSlotTool: FunctionDeclaration = {
      name: 'addTimetableSlot',
      description: 'Add a new scheduled class slot to the university timetable database',
      parameters: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.STRING, description: 'Day of week e.g. Monday' },
          timeSlot: { type: Type.STRING, description: 'Time range e.g. 09:00 AM - 10:00 AM' },
          subjectCode: { type: Type.STRING, description: 'Subject code e.g. CS501' },
          subjectName: { type: Type.STRING, description: 'Subject title e.g. Computer Networks' },
          department: { type: Type.STRING, description: 'Department' },
          year: { type: Type.INTEGER, description: 'Year 1-4' },
          section: { type: Type.STRING, description: 'Section A, B, C' },
          room: { type: Type.STRING, description: 'Room or Lab number' }
        },
        required: ['day', 'timeSlot', 'subjectCode', 'subjectName']
      }
    };

    const enrollStudentTool: FunctionDeclaration = {
      name: 'enrollStudent',
      description: 'Enroll and register a new student into the university attendance database',
      parameters: {
        type: Type.OBJECT,
        properties: {
          usn: { type: Type.STRING, description: 'Student University Serial Number (USN)' },
          name: { type: Type.STRING, description: 'Full student name' },
          department: { type: Type.STRING, description: 'Department' },
          year: { type: Type.INTEGER, description: 'Year 1-4' },
          section: { type: Type.STRING, description: 'Section' }
        },
        required: ['usn', 'name']
      }
    };

    const queryRecordsTool: FunctionDeclaration = {
      name: 'queryRecords',
      description: 'Search or filter student attendance rosters based on constraints (e.g. attendance < 75%)',
      parameters: {
        type: Type.OBJECT,
        properties: {
          filterType: { type: Type.STRING, description: 'The type of search, e.g. "low_attendance", "by_section"' },
          section: { type: Type.STRING, description: 'Specific section, e.g. A' },
          percentageThreshold: { type: Type.INTEGER, description: 'Threshold percentage e.g. 75 or 80' }
        }
      }
    };

    const redirectPageTool: FunctionDeclaration = {
      name: 'redirectPage',
      description: 'Request the UI to navigate to a specified page/tab',
      parameters: {
        type: Type.OBJECT,
        properties: {
          pageName: {
            type: Type.STRING,
            description: 'Target page: dashboard, verification, explorer, resources, class-selection'
          }
        },
        required: ['pageName']
      }
    };

    const systemInstruction =
      "You are Alpine, the AI Assistant for the Smart Attendance System.\n" +
      "You have direct database execution capabilities to add timetable slots, enroll students, create and activate sessions, search attendance records, and navigate the UI.\n" +
      "Always execute actions via tool calls when requested and present results clearly.";

    const contents: any[] = [];
    history.forEach((h: any) => {
      contents.push({
        role: h.sender === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      });
    });
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [createSectionTool, activateSessionTool, cancelSessionTool, addTimetableSlotTool, enrollStudentTool, queryRecordsTool, redirectPageTool] }]
      }
    });

    let botResponseText = response.text || '';
    let actionCard: any = null;

    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      const args = call.args as any;

      if (call.name === 'addTimetableSlot') {
        const entry = {
          day: args.day,
          time_slot: args.timeSlot,
          subject_code: args.subjectCode,
          subject_name: args.subjectName,
          lecturer_email: lecturerEmail,
          lecturer_name: 'Faculty Incharge',
          department: args.department || 'Computer Science (CSE)',
          course: 'B.E.',
          year: args.year || 3,
          section: args.section || 'A',
          room: args.room || 'Room 301'
        };
        dao.insertTimetableEntry(entry);
        actionCard = {
          type: 'timetable_added',
          title: 'Timetable Slot Scheduled',
          description: `Scheduled ${entry.subject_code} (${entry.day} ${entry.time_slot}) in ${entry.room}.`,
          data: entry
        };
        botResponseText = `Successfully scheduled **${entry.subject_code} (${entry.subject_name})** on **${entry.day} ${entry.time_slot}** in **${entry.room}** for ${entry.department} Section ${entry.section}.`;
      } else if (call.name === 'enrollStudent') {
        const student = {
          usn: args.usn.toUpperCase(),
          name: args.name,
          department: args.department || 'Computer Science (CSE)',
          year: args.year || 3,
          section: args.section || 'A',
          course: 'B.E.',
          attendanceRate: 90,
          roll_number: args.usn.slice(-3),
          onboarded_at: new Date().toISOString()
        };
        dao.upsertStudent(student);
        actionCard = {
          type: 'student_enrolled',
          title: 'Student Enrolled',
          description: `Enrolled ${student.name} (${student.usn}) in Section ${student.section}.`,
          data: student
        };
        botResponseText = `Enrolled **${student.name} (${student.usn})** into the university roster.`;
      } else if (call.name === 'createSection') {
        const newSession = {
          id: `sess_${Math.random().toString(36).substr(2, 9)}`,
          subject_code: args.subjectCode || 'CS501',
          subject_name: args.subjectName || 'Computer Architecture',
          department: args.department || 'Computer Science (CSE)',
          course: args.course || 'B.E.',
          year: args.year || 3,
          section: args.section || 'A',
          otp: '',
          status: 'DRAFT',
          created_at: new Date().toISOString(),
          expires_at: '',
          marked_count: 0,
          expected_count: 60,
          verification_option: '',
          lecturer_email: lecturerEmail,
          timeline: args.timeline || '10:00 AM - 11:00 AM'
        };
        dao.insertSession(newSession);
        actionCard = {
          type: 'section_created',
          title: 'Section Initialized',
          description: `Draft section for ${newSession.subject_code} ${newSession.subject_name}.`,
          data: newSession
        };
        botResponseText = `Created draft session for **${newSession.subject_code} (${newSession.subject_name})**.`;
      } else if (call.name === 'activateSession') {
        const inputCode = (args.subjectCode || '').toUpperCase();
        let found = db.prepare('SELECT * FROM sessions WHERE (UPPER(subject_code) = ? OR id = ?) AND lecturer_email = ?').get(inputCode, args.subjectCode, lecturerEmail) as any;
        if (!found) found = db.prepare('SELECT * FROM sessions WHERE lecturer_email = ? LIMIT 1').get(lecturerEmail) as any;

        if (found) {
          const freshOtp = Math.floor(1000 + Math.random() * 9000).toString();
          const freshOption = getRandomVerificationOption();
          db.prepare("UPDATE sessions SET status = 'ACTIVE', otp = ?, verification_option = ?, created_at = ?, marked_count = 0 WHERE id = ?")
            .run(freshOtp, freshOption, new Date().toISOString(), found.id);
          found = dao.getSessionById(found.id);
          actionCard = {
            type: 'session_activated',
            title: 'Session Live',
            description: `Activated with OTP ${found.otp}.`,
            data: found
          };
          botResponseText = `Activated session **${found.subject_code}** with OTP **${found.otp}** and shape **${found.verification_option}**.`;
        }
      } else if (call.name === 'cancelSession') {
        const inputCode = (args.subjectCode || '').toUpperCase();
        let found = db.prepare("SELECT * FROM sessions WHERE (status = 'ACTIVE' OR UPPER(subject_code) = ?) AND lecturer_email = ?").get(inputCode, lecturerEmail) as any;
        if (found) {
          dao.updateSessionStatus(found.id, 'INACTIVE');
          actionCard = {
            type: 'session_cancelled',
            title: 'Session Closed',
            description: `Closed ${found.subject_code}.`,
            data: found
          };
          botResponseText = `Closed attendance session for **${found.subject_code}**.`;
        }
      } else if (call.name === 'queryRecords') {
        const threshold = args.percentageThreshold || 75;
        const lowRoster = dao.getStudentsBelowThreshold(threshold);
        actionCard = {
          type: 'query_result',
          title: `Students Below ${threshold}%`,
          description: `Found ${lowRoster.length} students.`,
          data: lowRoster
        };
        botResponseText = `Found ${lowRoster.length} students below ${threshold}% attendance.`;
      } else if (call.name === 'redirectPage') {
        actionCard = {
          type: 'redirect',
          title: 'Navigate',
          description: `Navigating to ${args.pageName}`,
          data: { pageName: args.pageName }
        };
        botResponseText = `Navigating to **${args.pageName}**!`;
      }
    }

    res.json({ text: botResponseText || 'Processed successfully.', actionCard });
  } catch (error: any) {
    console.error('Gemini error:', error);
    res.status(500).json({ error: error.message || 'Error processing request' });
  }
}
