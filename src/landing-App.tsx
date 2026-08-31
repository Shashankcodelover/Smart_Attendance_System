import React, { useState, useEffect } from 'react';
import { firebaseAuth } from './services/firebaseService';

export default function LandingApp() {
  const [loadingSplash, setLoadingSplash] = useState(true);
  const [splashFade, setSplashFade] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'student' | 'lecturer' | 'admin'>('student');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  
  const [fullNameInput, setFullNameInput] = useState('');
  const [credentialInput, setCredentialInput] = useState('');
  const [passcode, setPasscode] = useState('');
  const [dbState, setDbState] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Splash Screen timer (1.2s smooth fade)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSplashFade(true);
      const fadeTimer = setTimeout(() => {
        setLoadingSplash(false);
      }, 400);
      return () => clearTimeout(fadeTimer);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  // Reset fields on tab change
  useEffect(() => {
    setErrorMsg(null);
    setFullNameInput('');
    setCredentialInput('');
    setPasscode('');
  }, [activeTab, authMode]);

  const handleRoleClick = (role: 'student' | 'lecturer' | 'admin') => {
    setActiveTab(role);
    setAuthMode('signin');
    setShowModal(true);
  };

  const handleQuickDemoLogin = (role: 'student' | 'lecturer' | 'admin') => {
    let sessionData: any;
    if (role === 'student') {
      sessionData = { codeOrUsn: '4JC21CS001', name: 'Aarav Sharma', role: 'student' };
      localStorage.setItem('sjce_auth_session_student', JSON.stringify(sessionData));
      window.location.href = '/student';
    } else if (role === 'lecturer') {
      sessionData = { codeOrUsn: 'dr.ramesh@sjce.edu', name: 'Dr. Ramesh Kumar', role: 'lecturer' };
      localStorage.setItem('sjce_auth_session_lecturer', JSON.stringify(sessionData));
      window.location.href = '/lecturer';
    } else {
      sessionData = { codeOrUsn: 'admin@sjce.edu', name: 'Admin User', role: 'admin' };
      localStorage.setItem('sjce_auth_session_admin', JSON.stringify(sessionData));
      window.location.href = '/lecturer?role=admin';
    }
  };

  const handleGoBack = () => {
    setShowModal(false);
    setDbState('idle');
    setErrorMsg(null);
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentialInput.trim()) {
      setErrorMsg('Credential input cannot be empty.');
      return;
    }
    if (authMode === 'signup' && activeTab !== 'admin' && !fullNameInput.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    
    setDbState('connecting');
    setErrorMsg(null);

    try {
      if (authMode === 'signup') {
        if (activeTab === 'admin') {
          throw new Error('Administrators must use system presets.');
        }
        
        const user = await firebaseAuth.signUp(
          credentialInput.trim(), 
          passcode, 
          fullNameInput.trim(), 
          activeTab
        );
        
        setDbState('connected');
        const sessionData = { codeOrUsn: user.codeOrUsn, name: user.name, role: activeTab };
        localStorage.setItem(`sjce_auth_session_${activeTab}`, JSON.stringify(sessionData));
        localStorage.removeItem(`sjce_tour_completed_${activeTab}`);
        
        setTimeout(() => {
          window.location.href = `/${activeTab}`;
        }, 400);
      } else {
        const user = await firebaseAuth.signIn(credentialInput.trim(), passcode, activeTab);
        setDbState('connected');
        
        const sessionData = { codeOrUsn: user.codeOrUsn, name: user.name, role: activeTab };
        localStorage.setItem(activeTab === 'admin' ? 'sjce_auth_session_admin' : `sjce_auth_session_${activeTab}`, JSON.stringify(sessionData));
        
        setTimeout(() => {
          window.location.href = activeTab === 'admin' ? '/lecturer?role=admin' : `/${activeTab}`;
        }, 400);
      }
    } catch (err: any) {
      setDbState('idle');
      setErrorMsg(err.message || 'Authentication error.');
    }
  };

  // Splash Screen Render
  if (loadingSplash) {
    return (
      <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0d1117] transition-opacity duration-400 ease-out ${splashFade ? 'opacity-0' : 'opacity-100'}`}>
        <div className="text-center space-y-4 max-w-sm px-6 flex flex-col items-center select-none">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#6b38d4] to-[#8455ef] flex items-center justify-center shadow-lg shadow-[#6b38d4]/30 animate-pulse">
            <span className="material-symbols-outlined text-white text-3xl">school</span>
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-display font-extrabold text-white tracking-tight">
              Smart Attendance System
            </h1>
            <p className="text-xs text-slate-400 font-sans">
              Zero-Trust Dynamic Presence Engine
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans relative overflow-x-hidden flex flex-col justify-between">
      
      {/* Top Navbar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#6b38d4] to-[#8455ef] flex items-center justify-center text-white shadow-xs">
              <span className="material-symbols-outlined text-lg">school</span>
            </div>
            <div>
              <span className="font-display font-bold text-sm text-slate-900 leading-none block">Smart Attendance</span>
              <span className="text-[10px] text-slate-500 font-mono">SJCE &bull; University Gateway</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/50">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
              Live Online
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`flex-1 max-w-6xl w-full mx-auto px-4 py-8 md:py-12 flex flex-col justify-center transition-all duration-300 ${
        showModal ? 'opacity-30 blur-xs pointer-events-none scale-[0.99]' : 'opacity-100'
      }`}>
        
        {/* Clean Hero Title */}
        <div className="text-center space-y-3 max-w-2xl mx-auto mb-10">
          <span className="px-3 py-1 rounded-full bg-[#6b38d4]/10 text-[#6b38d4] text-xs font-bold font-sans uppercase tracking-wider inline-block">
            Presence Verification & Academic Portal
          </span>
          <h1 className="text-3xl md:text-5xl font-display font-extrabold text-slate-900 tracking-tight leading-tight">
            Seamless Attendance for <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6b38d4] to-[#8455ef]">Modern Campuses</span>
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed max-w-lg mx-auto">
            Select your authorized portal to check in to live classes, schedule timetables, and monitor real-time attendance analytics.
          </p>
        </div>

        {/* 3 Clean Modern Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
          
          {/* Card 1: Student Portal */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs hover:shadow-md hover:border-[#6b38d4]/30 transition-all flex flex-col justify-between group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <span className="material-symbols-outlined text-2xl">qr_code_scanner</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-display font-bold text-slate-900">Student Portal</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Scan 5-second dynamic QR codes, track safe bunk buffer trajectories, and submit leave requests.
                </p>
              </div>

              <div className="pt-2 space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-emerald-500 font-bold">check</span>
                  <span>Instant QR / OTP Presence Scan</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-emerald-500 font-bold">check</span>
                  <span>Offline Queue Auto-Sync</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-emerald-500 font-bold">check</span>
                  <span>Safe Bunk Calculator & OD Claims</span>
                </div>
              </div>
            </div>

            <div className="pt-6 space-y-2">
              <button
                onClick={() => handleRoleClick('student')}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                Sign In as Student
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
              <button
                onClick={() => handleQuickDemoLogin('student')}
                className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-xl transition-all cursor-pointer text-center"
              >
                ⚡ 1-Click Instant Demo
              </button>
            </div>
          </div>

          {/* Card 2: Lecturer Staff Deck */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs hover:shadow-md hover:border-[#6b38d4]/30 transition-all flex flex-col justify-between group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-[#6b38d4] flex items-center justify-center border border-indigo-100">
                <span className="material-symbols-outlined text-2xl">co_present</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-display font-bold text-slate-900">Faculty Deck</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Launch rotating HMAC presence gates, manage multi-year course timetables, and review rosters.
                </p>
              </div>

              <div className="pt-2 space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-[#6b38d4] font-bold">check</span>
                  <span>5-Second Rotating TOTP Gates</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-[#6b38d4] font-bold">check</span>
                  <span>Interactive Timetable Scheduler</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-[#6b38d4] font-bold">check</span>
                  <span>Manual Attendance & Audit Trails</span>
                </div>
              </div>
            </div>

            <div className="pt-6 space-y-2">
              <button
                onClick={() => handleRoleClick('lecturer')}
                className="w-full py-2.5 bg-[#6b38d4] hover:bg-[#8455ef] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                Sign In as Faculty
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
              <button
                onClick={() => handleQuickDemoLogin('lecturer')}
                className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-[#6b38d4] text-[11px] font-bold rounded-xl transition-all cursor-pointer text-center"
              >
                ⚡ 1-Click Instant Demo
              </button>
            </div>
          </div>

          {/* Card 3: Admin & Secretariat */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs hover:shadow-md hover:border-[#6b38d4]/30 transition-all flex flex-col justify-between group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200">
                <span className="material-symbols-outlined text-2xl">admin_panel_settings</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-display font-bold text-slate-900">Admin Gateway</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Institutional attendance audits, NAAC reports, department-wide analytics, and roster management.
                </p>
              </div>

              <div className="pt-2 space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-slate-700 font-bold">check</span>
                  <span>Accreditation & NAAC Reports</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-slate-700 font-bold">check</span>
                  <span>Department Detention Warnings</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-slate-700 font-bold">check</span>
                  <span>Student Enrollment & CSV Ingest</span>
                </div>
              </div>
            </div>

            <div className="pt-6 space-y-2">
              <button
                onClick={() => handleRoleClick('admin')}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                Admin Command Center
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
              <button
                onClick={() => handleQuickDemoLogin('admin')}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold rounded-xl transition-all cursor-pointer text-center"
              >
                ⚡ 1-Click Instant Demo
              </button>
            </div>
          </div>

        </div>
      </main>

      {/* Pop-up Clean Auth Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 md:p-7 max-w-sm w-full shadow-2xl border border-slate-100 relative">
            
            {/* Header */}
            <div className="text-center mb-4">
              <h3 className="text-lg font-display font-bold text-slate-900">
                {activeTab === 'student' ? 'Student Sign In' : activeTab === 'lecturer' ? 'Faculty Sign In' : 'Administrator Sign In'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {authMode === 'signin' ? 'Enter your registered credentials' : 'Create your account profile'}
              </p>
            </div>

            {/* Switcher */}
            {activeTab !== 'admin' && (
              <div className="flex bg-slate-100 p-1 rounded-xl mb-4 text-xs font-bold text-center">
                <button
                  type="button"
                  onClick={() => setAuthMode('signin')}
                  className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                    authMode === 'signin' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                    authMode === 'signup' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Register
                </button>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleManualLogin} className="space-y-3 text-xs">
              {authMode === 'signup' && activeTab !== 'admin' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={fullNameInput}
                    onChange={(e) => setFullNameInput(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#6b38d4] outline-none"
                    placeholder="e.g. Aarav Sharma"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {activeTab === 'student' ? 'Student USN Code' : 'Staff Email Address'}
                </label>
                <input
                  type="text"
                  value={credentialInput}
                  onChange={(e) => setCredentialInput(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#6b38d4] outline-none font-mono"
                  placeholder={activeTab === 'student' ? 'e.g. 4JC21CS001' : 'e.g. dr.ramesh@sjce.edu'}
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Passcode / PIN</label>
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#6b38d4] outline-none font-mono"
                  placeholder="••••"
                  required
                />
              </div>

              {errorMsg && (
                <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 text-[11px]">
                  {errorMsg}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dbState === 'connecting'}
                  className={`flex-1 py-2 text-white font-bold rounded-lg transition-all shadow-xs ${
                    activeTab === 'student' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#6b38d4] hover:bg-[#8455ef]'
                  }`}
                >
                  {dbState === 'connecting' ? 'Verifying...' : authMode === 'signin' ? 'Sign In' : 'Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Minimal Clean Footer */}
      <footer className="border-t border-slate-200/60 py-4 text-center text-xs text-slate-400 bg-white">
        Sri Jayachamarajendra College of Engineering (SJCE) &bull; Golden Architecture Monorepo &bull; Vercel + Neon Serverless
      </footer>
    </div>
  );
}
