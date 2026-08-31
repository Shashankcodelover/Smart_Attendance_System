import React, { useState, useEffect } from 'react';
import TopAppBar from './components/TopAppBar';
import ClassSelectionView from './components/ClassSelectionView';
import LecturerDashboardView from './components/LecturerDashboardView';
import VerificationSessionView from './components/VerificationSessionView';
import AIDataExplorerView from './components/AIDataExplorerView';
import EnterprisePortalGateway from './components/EnterprisePortalGateway';
import TourGuide from './components/TourGuide';
import UserProfileView from './components/UserProfileView';
import ManualSpreadsheetView from './components/ManualSpreadsheetView';
import AgentBotModal from './components/AgentBotModal';
import OnboardingAuthModal from './components/OnboardingAuthModal';
import { Session, AttendanceRecord, Student } from './types';

export default function LecturerApp() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('sjce_auth_session_lecturer') !== null || localStorage.getItem('sjce_auth_session_admin') !== null;
  });
  const [currentDepartment, setCurrentDepartment] = useState<'lecturer' | 'admin'>(() => {
    if (localStorage.getItem('sjce_auth_session_admin')) return 'admin';
    return 'lecturer';
  });
  const [currentUser, setCurrentUser] = useState<{ codeOrUsn: string; name: string } | null>(() => {
    const saved = localStorage.getItem('sjce_auth_session_lecturer') || localStorage.getItem('sjce_auth_session_admin');
    return saved ? JSON.parse(saved) : null;
  });
  const [isOffline, setIsOffline] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [excelFilter, setExcelFilter] = useState<{
    course?: string;
    department?: string;
    year?: number;
    section?: string;
  } | null>(null);

  // Floating Spark Agent Modal Pop-up State
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentDialog, setAgentDialog] = useState<{ sender: 'agent'|'lecturer'; text: string; actionCard?: any }[]>([
    { sender: 'agent', text: 'Hello! I am Alpine, your smart classroom assistant. Use me to handle your work in a smarter way. How can I help you today?' }
  ]);
  const [agentLoading, setAgentLoading] = useState(false);

  // State to handle step-by-step setup questionnaire conversing with Alpine
  const [sessionSetupState, setSessionSetupState] = useState<{
    step: 'idle' | 'dept' | 'course' | 'year' | 'section' | 'code' | 'name' | 'timeline';
    department?: string;
    course?: string;
    year?: number;
    section?: string;
    subjectCode?: string;
    subjectName?: string;
  }>({ step: 'idle' });

  // Admin student builder state
  const [newUsn, setNewUsn] = useState('');
  const [newName, setNewName] = useState('');
  const [newRate, setNewRate] = useState('85');
  const [adminSearch, setAdminSearch] = useState('');

  // Initial tab loading based on URL parameter (?role=admin)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get('role');
    if (roleParam === 'admin') {
      setCurrentDepartment('admin');
      setCurrentPage('admin-dashboard');
    } else if (isLoggedIn) {
      if (currentDepartment === 'admin') {
        setCurrentPage('admin-dashboard');
      } else {
        setCurrentPage('dashboard');
      }
    }
  }, []);

  // Automatic online/offline network detection for lecturer terminal
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setToast({
        type: 'success',
        text: '🌐 Connection restored! Re-syncing lecturer console...'
      });
      setTimeout(() => setToast(null), 3000);
      refreshData();
    };

    const handleOffline = () => {
      setIsOffline(true);
      setToast({
        type: 'error',
        text: '📶 Connection lost. Operating in local buffer mode.'
      });
      setTimeout(() => setToast(null), 3000);
    };

    setIsOffline(!navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync sessions, rosters, records
  const refreshData = async () => {
    try {
      const email = currentUser?.codeOrUsn || 'admin@sjce.edu';
      const token = localStorage.getItem('sjce_auth_token_lecturer') || localStorage.getItem('sjce_auth_token_admin');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : undefined;
      const sRes = await fetch(`/api/sessions?lecturer=${encodeURIComponent(email)}`, { headers });
      const sData = await sRes.json();
      setSessions(sData);

      const aRes = await fetch('/api/attendance/records', { headers });
      const aData = await aRes.json();
      setAttendanceRecords(aData);

      const stdRes = await fetch('/api/students', { headers });
      const stdData = await stdRes.json();
      setStudents(stdData);
    } catch (e) {
      console.error('Server offline or database error:', e);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      refreshData();
    }
  }, [isLoggedIn, currentUser]);

  // Poll for live student check-ins when verification is active
  useEffect(() => {
    if (currentPage !== 'verification' || isOffline) return;

    const interval = setInterval(async () => {
      try {
        const aRes = await fetch('/api/attendance/records');
        const aData = await aRes.json();
        setAttendanceRecords(aData);
      } catch (err) {
        console.warn('Poll gate error (swallowed safely):', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [currentPage, isOffline]);

  // Handle Sign-In Handshake callback
  const handleAuthorizeHandshake = (
    chosenPersona: 'lecturer' | 'student', 
    chosenDept: 'student' | 'lecturer' | 'admin', 
    creds: { codeOrUsn: string; name: string }
  ) => {
    setCurrentUser(creds);
    setCurrentDepartment(chosenDept === 'admin' ? 'admin' : 'lecturer');
    setIsLoggedIn(true);
    
    if (chosenDept === 'admin') {
      localStorage.setItem('sjce_auth_session_admin', JSON.stringify(creds));
      localStorage.removeItem('sjce_auth_session_lecturer');
      localStorage.removeItem('sjce_auth_session_student');
      setCurrentPage('admin-dashboard');
    } else {
      localStorage.setItem('sjce_auth_session_lecturer', JSON.stringify(creds));
      localStorage.removeItem('sjce_auth_session_admin');
      localStorage.removeItem('sjce_auth_session_student');
      setCurrentPage('dashboard');
    }

    setToast({
      type: 'success',
      text: `🔐 Handshake successful! Welcome, ${creds.name} to the SJCE server console.`
    });
    setTimeout(() => setToast(null), 3000);
  };

  // Add a registered student persistently (Admin Desk Roster Builder)
  const handleAdminAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsn || !newName) {
      setToast({ type: 'error', text: 'Enter valid USN and Full name candidate metrics.' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const brandNew = {
      usn: newUsn.trim().toUpperCase(),
      name: newName.trim(),
      attendanceRate: parseInt(newRate) || 85,
      courseCode: 'CSE',
      section: 'A',
      year: 3,
      avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCsS2vxOIaM2BrLX4x3_2iLEWmOUrv2hhDoR8M9Qgy5A_o9C2txbUXSB70pLFes9PN2zZ7yXtYi96xzJFwrEXpMW0VB-mC8OnFqU-L9Sh4OAUGlzQ1c9J68oM9AJ9hSm3KQSojZvB3tPSACQwmlT60yl7xsLOWdf7JEYfA_Chzi7MRdBgDGfPjYJqy_L3Wg6qi4YVqZqdbfODNHHMCuygZtfjl-WE13UuG1bXVQp8VCvGG5WXMGJy9lsVVYGaaCijpx6kZ8jVPpjy32'
    };

    try {
      const token = localStorage.getItem('sjce_auth_token_lecturer') || localStorage.getItem('sjce_auth_token_admin');
      const response = await fetch('/api/students', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify(brandNew)
      });
      const data = await response.json();
      if (data.success) {
        refreshData();
        setNewUsn('');
        setNewName('');
        setToast({
          type: 'success',
          text: `✓ Registered student ${brandNew.name} (${brandNew.usn}) under registrar bureau DB.`
        });
      } else {
        setToast({ type: 'error', text: 'Failed to register student.' });
      }
    } catch (err) {
      console.error(err);
      setToast({ type: 'error', text: 'Network error registering student.' });
    }
    setTimeout(() => setToast(null), 3000);
  };

  // Agent Natural query routing chat proxy
  const handleAgentChatSend = async (customPrompt?: string) => {
    const text = (customPrompt || agentPrompt).trim();
    if (!text) return;
    if (!customPrompt) setAgentPrompt('');

    setAgentDialog(prev => [...prev, { sender: 'lecturer', text }]);

    const normalizedText = text.toLowerCase();
    const isBulkIntent = 
      (normalizedText.includes('create') || normalizedText.includes('generate') || normalizedText.includes('spawn')) &&
      (normalizedText.includes('bulk') || normalizedText.includes('batch') || normalizedText.includes('all folders') || normalizedText.includes('all sections') || normalizedText.includes('all years'));

    if (isBulkIntent) {
      setAgentLoading(true);
      setAgentDialog(prev => [...prev, {
        sender: 'agent',
        text: '⚙️ Spawning dynamic year folder matrices for B.E. Years 1-4 and Sections A-D (max capacity 70 students per class)...'
      }]);

      try {
        const token = localStorage.getItem('sjce_auth_token_lecturer') || localStorage.getItem('sjce_auth_token_admin');
        const response = await fetch('/api/sessions/batch-create', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          body: JSON.stringify({
            lecturerEmail: currentUser?.codeOrUsn || 'admin@sjce.edu',
            course: 'B.E.',
            department: 'Computer Science (CSE)',
            years: [1, 2, 3, 4],
            sections: ['A', 'B', 'C', 'D'],
            strength: 70
          })
        });
        const data = await response.json();
        if (data.success) {
          await refreshData();
          setAgentDialog(prev => [...prev, {
            sender: 'agent',
            text: '✓ Success! Batch structures generated. I have provisioned 16 class section folders for B.E. (Years 1, 2, 3, 4 with Sections A, B, C, D) under your lecturer profile. Check your dashboard folders!'
          }]);
        } else {
          throw new Error('Server reject');
        }
      } catch (e) {
        setAgentDialog(prev => [...prev, {
          sender: 'agent',
          text: '❌ Error: Failed to generate batch folder database structures.'
        }]);
      } finally {
        setAgentLoading(false);
      }
      return;
    }

    // Intercept step-by-step session setup flow
    if (text.toLowerCase() === 'create section' || text.toLowerCase() === 'create session' || text.toLowerCase().includes('setup class') || text.toLowerCase().includes('create section with alpine')) {
      setSessionSetupState({ step: 'dept' });
      setAgentDialog(prev => [...prev, {
        sender: 'agent',
        text: "Great! Let's set up a new class session step-by-step. First, which department is this session for? (e.g. Computer Science (CSE), Electronics (ECE))"
      }]);
      return;
    }

    if (sessionSetupState.step !== 'idle') {
      const currentStep = sessionSetupState.step;
      if (currentStep === 'dept') {
        setSessionSetupState(prev => ({ ...prev, step: 'course', department: text }));
        setAgentDialog(prev => [...prev, {
          sender: 'agent',
          text: `Got it: ${text}. Next, what is the course degree? (e.g., B.E., M.Tech, MCA)`
        }]);
      } else if (currentStep === 'course') {
        setSessionSetupState(prev => ({ ...prev, step: 'year', course: text }));
        setAgentDialog(prev => [...prev, {
          sender: 'agent',
          text: `Understood: ${text}. Which academic year is this? (Enter a number: 1, 2, 3, or 4)`
        }]);
      } else if (currentStep === 'year') {
        const yr = parseInt(text) || 3;
        setSessionSetupState(prev => ({ ...prev, step: 'section', year: yr }));
        setAgentDialog(prev => [...prev, {
          sender: 'agent',
          text: `Year: ${yr}. Which section group? (e.g., A, B, C)`
        }]);
      } else if (currentStep === 'section') {
        setSessionSetupState(prev => ({ ...prev, step: 'code', section: text }));
        setAgentDialog(prev => [...prev, {
          sender: 'agent',
          text: `Section: ${text}. Please enter the Subject Code (e.g., CS501, CS301):`
        }]);
      } else if (currentStep === 'code') {
        setSessionSetupState(prev => ({ ...prev, step: 'name', subjectCode: text }));
        setAgentDialog(prev => [...prev, {
          sender: 'agent',
          text: `Code: ${text}. Next, what is the Subject Name? (e.g., Computer Architecture):`
        }]);
      } else if (currentStep === 'name') {
        setSessionSetupState(prev => ({ ...prev, step: 'timeline', subjectName: text }));
        setAgentDialog(prev => [...prev, {
          sender: 'agent',
          text: `Subject Name: "${text}". Finally, what is the timeline / timing for this lecture? (e.g., 09:00 AM - 10:00 AM, 11:30 AM - 01:00 PM):`
        }]);
      } else if (currentStep === 'timeline') {
        const completedData = {
          department: sessionSetupState.department || 'Computer Science (CSE)',
          course: sessionSetupState.course || 'B.E.',
          year: sessionSetupState.year || 3,
          section: sessionSetupState.section || 'A',
          subjectCode: sessionSetupState.subjectCode || 'CS501',
          subjectName: sessionSetupState.subjectName || 'Computer Architecture',
          timeline: text
        };

        setSessionSetupState({ step: 'idle' });
        setAgentLoading(true);

        try {
          const token = localStorage.getItem('sjce_auth_token_lecturer') || localStorage.getItem('sjce_auth_token_admin');
          const r = await fetch('/api/sessions/create', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify({
              ...completedData,
              status: 'READY',
              lecturerEmail: currentUser?.codeOrUsn || 'admin@sjce.edu'
            }),
          });
          const d = await r.json();
          if (d.success) {
            refreshData();
            
            // Build conversational action card with control buttons
            const actionCard = {
              type: 'session_action_card',
              title: `Class Created: ${completedData.subjectCode}`,
              description: `Session for ${completedData.subjectName} (${completedData.timeline}) has been initialized. Tap the controls below to configure broadcast.`,
              data: d.session
            };

            setAgentDialog(prev => [...prev, {
              sender: 'agent',
              text: `✓ Success! I have successfully created the session roster for ${completedData.subjectCode} - ${completedData.subjectName} (${completedData.timeline}).`,
              actionCard
            }]);
          } else {
            throw new Error('Server reject');
          }
        } catch {
          setAgentDialog(prev => [...prev, {
            sender: 'agent',
            text: '❌ Error: Failed to save session parameters. Try again.'
          }]);
        } finally {
          setAgentLoading(false);
        }
      }
      return;
    }

    setAgentLoading(true);

    try {
      const token = localStorage.getItem('sjce_auth_token_lecturer') || localStorage.getItem('sjce_auth_token_admin');
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ 
          message: text, 
          history: [],
          lecturerEmail: currentUser?.codeOrUsn || 'admin@sjce.edu'
        })
      });
      const data = await response.json();
      
      let cleanText = data.text || 'Command processed.';
      cleanText = cleanText.replace(/Stitch AI/g, 'Alpine').replace(/Stitch Spark/g, 'Alpine');

      setAgentDialog(prev => [...prev, { 
        sender: 'agent', 
        text: cleanText,
        actionCard: data.actionCard 
      }]);
      
      // Refresh the database and dashboard models
      await refreshData();

      // Check for specialized agent actionCards in payload
      if (data.actionCard) {
        const { type, data: cardData } = data.actionCard;
        if (type === 'redirect' && cardData?.pageName) {
          setCurrentPage(cardData.pageName);
        } else if (type === 'session_activated') {
          setCurrentPage('verification');
          setToast({
            type: 'success',
            text: `⚡ Live Broadcasting: session ${cardData?.subjectCode || ''} activated by Alpine.`
          });
          setTimeout(() => setToast(null), 3000);
        } else if (type === 'section_created') {
          setCurrentPage('dashboard');
          setToast({
            type: 'success',
            text: `✓ Section created successfully: draft generated by Alpine.`
          });
          setTimeout(() => setToast(null), 3000);
        } else if (type === 'session_cancelled') {
          setCurrentPage('dashboard');
          setToast({
            type: 'info',
            text: `Locked: session gates sealed by Alpine.`
          });
          setTimeout(() => setToast(null), 3000);
        } else if (type === 'query_result') {
          // If we queried records, automatically redirect to explorer page so the lecturer can inspect the results!
          setCurrentPage('explorer');
        }
      }
    } catch {
      setAgentDialog(prev => [...prev, { sender: 'agent', text: 'Processed locally: offline triggers activated.' }]);
    } finally {
      setAgentLoading(false);
    }
  };

  // Create a draft session with custom parameters
  const handleCreateSession = async (sessionData: {
    department: string;
    course: string;
    year: number;
    section: string;
    subjectCode: string;
    subjectName: string;
    timeline: string;
  }) => {
    try {
      const token = localStorage.getItem('sjce_auth_token_lecturer') || localStorage.getItem('sjce_auth_token_admin');
      const r = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          ...sessionData,
          status: 'READY',
          lecturerEmail: currentUser?.codeOrUsn || 'admin@sjce.edu'
        }),
      });
      const d = await r.json();
      if (d.success) {
        refreshData();
        setCurrentPage('dashboard');
        setToast({
          type: 'success',
          text: `Section initialized! Pre-planned slot added for ${sessionData.subjectCode} under daily agenda.`,
        });
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setToast({ type: 'error', text: 'Error spawning session.' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Delete/cancel session
  const handleDeleteSession = async (sessionId: string) => {
    try {
      const r = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      const d = await r.json();
      if (d.success) {
        refreshData();
        setToast({
          type: 'info',
          text: '✓ Attendance session has been cancelled and deleted from the database.',
        });
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setToast({ type: 'error', text: 'Error deleting session.' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Activate session
  const handleActivateSession = async (sessionId: string) => {
    try {
      const token = localStorage.getItem('sjce_auth_token_lecturer') || localStorage.getItem('sjce_auth_token_admin');
      const r = await fetch('/api/sessions/activate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ sessionId }),
      });
      const d = await r.json();
      if (d.success) {
        refreshData();
        setCurrentPage('verification');
        setToast({
          type: 'success',
          text: 'Gate Opened! Live QR-OTP matching sequence actively broadcasting.',
        });
        setTimeout(() => setToast(null), 3500);
      }
    } catch {
      setToast({ type: 'error', text: 'Signal error. Could not open gate.' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Close attendance session
  const handleCloseSession = async (sessionId: string) => {
    try {
      const token = localStorage.getItem('sjce_auth_token_lecturer') || localStorage.getItem('sjce_auth_token_admin');
      const r = await fetch('/api/sessions/cancel', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ sessionId }),
      });
      const d = await r.json();
      if (d.success) {
        refreshData();
        setCurrentPage('dashboard');
        setToast({
          type: 'info',
          text: 'Attendance closed. Secured handshake records locked for registrar review.',
        });
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setToast({ type: 'error', text: 'Database error sealing session.' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Reopen closed session (grace period)
  const handleReopenSession = async (sessionId: string) => {
    try {
      const token = localStorage.getItem('sjce_auth_token_lecturer') || localStorage.getItem('sjce_auth_token_admin');
      const r = await fetch('/api/sessions/reopen', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ sessionId }),
      });
      const d = await r.json();
      if (d.success) {
        refreshData();
        setCurrentPage('verification');
        setToast({
          type: 'success',
          text: '✓ Attendance Gate Reopened! Grace period active for late arrivals.',
        });
        setTimeout(() => setToast(null), 3500);
      }
    } catch {
      setToast({ type: 'error', text: 'Error reopening session.' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Toggle Manual Attendance (Spreadsheet grid override controller)
  const handleToggleManualAttendance = async (sessionId: string, studentUsn: string, present: boolean) => {
    try {
      const response = await fetch('/api/attendance/toggle-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, studentUsn, present })
      });
      const data = await response.json();
      if (data.success) {
        await refreshData();
        setToast({ type: 'success', text: `✓ Attendance updated for ${studentUsn}` });
        setTimeout(() => setToast(null), 3000);
      } else {
        throw new Error(data.error || 'Failed to toggle manual attendance.');
      }
    } catch (err: any) {
      setToast({ type: 'error', text: err?.message || 'Error updating attendance override.' });
      setTimeout(() => setToast(null), 3000);
      throw err;
    }
  };

  // Upload parsed PDF/image Timetable to generate slot folders
  const handleUploadTimetable = async (fileBase64: string, mimeType: string) => {
    try {
      const response = await fetch('/api/ai/parse-timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64,
          mimeType,
          lecturerEmail: currentUser?.codeOrUsn || 'admin@sjce.edu'
        })
      });
      const data = await response.json();
      if (data.success) {
        await refreshData();
        setToast({
          type: 'success',
          text: '✓ Timetable parsed! Academic course folders initialized.'
        });
        setTimeout(() => setToast(null), 3000);
      } else {
        throw new Error(data.error || 'Failed to parse timetable file.');
      }
    } catch (err: any) {
      setToast({ type: 'error', text: err?.message || 'AI parsing error.' });
      setTimeout(() => setToast(null), 3000);
      throw err;
    }
  };

  const activeSession = sessions.find((s) => s.status === 'ACTIVE') || null;

  if (!isLoggedIn) {
    return <EnterprisePortalGateway onAuthorize={handleAuthorizeHandshake} students={students} />;
  }

  const tourSteps = [
    {
      selector: 'body',
      title: 'Welcome, Professor!',
      description: 'Welcome to the SJCE Smart Attendance Lecturer Console. Let\'s take a quick 1-minute tour to walk through the dashboard controls.',
      placement: 'center' as const,
    },
    {
      selector: '[data-tour="setup-card"], [data-tour="section-plans"]',
      title: 'Roster Welcome Dashboard',
      description: 'When logging in with a new credential, you start with a clean welcoming dashboard. You can create your first section or class session here.',
      placement: 'bottom' as const,
    },
    {
      selector: '[data-tour="dashboard-nav"]',
      title: 'Administrative Console Navigation',
      description: 'Use the bottom navigation rail to switch views. This button returns you to your main dashboard console.',
      placement: 'top' as const,
    },
    {
      selector: '[data-tour="live-gate"]',
      title: 'Live Gate Broadcasting',
      description: 'Tap Live Gate to project dynamic 30s rotating OTP PINs and color challenge shapes for student check-ins.',
      placement: 'top' as const,
    },
    {
      selector: '[data-tour="alpine-trigger"]',
      title: 'Alpine AI Smart Assistant',
      description: 'Meet Alpine, your smart classroom companion! Tap here to chat with Alpine and set up sessions, activate codes, search metrics, or sync records.',
      placement: 'top' as const,
    },
    {
      selector: '[data-tour="profile-nav"]',
      title: 'Staff Profile Settings',
      description: 'Manage your personal profile details, set academic designations, and reset this guided feature tour at any time.',
      placement: 'top' as const,
    }
  ];

  return (
    <div className="min-h-screen flex flex-col font-sans select-none antialiased bg-gray-50/50">
      <TourGuide steps={tourSteps} tourKey="sjce_tour_completed_lecturer" />
      {/* Staff App Bar */}
      <TopAppBar
        persona="lecturer"
        setPersona={() => {}}
        isOffline={isOffline}
        setIsOffline={setIsOffline}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onSync={() => {}}
        pendingOfflineCount={0}
        onBackToGateway={() => {
          localStorage.removeItem('sjce_auth_session_lecturer');
          localStorage.removeItem('sjce_auth_session_admin');
          setIsLoggedIn(false);
          window.location.href = '/';
        }}
      />

      {/* Floating Feedback Toasts */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] max-w-sm border backdrop-blur-xl animate-bounce pointer-events-none">
          <div className={`p-4 rounded-2xl flex items-center gap-3 shadow-lg ${
            toast.type === 'success'
              ? 'bg-[#e8f5e9] border-emerald-200 text-[#1b5e20]'
              : toast.type === 'error'
              ? 'bg-[#ffdad6] border-[#ba1a1a]/15 text-[#ba1a1a]'
              : 'bg-[#e0f7fa] border-cyan-200 text-[#006064]'
          }`}>
            <span className="material-symbols-outlined text-lg">
              {toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'info' : 'cloud_sync'}
            </span>
            <p className="text-xs font-sans font-bold leading-relaxed">{toast.text}</p>
          </div>
        </div>
      )}

      {/* Renders main panels */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-10 py-6 md:py-8">
        <div className="space-y-4">
          {currentPage === 'dashboard' && (
            <LecturerDashboardView
              sessions={sessions}
              attendanceRecords={attendanceRecords}
              onActivate={handleActivateSession}
              onCreateSession={handleCreateSession}
              onDeleteSession={handleDeleteSession}
              onReopen={handleReopenSession}
              onViewHistory={(filter) => {
                setExcelFilter(filter || null);
                setCurrentPage('spreadsheet');
              }}
              onStartSession={() => {
                if (activeSession) {
                  setCurrentPage('verification');
                } else {
                  setToast({ type: 'error', text: 'No active session broadcast found. Please activate a slot first.' });
                  setTimeout(() => setToast(null), 3000);
                }
              }}
              pendingOfflineCount={0}
              lecturerName={currentUser?.name}
              students={students}
              onUploadTimetable={handleUploadTimetable}
            />
          )}

          {currentPage === 'spreadsheet' && (
            <ManualSpreadsheetView
              sessions={sessions}
              students={students}
              attendanceRecords={attendanceRecords}
              onToggleAttendance={handleToggleManualAttendance}
              onBack={() => {
                setExcelFilter(null);
                setCurrentPage('dashboard');
              }}
              defaultFilter={excelFilter || undefined}
            />
          )}

          {currentPage === 'class-selection' && (
            <ClassSelectionView onProceed={handleCreateSession} />
          )}

          {currentPage === 'verification' && (
            <VerificationSessionView
              session={activeSession}
              attendanceRecords={attendanceRecords}
              isOffline={isOffline}
              onDeactivate={handleCloseSession}
              onSyncManual={() => {}}
              pendingOfflineCount={0}
            />
          )}

          {currentPage === 'explorer' && (
            <AIDataExplorerView
              students={students}
              onNavigate={(page) => setCurrentPage(page)}
              onRefreshRoster={refreshData}
            />
          )}

          {currentPage === 'profile' && (
            <UserProfileView
              persona="lecturer"
              currentUser={currentUser}
              onUpdateUser={(updatedCreds) => {
                setCurrentUser(updatedCreds);
                localStorage.setItem('sjce_auth_session_lecturer', JSON.stringify(updatedCreds));
              }}
              onResetTour={() => {
                localStorage.removeItem('sjce_tour_completed_lecturer');
                window.location.reload();
              }}
            />
          )}

          {/* Admin Command Roster views */}
          {currentPage === 'admin-dashboard' && (
            <div className="space-y-6 animate-fade-in text-gray-900">
              <section className="space-y-1">
                <span className="text-[10px] bg-indigo-150 text-indigo-800 px-2.5 py-1 rounded-full font-sans font-black tracking-widest uppercase">
                  UNIVERSITY REGISTRAR SEAT
                </span>
                <h2 className="text-2xl md:text-3xl font-display font-black tracking-tight leading-none mt-1.5">
                  Registrar Bureau Terminal
                </h2>
                <p className="text-xs md:text-sm text-[#494454] mt-0.5">
                  Search Student directory ledger databases, enroll fresh USNs, and review system audit trails.
                </p>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left: Enrollment form */}
                <div className="lg:col-span-5 bg-white border border-[#cbc3d7]/30 rounded-2xl p-6 shadow-sm space-y-5">
                  <h3 className="text-xs font-sans font-black tracking-widest text-[#7b7486] uppercase">
                    Enroll Candidate USN
                  </h3>

                  <form onSubmit={handleAdminAddStudent} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-sans font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Candidate USN Identifier Choice
                      </label>
                      <input
                        type="text"
                        value={newUsn}
                        onChange={(e) => setNewUsn(e.target.value)}
                        placeholder="e.g. 4SJ21CS088"
                        className="w-full p-3 rounded-xl border border-[#cbc3d7]/50 bg-white font-mono text-xs focus:ring-1 focus:ring-indigo-300 outline-none text-[#191c1e]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-sans font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Student Complete Name
                      </label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. Rajashree Hegde"
                        className="w-full p-3 rounded-xl border border-[#cbc3d7]/50 bg-white font-sans text-xs focus:ring-1 focus:ring-indigo-300 outline-none text-[#191c1e]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-sans font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Initial Attendance Quotient (%)
                      </label>
                      <select
                        value={newRate}
                        onChange={(e) => setNewRate(e.target.value)}
                        className="w-full p-3 rounded-xl border border-[#cbc3d7]/50 bg-white font-sans text-xs focus:ring-1 focus:ring-indigo-300 outline-none text-[#191c1e] cursor-pointer"
                      >
                        <option value="95">95% (Excellent Tier)</option>
                        <option value="85">85% (Optimized Roster)</option>
                        <option value="72">72% (Shortage Warning Alert)</option>
                        <option value="60">60% (Severe Deficiency)</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 bg-indigo-700 hover:bg-indigo-800 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer"
                    >
                      ✓ Add Candidate To DB
                    </button>
                  </form>

                  <div className="bg-amber-50/55 p-3.5 rounded-xl border border-amber-250 text-[11px] text-amber-900 leading-relaxed font-sans">
                    ⚠️ **Registrar Safeguard**: Newly created USN identities can instantly scan and verify their attendance tokens both online and inside the local buffer queue.
                  </div>
                </div>

                {/* Right: Roster database grid */}
                <div className="lg:col-span-7 bg-white border border-[#cbc3d7]/30 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col min-h-[380px]">
                  <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-gray-100">
                    <h3 className="text-xs font-sans font-black tracking-widest text-[#7b7486] uppercase inline-block">
                      University Student Roster ({students.length} Total)
                    </h3>
                    
                    <input
                      type="text"
                      placeholder="Search roster..."
                      value={adminSearch}
                      onChange={(e) => setAdminSearch(e.target.value)}
                      className="p-2 border border-gray-200 rounded-lg text-xs font-sans outline-none w-40"
                    />
                  </div>

                  <div className="overflow-y-auto flex-1 max-h-[300px]">
                    <table className="w-full text-left font-sans text-xs">
                      <thead className="bg-gray-50 text-[9px] font-black uppercase tracking-wider text-gray-500">
                        <tr>
                          <th className="p-3">Candidate</th>
                          <th className="p-3">USN Code</th>
                          <th className="p-3 text-right">Quota Metric</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {students
                          .filter(s => s.name.toLowerCase().includes(adminSearch.toLowerCase()) || s.usn.toLowerCase().includes(adminSearch.toLowerCase()))
                          .map((st) => (
                            <tr key={st.usn} className="hover:bg-gray-50/50 transition-colors">
                              <td className="p-3 font-semibold flex items-center gap-2">
                                <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center font-display font-bold text-[9px]">
                                  {st.name.substring(0, 2).toUpperCase()}
                                </div>
                                {st.name}
                              </td>
                              <td className="p-3 font-mono text-[10px] text-gray-500">{st.usn}</td>
                              <td className="p-3 text-right">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  st.attendanceRate < 75 
                                    ? 'bg-red-50 text-red-700 border border-red-150' 
                                    : 'bg-green-50 text-green-700 border border-green-150'
                                }`}>
                                  {st.attendanceRate}%
                                </span>
                              </td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      </main>

      {/* Alpine AI float triggers */}
      {currentDepartment === 'lecturer' && (
        <div className="fixed bottom-[5.5rem] right-4 md:right-8 z-[100] flex flex-col items-end">
          <button
            type="button"
            data-tour="alpine-trigger"
            onClick={() => setAgentOpen(!agentOpen)}
            className="h-12 px-4 rounded-full bg-indigo-700 text-white shadow-xl hover:bg-indigo-800 transition-all active:scale-95 flex items-center gap-2 font-semibold font-sans text-xs border border-white/20 select-none cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] animate-pulse">smart_toy</span>
            <span>Alpine Assistant ✦</span>
          </button>

          {agentOpen && (
            <div className="w-[calc(100vw-2rem)] md:w-96 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 mt-3 space-y-3 flex flex-col font-sans mb-1 select-none max-h-[75vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-indigo-700">smart_toy</span>
                  <span className="text-xs font-black uppercase text-gray-800 tracking-wider">Alpine Assistant</span>
                </div>
                <button 
                  type="button"
                  onClick={() => setAgentOpen(false)} 
                  className="material-symbols-outlined text-lg text-gray-400 hover:text-gray-600 rounded-full p-1 hover:bg-gray-100 cursor-pointer"
                  title="Close panel"
                >
                  chevron_right
                </button>
              </div>

              <div className="h-56 overflow-y-auto space-y-2.5 pr-1 text-xs custom-scrollbar">
                {agentDialog.map((m, idx) => (
                  <div key={idx} className={`flex flex-col ${m.sender === 'lecturer' ? 'items-end' : 'items-start'}`}>
                    <span className="text-[8px] uppercase font-bold tracking-widest text-[#7b7486] mb-0.5">
                      {m.sender === 'lecturer' ? (currentUser?.name || 'Dr. Aradhya') : 'Alpine'}
                    </span>
                    <div className={`px-3 py-2 rounded-xl leading-relaxed ${
                      m.sender === 'lecturer' 
                        ? 'bg-indigo-700 text-white rounded-tr-none' 
                        : 'bg-gray-100 text-gray-800 rounded-tl-none border border-gray-200/50'
                    }`}>
                      {m.text}
                    </div>

                    {/* Conversational Action Card controls */}
                    {m.actionCard && (
                      <div className="mt-2 p-3 bg-white border border-indigo-100 rounded-xl space-y-2 text-[11px] text-slate-700 shadow-sm max-w-[85%] self-start border-l-4 border-l-[#6b38d4]">
                        <p className="font-display font-extrabold text-[#6b38d4] text-[11px] leading-tight uppercase">
                          {m.actionCard.title}
                        </p>
                        <p className="text-[10px] text-slate-500 leading-normal">{m.actionCard.description}</p>
                        <div className="flex flex-col gap-1 pt-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              handleActivateSession(m.actionCard.data.id);
                              setAgentOpen(false);
                            }}
                            className="w-full py-1.5 bg-[#6b38d4] text-white font-sans font-bold rounded-lg hover:bg-[#8455ef] transition-colors cursor-pointer text-[9px] uppercase tracking-wider text-center"
                          >
                            Activate Live Code & QR
                          </button>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                handleCloseSession(m.actionCard.data.id);
                                setAgentOpen(false);
                              }}
                              className="flex-1 py-1.5 bg-rose-50 text-rose-700 border border-rose-100 font-sans font-bold rounded-lg hover:bg-rose-100 transition-colors cursor-pointer text-[9px] uppercase tracking-wider text-center"
                            >
                              Cancel Section
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentPage('verification');
                                setAgentOpen(false);
                              }}
                              className="flex-1 py-1.5 bg-slate-50 text-slate-700 border border-slate-200 font-sans font-bold rounded-lg hover:bg-slate-100 transition-colors cursor-pointer text-[9px] uppercase tracking-wider text-center"
                            >
                              View List
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                {agentLoading && (
                  <div className="flex items-center gap-1.5 text-[10px] text-indigo-700 animate-pulse font-bold uppercase py-1">
                    <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                    Alpine processing request...
                  </div>
                )}
              </div>

              <div className="space-y-1.5 pt-1.5 border-t border-gray-100">
                <span className="text-[8px] font-black tracking-widest text-gray-400 uppercase block">
                  Quick commands shortcuts
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button 
                    type="button"
                    onClick={() => handleAgentChatSend('create section')} 
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                  >
                    ✦ Setup Class with Alpine
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setAgentOpen(false); setCurrentPage('class-selection'); }} 
                    className="px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                  >
                    ✦ Launch Selection View
                  </button>
                </div>
              </div>

              <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5">
                <input
                  type="text"
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  onKeyPress={(e) => { 
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAgentChatSend(); 
                    }
                  }}
                  placeholder="Ask Alpine to configure sections..."
                  className="w-full bg-transparent border-none outline-none text-xs placeholder:text-gray-400 pb-0.5 text-gray-800"
                />
                <button 
                  type="button"
                  onClick={() => handleAgentChatSend()} 
                  disabled={agentLoading} 
                  className="p-1 text-indigo-700 hover:text-indigo-800 cursor-pointer active:scale-95 transition-all text-xs"
                >
                  <span className="material-symbols-outlined">send</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Navigation Rail */}
      <nav className="sticky bottom-0 left-0 right-0 z-40 bg-white/85 backdrop-blur-md border-t border-[#6b38d4]/10 shadow-[0_-8px_32px_rgba(148,163,184,0.04)] px-4 py-3 pb-safe">
        <div className="max-w-xl mx-auto flex justify-around">
          
          <button
            data-tour="dashboard-nav"
            onClick={() => {
              if (currentDepartment === 'admin') {
                setCurrentPage('admin-dashboard');
              } else {
                setCurrentPage('dashboard');
              }
            }}
            className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${
              currentPage === 'dashboard' || currentPage === 'class-selection' || currentPage === 'admin-dashboard'
                ? 'text-[#6b38d4]'
                : 'text-[#7b7486] hover:text-[#191c1e]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: (currentPage === 'dashboard' || currentPage === 'admin-dashboard') ? "'FILL' 1" : undefined }}>
              {currentDepartment === 'admin' ? 'admin_panel_settings' : 'dashboard'}
            </span>
            <span className="text-[9px] font-sans font-bold tracking-wider uppercase">
              {currentDepartment === 'admin' ? 'Registrar' : 'Dashboard'}
            </span>
          </button>

          {currentDepartment !== 'admin' && (
            <button
              data-tour="live-gate"
              onClick={() => {
                if (activeSession) {
                  setCurrentPage('verification');
                } else {
                  setCurrentPage('class-selection');
                }
              }}
              className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                currentPage === 'verification'
                  ? 'text-[#6b38d4]'
                  : 'text-[#7b7486] hover:text-[#191c1e]'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: currentPage === 'verification' ? "'FILL' 1" : undefined }}>
                nest_remote
              </span>
              <span className="text-[9px] font-sans font-bold tracking-wider uppercase">Live Gate</span>
            </button>
          )}

          <button
            data-tour="alpine-trigger"
            onClick={() => setCurrentPage('explorer')}
            className={`flex flex-col items-center gap-1 cursor-pointer transition-colors relative ${
              currentPage === 'explorer'
                ? 'text-[#6b38d4]'
                : 'text-[#7b7486] hover:text-[#191c1e]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: currentPage === 'explorer' ? "'FILL' 1" : undefined }}>
              smart_toy
            </span>
            <span className="text-[9px] font-sans font-bold tracking-wider uppercase">Alpine</span>
            <span className="absolute top-0 right-1 w-1.5 h-1.5 bg-[#00687a] rounded-full"></span>
          </button>

          <button
            data-tour="profile-nav"
            onClick={() => setCurrentPage('profile')}
            className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${
              currentPage === 'profile'
                ? 'text-[#6b38d4]'
                : 'text-[#7b7486] hover:text-[#191c1e]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: currentPage === 'profile' ? "'FILL' 1" : undefined }}>
              account_circle
            </span>
            <span className="text-[9px] font-sans font-bold tracking-wider uppercase">Profile</span>
          </button>
        </div>
      </nav>

      {/* Floating Interactive BUNKR AI Agent Bot */}
      <AgentBotModal
        userRole="lecturer"
        userEmail={currentUser?.codeOrUsn || 'admin@sjce.edu'}
        userName={currentUser?.name || 'Faculty Member'}
        onRefresh={() => refreshData()}
      />
    </div>
  );
}
