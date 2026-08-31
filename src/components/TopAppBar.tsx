import React from 'react';

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
}: {
  persona: 'lecturer' | 'student';
  setPersona: (p: 'lecturer' | 'student') => void;
  isOffline: boolean;
  setIsOffline: (offline: boolean) => void;
  currentPage: string;
  setCurrentPage: (p: string) => void;
  onSync: () => void;
  pendingOfflineCount: number;
  onBackToGateway: () => void;
}) {
  return (
    <header className="flex justify-between items-center w-full px-4 md:px-10 py-4 sticky top-0 z-50 bg-white/75 backdrop-blur-lg border-b border-[#6b38d4]/10 shadow-[0_8px_32px_rgba(148,163,184,0.08)]">
      <div className="flex items-center gap-3">
        <button 
          onClick={onBackToGateway}
          className="material-symbols-outlined text-[#6b38d4] p-2 bg-[#6b38d4]/5 hover:bg-[#6b38d4]/15 transition-all rounded-xl active:scale-95 duration-200 cursor-pointer"
          title="Return to Connective Gateway"
          aria-label="Return to Connective Gateway"
        >
          home
        </button>
        <div className="flex flex-col">
          <h1 className="text-lg md:text-xl font-display font-bold text-[#6b38d4] tracking-tight leading-none">
            SJCE Smart Attendance
          </h1>
          <span className="text-[10px] uppercase font-sans tracking-widest text-[#00687a] mt-0.5 font-bold">
            EduSync &bull; {persona === 'lecturer' ? 'Lecturer Terminal' : 'Student Portal'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">

        {/* Offline Mode Status Pill */}
        <div
          data-tour="offline-toggle"
          className={`px-3 py-1.5 rounded-full flex items-center gap-2 transition-all text-xs font-sans font-semibold border select-none ${
            isOffline
              ? 'bg-[#ffdad6] text-[#ba1a1a] border-[#ba1a1a]/20 animate-pulse'
              : 'bg-[#e8f5e9] text-[#2e7d32] border-[#a5d6a7]/30'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">
            {isOffline ? 'cloud_off' : 'cloud_done'}
          </span>
          <span className="hidden sm:inline">
            {isOffline ? 'Offline' : 'Online'}
          </span>
        </div>

        {/* Quick Sync */}
        <button
          data-tour="sync-trigger"
          onClick={onSync}
          disabled={isOffline}
          className={`material-symbols-outlined text-[#6b38d4] p-2 hover:bg-[#6b38d4]/5 transition-all rounded-full active:scale-95 duration-200 cursor-pointer relative ${
            isOffline ? 'opacity-40 cursor-not-allowed' : ''
          }`}
          title="Force Synchronization Gate"
          aria-label="Force Synchronization Gate"
        >
          sync
          {pendingOfflineCount > 0 && (
            <span className="absolute top-0 right-0 w-4 h-4 bg-[#ba1a1a] text-white text-[9px] rounded-full flex items-center justify-center font-bold">
              {pendingOfflineCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
