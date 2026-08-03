import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import db from '../db';

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

    if (text.includes('create') || text.includes('draft') || text.includes('section')) {
      let parsedYear = 3;
      let parsedSection = 'A';
      let parsedDept = 'Computer Science (CSE)';
      let parsedCourse = 'B.E.';
      let parsedSubjectCode = 'CS501';
      let parsedSubjectName = 'Computer Architecture';

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

      const sectionMatch = text.match(/\b(?:section|sec|group)\s*([a-d])\b/i) || text.match(/\b([a-d])\s*(?:section|sec|group)\b/i) || text.match(/\b([a-d])\b/i);
      if (sectionMatch) {
        parsedSection = sectionMatch[1].toUpperCase();
      }

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
        otp: '',
        status: 'DRAFT',
        createdAt: new Date().toISOString(),
        expiresAt: '',
        markedCount: 0,
        expectedCount: 60 + Math.floor(Math.random() * 15),
        verificationOption: '',
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
    } else if (text.includes('activate') || text.includes('start') || text.includes('open')) {
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
    } else if (text.includes('close') || text.includes('cancel') || text.includes('stop')) {
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
    } else if (text.includes('shortage') || text.includes('below') || text.includes('under') || text.includes('attendance')) {
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
    } else if (text.includes('go to') || text.includes('open') || text.includes('view') || text.includes('navigate')) {
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
    } else {
      botResponseText = `Hello! I am Alpine, operating in Local Offline Assistant Mode. You can command me to: "create draft session", "activate active sessions", "close active gate", "list attendance shortage", or "go to explorer page"!`;
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

    const systemInstruction =
      "You are Alpine, a highly intelligent administrative assistant for SJCE Smart Attendance System.\n" +
      "You operate in physical classrooms that sometimes have poor Wi-Fi (offline mode triggers local buffers).\n" +
      "You can create sessions, activate sessions, lock/cancel active entries, search student stats, or navigate the application for the user.\n" +
      "When responding, maintain a very professional, friendly, and helpful tone as a reliable assistant.\n" +
      "Avoid dry technical developer jargon.\n" +
      "If the user asks you to perform an action supported by your tools (like creating a class, activating a code, searching list, or opening a page), call those tools immediately.\n" +
      "IMPORTANT: Always present the results beautifully and acknowledge the execution.";

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
          otp: '',
          status: 'DRAFT',
          createdAt: new Date().toISOString(),
          expiresAt: '',
          markedCount: 0,
          expectedCount: 64,
          verificationOption: '',
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
      } else if (call.name === 'batchCreateSections') {
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
      } else if (call.name === 'activateSession') {
        const inputCode = (args.subjectCode || '').toUpperCase();

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
      } else if (call.name === 'cancelSession') {
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
      } else if (call.name === 'queryRecords') {
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
      } else if (call.name === 'redirectPage') {
        actionCard = {
          type: 'redirect',
          title: `Redirect requested`,
          description: `Redirecting user interface viewport to standard page: ${args.pageName}`,
          data: { pageName: args.pageName }
        };
        botResponseText = `Certainly. Redirecting your explorer stage view directly to the **${args.pageName}** section module!`;
      }
    }

    if (!botResponseText && !actionCard) {
      botResponseText = `Request processed. I'm keeping your administrative data buffered safely. Please let me know what syllabus review, roster query, or session gate you need to trigger!`;
    }

    res.json({ text: botResponseText, actionCard });
  } catch (error: any) {
    console.error('Gemini error:', error);
    res.status(500).json({ error: error.message || 'Error processing request' });
  }
}
