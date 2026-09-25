import React, { useState } from 'react';

export default function TopAppBar({
  persona,
  setPersona,
  isOffline,
  setIsOffline,
  currentPage,
  setCurrentPage,
  onSync,
  pendingOfflineCount,
  onBackToGateway,
  currentUser,
}: {
  persona: 'lecturer' | 'student' | 'admin';
  setPersona?: (p: 'lecturer' | 'student' | 'admin') => void;
  isOffline: boolean;
  setIsOffline: (offline: boolean) => void;
  currentPage: string;
  setCurrentPage: (p: string) => void;
  onSync: () => void;
  pendingOfflineCount: number;
  onBackToGateway: () => void;
  currentUser?: { codeOrUsn: string; name: string; role?: string } | null;
}) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const displayName = currentUser?.name || (persona === 'student' ? 'Student User' : persona === 'lecturer' ? 'Faculty Member' : 'System Admin');
  const userIdentifier = currentUser?.codeOrUsn || (persona === 'student' ? '4JC21CS001' : 'faculty@sjce.edu');
  const initials = displayName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'U';

  const handleSignOut = () => {
    localStorage.removeItem(`sjce_auth_session_${persona}`);
    localStorage.removeItem(`sjce_auth_token_${persona}`);
    window.location.href = '/';
  };

  return (
    <header className="flex justify-between items-center w-full px-4 md:px-8 py-3.5 sticky top-0 z-[150] prism-glass border-b border-slate-200/60 shadow-xs">
      {/* Left Branding & Return to Hub */}
      <div className="flex items-center gap-3">
        <button 
          onClick={onBackToGateway}
          className="flex items-center justify-center w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer"
          title="Return to Main Gateway"
          aria-label="Return to Main Gateway"
        >
          <span className="material-symbols-outlined text-lg">home</span>
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#6b38d4] to-[#8455ef] flex items-center justify-center text-white shadow-xs">
            <span className="material-symbols-outlined text-lg">school</span>
          </div>
          <div>
            <h1 className="text-sm md:text-base font-display font-extrabold text-slate-900 tracking-tight leading-none">
              SJCE Smart Attendance
            </h1>
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#6b38d4] font-bold">
              {persona === 'lecturer' ? 'Faculty Command Deck' : persona === 'admin' ? 'Registrar Secretariat' : 'Student Portal'}
            </span>
          </div>
        </div>
      </div>

      {/* Right Controls & Profile Deck */}
      <div className="flex items-center gap-2 md:gap-3">
        {persona === 'student' && (
          <>
            <button
              type="button"
              onClick={() => setCurrentPage(currentPage === 'resources' ? 'student-dashboard' : 'resources')}
              className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all text-xs font-bold shadow-xs cursor-pointer ${
                currentPage === 'resources'
                  ? 'bg-[#00687a] text-white shadow-cyan-200'
                  : 'bg-cyan-50 text-cyan-800 border border-cyan-300 hover:bg-cyan-100'
              }`}
              title="Syllabus & Academic Resources"
            >
              <span className="material-symbols-outlined text-sm">menu_book</span>
              <span>{currentPage === 'resources' ? 'Dashboard' : 'Resources & Syllabus'}</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(currentPage === 'biometric-presence' ? 'student-dashboard' : 'biometric-presence')}
              className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all text-xs font-bold shadow-xs cursor-pointer ${
                currentPage === 'biometric-presence'
                  ? 'bg-[#10b981] text-white shadow-emerald-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
              }`}
              title="Open 3D Face Mesh & ZK Biometric Presence Protocol"
            >
              <span className="material-symbols-outlined text-sm">verified_user</span>
              <span>{currentPage === 'biometric-presence' ? 'Dashboard' : 'Biometric ZK Pass'}</span>
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setIsOffline(!isOffline)}
          className={`px-2.5 py-1 rounded-full flex items-center gap-1.5 transition-all text-xs font-sans font-semibold border select-none cursor-pointer ${
            isOffline
              ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
          }`}
          title="Toggle Network Simulation Mode"
        >
          <span className="material-symbols-outlined text-sm">
            {isOffline ? 'cloud_off' : 'cloud_done'}
          </span>
          <span className="hidden sm:inline text-[11px]">
            {isOffline ? 'Offline Buffer' : 'Online Sync'}
          </span>
        </button>

        {/* Sync Trigger with Pending Count Badge */}
        <button
          onClick={onSync}
          disabled={isOffline}
          className={`p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer relative ${
            isOffline ? 'opacity-40 cursor-not-allowed' : ''
          }`}
          title="Force Sync Buffer"
          aria-label="Force Sync Buffer"
        >
          <span className="material-symbols-outlined text-sm">sync</span>
          {pendingOfflineCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
              {pendingOfflineCount}
            </span>
          )}
        </button>

        {/* Live User Header Profile Chip */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 p-1.5 pr-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl transition-all cursor-pointer select-none"
          >
            <div className="w-7 h-7 rounded-lg bg-[#6b38d4] text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {initials}
            </div>
            <div className="text-left hidden md:block leading-none">
              <span className="text-xs font-bold text-slate-800 block truncate max-w-[120px]">{displayName}</span>
              <span className="text-[10px] font-mono text-slate-600">{userIdentifier}</span>
            </div>
            <span className="material-symbols-outlined text-sm text-slate-600">expand_more</span>
          </button>

          {/* Profile Dropdown */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-150 p-2 z-[150] animate-in fade-in zoom-in-95 duration-150 text-xs">
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <p className="font-bold text-slate-900 truncate">{displayName}</p>
                <p className="text-[10px] font-mono text-slate-600 truncate">{userIdentifier}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase bg-indigo-50 text-[#6b38d4]">
                  {persona}
                </span>
              </div>

              <button
                onClick={() => { setShowProfileMenu(false); onBackToGateway(); }}
                className="w-full px-3 py-2 rounded-xl text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
              >
                <span className="material-symbols-outlined text-sm text-slate-600">swap_horiz</span>
                Switch Portal Role
              </button>

              <button
                onClick={handleSignOut}
                className="w-full px-3 py-2 rounded-xl text-left text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer font-bold"
              >
                <span className="material-symbols-outlined text-sm text-rose-500">logout</span>
                Sign Out Securely
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}



