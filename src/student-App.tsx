import React, { useState, useEffect } from 'react';
import TopAppBar from './components/TopAppBar';
import StudentDashboardView from './components/StudentDashboardView';
import StudentCheckingView from './components/StudentCheckingView';
import AcademicResourcesView from './components/AcademicResourcesView';
import EnterprisePortalGateway from './components/EnterprisePortalGateway';
import TourGuide from './components/TourGuide';
import UserProfileView from './components/UserProfileView';
import { Session, AttendanceRecord, Student } from './types';

const ENCRYPTION_PASSPHRASE = 'sjce_web_crypto_key_2026';

// Derive a CryptoKey from a passphrase
async function getCryptoKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(ENCRYPTION_PASSPHRASE);
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const salt = enc.encode('sjce_salt');
  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt plain text using AES-GCM
async function encryptText(plainText: string): Promise<string> {
  const key = await getCryptoKey();
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    enc.encode(plainText)
  );
  
  // Combine IV and encrypted data as base64
  const ivBase64 = btoa(String.fromCharCode(...iv));
  const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  return `${ivBase64}:${encryptedBase64}`;
}

// Decrypt text using AES-GCM
async function decryptText(encryptedData: string): Promise<string> {
  const key = await getCryptoKey();
  const [ivBase64, encryptedBase64] = encryptedData.split(':');
  const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
  const encrypted = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));
  
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encrypted
  );
  return new TextDecoder().decode(decrypted);
}

function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SJCEOfflineQueueDB', 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('pending_records')) {
        db.createObjectStore('pending_records', { keyPath: 'id' });
      }
    };
    request.onsuccess = (e: any) => resolve(e.target.result);
    request.onerror = (e: any) => reject(e.target.error);
  });
}

async function saveOfflineRecord(record: any) {
  const db = await openIndexedDB();
  
  // Encrypt sensitive fields: studentUsn, studentName, otpCode
  const encryptedUsn = await encryptText(record.studentUsn);
  const encryptedName = await encryptText(record.studentName);
  const encryptedOtp = await encryptText(record.otpCode);
  
  const encryptedRecord = {
    ...record,
    studentUsn: encryptedUsn,
    studentName: encryptedName,
    otpCode: encryptedOtp,
    encrypted: true
  };
  
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('pending_records', 'readwrite');
    const store = transaction.objectStore('pending_records');
    const req = store.put(encryptedRecord);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getOfflineRecords(): Promise<any[]> {
  const db = await openIndexedDB();
  return new Promise<any[]>((resolve, reject) => {
    const transaction = db.transaction('pending_records', 'readonly');
    const store = transaction.objectStore('pending_records');
    const req = store.getAll();
    req.onsuccess = async () => {
      const records = req.result;
      const decryptedRecords = [];
      for (const rec of records) {
        if (rec.encrypted) {
          try {
            const decryptedUsn = await decryptText(rec.studentUsn);
            const decryptedName = await decryptText(rec.studentName);
            const decryptedOtp = await decryptText(rec.otpCode);
            decryptedRecords.push({
              ...rec,
              studentUsn: decryptedUsn,
              studentName: decryptedName,
              otpCode: decryptedOtp,
              encrypted: false
            });
          } catch (e) {
            console.error('Decryption failed for record:', rec.id, e);
          }
        } else {
          decryptedRecords.push(rec);
        }
      }
      resolve(decryptedRecords);
    };
    req.onerror = () => reject(req.error);
  });
}

async function clearOfflineRecords() {
  const db = await openIndexedDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('pending_records', 'readwrite');
    const store = transaction.objectStore('pending_records');
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export default function StudentApp() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('sjce_auth_session_student') !== null;
  });
  const [currentUser, setCurrentUser] = useState<{ codeOrUsn: string; name: string } | null>(() => {
    const saved = localStorage.getItem('sjce_auth_session_student');
    return saved ? JSON.parse(saved) : null;
  });
  const [isOffline, setIsOffline] = useState(false);
  const [currentPage, setCurrentPage] = useState('student-dashboard');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  // Load pending offline records from IndexedDB Secure Store
  const [pendingOfflineRecords, setPendingOfflineRecords] = useState<any[]>([]);

  useEffect(() => {
    getOfflineRecords().then(recs => {
      setPendingOfflineRecords(recs);
    }).catch(err => console.error('Failed to load offline records:', err));
  }, []);

  // Initial Fetch roster & sessions
  const refreshData = async () => {
    try {
      const token = localStorage.getItem('sjce_auth_token_student');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : undefined;
      const sRes = await fetch('/api/sessions', { headers });
      const sData = await sRes.json();
      setSessions(sData);

      const stdRes = await fetch('/api/students', { headers });
      const stdData = await stdRes.json();
      setStudents(stdData);
    } catch (e) {
      console.error('Server offline or network error:', e);
    }
  };

  useEffect(() => {
    refreshData();

    // Mount redirection check: if scan parameters are in URL, route immediately to check-in
    const params = new URLSearchParams(window.location.search);
    if (params.has('sessionId') || params.has('check-in') || params.has('otp')) {
      setCurrentPage('check-in');
    }
  }, []);

  // Automatic online/offline network detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setToast({
        type: 'success',
        text: '🌐 Connection restored! Syncing cached records...'
      });
      setTimeout(() => setToast(null), 3000);
    };

    const handleOffline = () => {
      setIsOffline(true);
      setToast({
        type: 'error',
        text: '📶 Connection lost. Switched to offline local buffer mode.'
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

  // Auto trigger synchronization once online and we have cached records
  useEffect(() => {
    if (!isOffline && pendingOfflineRecords.length > 0) {
      handleAutoSync(true);
    }
  }, [isOffline, pendingOfflineRecords.length]);

  // Synchronize local storage offline buffer queue with Express sync endpoint
  const handleAutoSync = async (forceNotifyReconciliation = false) => {
    if (isOffline || !navigator.onLine) {
      if (!forceNotifyReconciliation) {
        setToast({
          type: 'info',
          text: 'Cannot synchronize while Offline.',
        });
        setTimeout(() => setToast(null), 3000);
      }
      return;
    }

    if (pendingOfflineRecords.length === 0) {
      if (!forceNotifyReconciliation) {
        setToast({
          type: 'info',
          text: '100% reconciled. No cached student records to synchronize.',
        });
        setTimeout(() => setToast(null), 3000);
      }
      return;
    }

    try {
      const response = await fetch('/api/attendance/sync-offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: pendingOfflineRecords }),
      });

      const data = await response.json();
      if (data.success) {
        setToast({
          type: 'success',
          text: forceNotifyReconciliation
            ? '✓ Connection Restored! Your attendance has been marked.'
            : `✓ Local buffer reconciled! Synchronized ${data.syncedCount} offline attendance entries.`,
        });
        await clearOfflineRecords();
        setPendingOfflineRecords([]);
        refreshData();
      } else {
        setToast({ type: 'error', text: 'Synchronization validation failed.' });
      }
    } catch (err) {
      console.error(err);
      if (!forceNotifyReconciliation) {
        setToast({
          type: 'error',
          text: 'Failed to sync. Connection timeout.',
        });
      }
    }

    setTimeout(() => setToast(null), 4000);
  };

  const handleAuthorizeHandshake = (
    chosenPersona: 'lecturer' | 'student',
    chosenDept: 'student' | 'lecturer' | 'admin',
    creds: { codeOrUsn: string; name: string }
  ) => {
    setCurrentUser(creds);
    setIsLoggedIn(true);
    setCurrentPage('student-dashboard');
    localStorage.setItem('sjce_auth_session_student', JSON.stringify(creds));

    setToast({
      type: 'success',
      text: `🔐 Handshake successful! Welcome, ${creds.name} to the Student Portal.`
    });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAddPendingOfflineRecord = async (rec: any) => {
    try {
      const recordWithId = {
        id: `off_${Math.random().toString(36).substr(2, 9)}`,
        ...rec
      };
      await saveOfflineRecord(recordWithId);
      const recs = await getOfflineRecords();
      setPendingOfflineRecords(recs);
    } catch (e) {
      console.error('Failed to save record to IndexedDB:', e);
    }
  };

  if (!isLoggedIn) {
    // Restrict EnterprisePortalGateway to Student Tab
    return (
      <div className="student-portal-wrapper">
        <EnterprisePortalGateway 
          onAuthorize={handleAuthorizeHandshake} 
          students={students} 
        />
      </div>
    );
  }

  const tourSteps = [
    {
      selector: 'body',
      title: 'Welcome, Student!',
      description: 'Welcome to the SJCE Student Portal. Let\'s walk you through the classroom check-in steps.',
      placement: 'center' as const,
    },
    {
      selector: '[data-tour="student-checkin"]',
      title: 'Secure Check-in Tab',
      description: 'This is where you scan matching visual projector signals and submit access codes.',
      placement: 'top' as const,
      action: () => setCurrentPage('check-in')
    },
    {
      selector: '[data-tour="scan-trigger"]',
      title: 'Pulsing Scanner Trigger',
      description: 'Tap this pulsing radar key when class is active. It will open your camera to scan the lecturer\'s screen.',
      placement: 'bottom' as const,
    },
    {
      selector: '[data-tour="offline-toggle"]',
      title: 'Online/Offline Indicator',
      description: 'Poor classroom connection? Toggle Offline Mode. Your checks will be safely cached locally.',
      placement: 'bottom' as const,
    },
    {
      selector: '[data-tour="sync-trigger"]',
      title: 'Force Sync Gate',
      description: 'When connection returns, tap Sync to push all local offline check-in buffers to the registrar server logs.',
      placement: 'bottom' as const,
    },
    {
      selector: '[data-tour="profile-nav"]',
      title: 'Student Profile Settings',
      description: 'Customize your academic profile details, view your attendance quotient ring, or select modern presets.',
      placement: 'top' as const,
    }
  ];

  return (
    <div className="min-h-screen flex flex-col font-sans select-none antialiased bg-gray-50/50">
      <TourGuide steps={tourSteps} tourKey="sjce_tour_completed_student" />
      {/* Student App Bar */}
      <TopAppBar
        persona="student"
        setPersona={() => {}}
        isOffline={isOffline}
        setIsOffline={setIsOffline}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onSync={handleAutoSync}
        pendingOfflineCount={pendingOfflineRecords.length}
        onBackToGateway={() => {
          localStorage.removeItem('sjce_auth_session_student');
          setIsLoggedIn(false);
          window.location.href = '/';
        }}
      />

      {/* Toast Notifications */}
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

      {/* Screen Router */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-10 py-6 md:py-8">
        <div className="space-y-4">
          {currentPage === 'student-dashboard' && (
            <StudentDashboardView
              onCheckInClick={() => setCurrentPage('check-in')}
              currentUser={currentUser}
              students={students}
              sessions={sessions}
            />
          )}

          {currentPage === 'check-in' && (
            <StudentCheckingView
              sessions={sessions}
              isOffline={isOffline}
              onAddPendingRecord={handleAddPendingOfflineRecord}
              onSuccessCheckIn={() => setCurrentPage('student-dashboard')}
            />
          )}

          {currentPage === 'resources' && (
            <AcademicResourcesView />
          )}

          {currentPage === 'profile' && (
            <UserProfileView
              persona="student"
              currentUser={currentUser}
              onUpdateUser={(updatedCreds) => {
                setCurrentUser(updatedCreds);
                localStorage.setItem('sjce_auth_session_student', JSON.stringify(updatedCreds));
              }}
              students={students}
              onRefreshRoster={refreshData}
              onResetTour={() => {
                localStorage.removeItem('sjce_tour_completed_student');
                window.location.reload();
              }}
            />
          )}
        </div>
      </main>

      {/* Persistent Bottom Navigation Rail */}
      <nav className="sticky bottom-0 left-0 right-0 z-40 bg-white/85 backdrop-blur-md border-t border-[#6b38d4]/10 shadow-[0_-8px_32px_rgba(148,163,184,0.04)] px-4 py-3 pb-safe">
        <div className="max-w-xl mx-auto flex justify-around">
          <button
            data-tour="student-home"
            onClick={() => setCurrentPage('student-dashboard')}
            className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${
              currentPage === 'student-dashboard'
                ? 'text-[#6b38d4]'
                : 'text-[#7b7486] hover:text-[#191c1e]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: currentPage === 'student-dashboard' ? "'FILL' 1" : undefined }}>
              grid_view
            </span>
            <span className="text-[9px] font-sans font-bold tracking-wider uppercase">Home</span>
          </button>

          <button
            data-tour="student-checkin"
            onClick={() => setCurrentPage('check-in')}
            className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${
              currentPage === 'check-in'
                ? 'text-[#6b38d4]'
                : 'text-[#7b7486] hover:text-[#191c1e]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: currentPage === 'check-in' ? "'FILL' 1" : undefined }}>
              qr_code_scanner
            </span>
            <span className="text-[9px] font-sans font-bold tracking-wider uppercase">Check-in</span>
          </button>

          <button
            data-tour="student-resources"
            onClick={() => setCurrentPage('resources')}
            className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${
              currentPage === 'resources'
                ? 'text-[#6b38d4]'
                : 'text-[#7b7486] hover:text-[#191c1e]'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: currentPage === 'resources' ? "'FILL' 1" : undefined }}>
              book_4
            </span>
            <span className="text-[9px] font-sans font-bold tracking-wider uppercase">Resources</span>
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
    </div>
  );
}
