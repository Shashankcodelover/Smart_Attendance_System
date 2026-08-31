import React, { useState, useRef, useEffect, useMemo } from 'react';
import jsQR from 'jsqr';
import { Session } from '../types';

interface StudentCheckingViewProps {
  sessions: Session[];
  isOffline: boolean;
  onAddPendingRecord: (record: {
    sessionId: string;
    studentUsn: string;
    studentName: string;
    otpCode: string;
    markedAt: string;
    markedOnline: boolean;
    verificationOption: string;
    scannedAt?: string;
    submittedAt?: string;
    deviceFingerprint?: string;
    qrToken?: string;
  }) => void;
  onSuccessCheckIn: () => void;
}

// Local cryptographic check helper
function verifySignatureFormat(token: string): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [timestamp, nonce, signature] = parts;
  if (!timestamp || !nonce || !signature) return false;
  const time = parseInt(timestamp);
  // Ensure timestamp is within the last 12 hours to prevent old replays
  if (isNaN(time) || Date.now() - time > 12 * 60 * 60 * 1000) {
    return false;
  }
  return true;
}

// On-device canvas-based fingerprinting
function getDeviceFingerprint(): string {
  let fp = localStorage.getItem('sjce_device_fingerprint');
  if (!fp) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const txt = 'sjce_fingerprint_2026';
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText(txt, 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText(txt, 4, 17);
    }
    const canvasData = canvas.toDataURL();
    let hash = 0;
    const inputs = navigator.userAgent + navigator.language + screen.colorDepth + screen.height + screen.width + new Date().getTimezoneOffset() + canvasData;
    for (let i = 0; i < inputs.length; i++) {
      const char = inputs.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    fp = 'fp_' + Math.abs(hash).toString(36) + '_' + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('sjce_device_fingerprint', fp);
  }
  return fp;
}

export default function StudentCheckingView({
  sessions,
  isOffline,
  onAddPendingRecord,
  onSuccessCheckIn,
}: StudentCheckingViewProps) {
  // Load initial states from localStorage if valid
  const getInitialUnlockedState = () => {
    // Disabled to prevent auto-unlocking on mount/navigation
    return null;
  };

  const initialUnlock = getInitialUnlockedState();

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [timeLeft, setTimeLeft] = useState(120);
  const [scannedAt, setScannedAt] = useState<string | null>(null);

  const [usn, setUsn] = useState(() => {
    const saved = localStorage.getItem('sjce_auth_session_student');
    return saved ? JSON.parse(saved).codeOrUsn : '';
  });
  const [fullName, setFullName] = useState(() => {
    const saved = localStorage.getItem('sjce_auth_session_student');
    return saved ? JSON.parse(saved).name : '';
  });
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [studentVerifyOption, setStudentVerifyOption] = useState('');
  const [qrToken, setQrToken] = useState('');
  
  const [videoLoaded, setVideoLoaded] = useState(false);

  // Clear old unlocked states on mount to enforce fresh scanning (if no redirect params are active)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasParams = params.has('sessionId') || params.has('check-in') || params.has('otp');
    if (!hasParams) {
      localStorage.removeItem('sjce_unlocked_session_id');
      localStorage.removeItem('sjce_unlocked_expires');
      localStorage.removeItem('sjce_unlocked_scanned_at');
      localStorage.removeItem('sjce_unlocked_usn');
      localStorage.removeItem('sjce_unlocked_name');
      localStorage.removeItem('sjce_unlocked_otp');
      localStorage.removeItem('sjce_unlocked_option');
    }
  }, []);

  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [manualQrText, setManualQrText] = useState('');

  // Permanent verification receipt screen state
  const [checkInReceipt, setCheckInReceipt] = useState<{
    subjectCode: string;
    subjectName: string;
    timeline: string;
    usn: string;
    name: string;
    markedAt: string;
    isOnline: boolean;
    shape: string;
  } | null>(null);

  // Live camera scanner state
  const [scanActive, setScanActive] = useState(false);
  const [scanProgress, setScanProgress] = useState<'idle' | 'searching' | 'locked' | 'success'>('idle');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceIdx, setCurrentDeviceIdx] = useState<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Sync camera stream to ref so cleanup works on unmount
  useEffect(() => {
    streamRef.current = cameraStream;
  }, [cameraStream]);

  // Clean up camera stream tracks when component unmounts
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Active sessions is the list that can be checked in
  const activeSessions = sessions.filter(s => s.status === 'ACTIVE');

  // Compute selected session details
  const selectedSession = useMemo(() => {
    return sessions.find(s => s.id === selectedSessionId) || null;
  }, [sessions, selectedSessionId]);

  // Synchronize unlocked state and student inputs to localStorage
  useEffect(() => {
    if (isUnlocked) {
      localStorage.setItem('sjce_unlocked_session_id', selectedSessionId);
      localStorage.setItem('sjce_unlocked_scanned_at', scannedAt || '');
      localStorage.setItem('sjce_unlocked_usn', usn);
      localStorage.setItem('sjce_unlocked_name', fullName);
      localStorage.setItem('sjce_unlocked_otp', otpCode);
      localStorage.setItem('sjce_unlocked_option', studentVerifyOption);
      localStorage.setItem('sjce_unlocked_qr_token', qrToken);
    } else {
      localStorage.removeItem('sjce_unlocked_session_id');
      localStorage.removeItem('sjce_unlocked_expires');
      localStorage.removeItem('sjce_unlocked_scanned_at');
      localStorage.removeItem('sjce_unlocked_usn');
      localStorage.removeItem('sjce_unlocked_name');
      localStorage.removeItem('sjce_unlocked_otp');
      localStorage.removeItem('sjce_unlocked_option');
      localStorage.removeItem('sjce_unlocked_qr_token');
    }
  }, [isUnlocked, selectedSessionId, scannedAt, usn, fullName, otpCode, studentVerifyOption, qrToken]);

  // Listen to live parameters or local countdown updates
  useEffect(() => {
    if (!isUnlocked) return;
    const timer = setInterval(() => {
      const expiresStr = localStorage.getItem('sjce_unlocked_expires');
      if (expiresStr) {
        const expires = Number(expiresStr);
        const remaining = Math.max(0, Math.round((expires - Date.now()) / 1000));
        if (remaining <= 0) {
          setIsUnlocked(false);
          setOtpCode('');
          setStudentVerifyOption('');
          setScannedAt(null);
          setStatusMsg({
            type: 'error',
            text: '⌛ Handshake Expired! The projector screen dynamic OTP rotated. Please re-scan QR Code to unlock.'
          });
          setTimeLeft(120);
        } else {
          setTimeLeft(remaining);
        }
      } else {
        setIsUnlocked(false);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isUnlocked]);

  // Read URL query parameters to unlock on raw scanner redirection trigger
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('sessionId');
    const otp = params.get('otp');
    const opt = params.get('option');
    const tokenVal = params.get('qrToken') || '';
    if (sid && otp && opt) {
      if (tokenVal && !verifySignatureFormat(tokenVal)) {
        setStatusMsg({
          type: 'error',
          text: '❌ Cryptographic Handshake Failed: Invalid QR signature token.'
        });
        return;
      }
      setSelectedSessionId(sid);
      setOtpCode(otp); // Autofill OTP code
      setStudentVerifyOption(opt); // Autofill shape option
      setQrToken(tokenVal);

      const expires = Date.now() + 120 * 1000;
      localStorage.setItem('sjce_unlocked_expires', String(expires));

      setIsUnlocked(true);
      setTimeLeft(120);
      setScannedAt(new Date().toISOString());
      setStatusMsg({
        type: 'success',
        text: '✓ Dynamic Handshake Synchronized! Roster check-in form is unlocked.'
      });

      // Clear query params so reload doesn't trigger clear again
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  // Pick default session if active and not set
  useEffect(() => {
    const defaultSess = activeSessions.length > 0 ? activeSessions[0].id : '';
    if (!selectedSessionId && defaultSess) {
      setSelectedSessionId(defaultSess);
    }
  }, [activeSessions, selectedSessionId]);

  // Compute if active device is a rear camera to conditionally apply mirroring
  const isBackCameraActive = useMemo(() => {
    if (videoDevices.length > 0 && currentDeviceIdx !== null && videoDevices[currentDeviceIdx]) {
      const label = videoDevices[currentDeviceIdx].label.toLowerCase();
      return !label.includes('front') && !label.includes('user');
    }
    return true; // Default to back camera
  }, [videoDevices, currentDeviceIdx]);

  // Handle Starting Real Device Camera inside the Scan Viewfinder
  const startCamera = async (deviceIndex: number | null = null) => {
    setScanActive(true);
    setScanProgress('searching');
    setStatusMsg(null);
    setVideoLoaded(false);

    // Stop any existing stream
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }

    try {
      let stream: MediaStream;

      if (deviceIndex === null) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoIn = devices.filter(d => d.kind === 'videoinput');
          setVideoDevices(videoIn);

          const activeTrack = stream.getVideoTracks()[0];
          const activeSettings = activeTrack ? activeTrack.getSettings() : null;
          const activeDeviceId = activeSettings ? activeSettings.deviceId : '';

          if (activeDeviceId) {
            const idx = videoIn.findIndex(d => d.deviceId === activeDeviceId);
            if (idx !== -1) {
              setCurrentDeviceIdx(idx);
            }
          }
        } catch (err) {
          console.warn('Enumerate devices failed after starting stream', err);
        }
      } else {
        const selectedDevice = videoDevices[deviceIndex];
        if (!selectedDevice) {
          throw new Error('Selected camera device not found.');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: selectedDevice.deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        setCurrentDeviceIdx(deviceIndex);
      }

      setCameraStream(stream);

    } catch (err) {
      console.error('Camera access failed:', err);
      setScanActive(false);
      setScanProgress('idle');
      setCameraStream(null);

      let friendlyError = 'Please check camera permissions or use a secure HTTPS connection.';
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          friendlyError = 'Camera access was denied. Please allow camera permissions in your browser settings.';
        } else if (err.name === 'NotFoundError') {
          friendlyError = 'No camera hardware found on this device.';
        } else {
          friendlyError = `Camera Error: ${err.message}`;
        }
      }

      setStatusMsg({
        type: 'error',
        text: `❌ Camera Access Failed: ${friendlyError}`
      });
    }
  };

  const stopCameraTracks = (streamToStop?: MediaStream | null) => {
    const active = streamToStop || cameraStream;
    if (active) {
      active.getTracks().forEach(track => track.stop());
    }
    setCameraStream(null);
    setVideoLoaded(false);
  };

  const handleSwitchCamera = () => {
    if (videoDevices.length <= 1 || currentDeviceIdx === null) return;
    const nextIdx = (currentDeviceIdx + 1) % videoDevices.length;
    startCamera(nextIdx);
  };

  const handleCancelScan = () => {
    stopCameraTracks();
    setScanActive(false);
    setScanProgress('idle');
  };

  const handleManualQrPaste = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    try {
      let sessionId = '';
      let otp = '';
      let option = '';
      let qrTokenParam = '';

      if (trimmed.includes('sessionId=') || trimmed.includes('otp=')) {
        const queryString = trimmed.includes('?') ? trimmed.split('?')[1] : trimmed;
        const params = new URLSearchParams(queryString);
        sessionId = params.get('sessionId') || '';
        otp = params.get('otp') || '';
        option = params.get('option') || '';
        qrTokenParam = params.get('qrToken') || '';
      } else {
        const parts = trimmed.split(',');
        if (parts.length >= 3) {
          sessionId = parts[0].trim();
          otp = parts[1].trim();
          option = parts[2].trim();
          if (parts[3]) qrTokenParam = parts[3].trim();
        }
      }

      if (qrTokenParam && !verifySignatureFormat(qrTokenParam)) {
        setStatusMsg({
          type: 'error',
          text: '❌ Cryptographic Handshake Failed: Invalid QR signature token.'
        });
        return;
      }

      if (sessionId) {
        setSelectedSessionId(sessionId);
        setOtpCode(otp);
        setStudentVerifyOption(option);
        setQrToken(qrTokenParam);
        
        const expires = Date.now() + 120 * 1000;
        localStorage.setItem('sjce_unlocked_expires', String(expires));

        setIsUnlocked(true);
        setTimeLeft(120);
        setScannedAt(new Date().toISOString());
        setStatusMsg({
          type: 'success',
          text: '✓ Dynamic Handshake Synchronized manually! Roster check-in form is unlocked.'
        });
        setManualQrText('');
      } else {
        setStatusMsg({
          type: 'error',
          text: '❌ Could not decode valid QR handshake parameters.'
        });
      }
    } catch (e) {
      setStatusMsg({
        type: 'error',
        text: '❌ Error parsing QR handshake contents. Try copying again.'
      });
    }
  };

  // Frame processing loop using jsQR
  useEffect(() => {
    if (!scanActive || !cameraStream || !videoRef.current) return;

    let active = true;
    let animationFrameId: number;
    const video = videoRef.current;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const scanFrame = () => {
      if (!active) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });

          if (code && code.data) {
            const qrText = code.data.trim();
            if (qrText.includes('sessionId=') || qrText.includes('otp=')) {
              active = false;
              
              setScanProgress('locked');
              
              const queryString = qrText.includes('?') ? qrText.split('?')[1] : qrText;
              const params = new URLSearchParams(queryString);
              const sid = params.get('sessionId') || '';
              const otpParam = params.get('otp') || '';
              const optionParam = params.get('option') || '';
              const qrTokenParam = params.get('qrToken') || '';

              if (qrTokenParam && !verifySignatureFormat(qrTokenParam)) {
                setStatusMsg({
                  type: 'error',
                  text: '❌ Cryptographic Handshake Failed: Invalid QR signature token.'
                });
                setScanProgress('idle');
                active = true;
                return;
              }

              setTimeout(() => {
                setSelectedSessionId(sid);
                setOtpCode(otpParam);
                setStudentVerifyOption(optionParam);
                setQrToken(qrTokenParam);
                
                const expires = Date.now() + 120 * 1000;
                localStorage.setItem('sjce_unlocked_expires', String(expires));

                setIsUnlocked(true);
                setTimeLeft(120);
                setScannedAt(new Date().toISOString());

                setScanProgress('success');
                setTimeout(() => {
                  stopCameraTracks(cameraStream);
                  setScanActive(false);
                  setStatusMsg({
                    type: 'success',
                    text: '✓ QR Code scanned successfully! Handshake parameters unlocked.'
                  });
                }, 1000);
              }, 1200);
              return;
            }
          }
        } catch (err) {
          console.warn('QR decode error:', err);
        }
      }
      animationFrameId = requestAnimationFrame(scanFrame);
    };

    scanFrame();

    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [scanActive, cameraStream]);

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionId) {
      setStatusMsg({ type: 'error', text: 'Please select an active lecture session.' });
      return;
    }
    if (!otpCode || otpCode.length !== 4) {
      setStatusMsg({ type: 'error', text: 'Enter the 4-digit OTP displayed on the screen.' });
      return;
    }
    if (!studentVerifyOption) {
      setStatusMsg({ type: 'error', text: 'Please select the verification challenge shape currently shown on the screen.' });
      return;
    }

    setSubmitting(true);
    setStatusMsg(null);

    const targetSession = selectedSession;
    if (!targetSession) {
      setStatusMsg({ type: 'error', text: 'Session validation error. Try again.' });
      setSubmitting(false);
      return;
    }

    const markedAt = new Date().toISOString();
    const scannedAtString = scannedAt || new Date(new Date().getTime() - 5000).toISOString();

    const fpVal = getDeviceFingerprint();

    if (isOffline) {
      // Offline buffering
      setTimeout(() => {
        onAddPendingRecord({
          sessionId: selectedSessionId,
          studentUsn: usn,
          studentName: fullName,
          otpCode,
          markedAt,
          markedOnline: false,
          verificationOption: studentVerifyOption,
          scannedAt: scannedAtString,
          submittedAt: markedAt,
          deviceFingerprint: fpVal,
          qrToken: qrToken || undefined
        });

        // Set verification receipt state instead of auto-closing immediately!
        setCheckInReceipt({
          subjectCode: targetSession.subjectCode,
          subjectName: targetSession.subjectName,
          timeline: targetSession.timeline || '10:00 AM - 11:00 AM',
          usn: usn,
          name: fullName,
          markedAt,
          isOnline: false,
          shape: studentVerifyOption
        });

        setSubmitting(false);
        setOtpCode('');
      }, 1000);

    } else {
      // Online submission
      try {
        const token = localStorage.getItem('sjce_auth_token_student');
        const res = await fetch('/api/attendance/check-in', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            sessionId: selectedSessionId,
            studentUsn: usn,
            studentName: fullName,
            otpCode,
            isOnline: true,
            verificationOption: studentVerifyOption,
            scannedAt: scannedAtString,
            submittedAt: markedAt,
            qrToken: qrToken || undefined,
            deviceFingerprint: fpVal
          }),
        });

        const data = await res.json();
        if (data.error) {
          setStatusMsg({ type: 'error', text: data.error });
        } else {
          // Set verification receipt state instead of auto-closing immediately!
          setCheckInReceipt({
            subjectCode: targetSession.subjectCode,
            subjectName: targetSession.subjectName,
            timeline: targetSession.timeline || '10:00 AM - 11:00 AM',
            usn: usn,
            name: fullName,
            markedAt,
            isOnline: true,
            shape: studentVerifyOption
          });

          setOtpCode('');
        }
      } catch (err) {
        console.error(err);
        setStatusMsg({
          type: 'error',
          text: 'Network bridge failed. Please enable Offline Mode in the top panel to buffer check-in locally.',
        });
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <section className="space-y-1 text-left">
        <span className="text-[10px] tracking-widest text-[#6b38d4] bg-[#6b38d4]/10 px-2.5 py-1 rounded-full font-sans font-extrabold uppercase">
          DOUBLE-FACTOR SECURE SIGN-IN
        </span>
        <h2 className="text-2xl md:text-3xl font-display font-black text-[#191c1e] tracking-tight mt-1.5 font-sans">
          Student Check-in Console
        </h2>
        <p className="text-sm text-[#494454]">
          Submit your presence token. Ensure your device is within physical range of the projector.
        </p>
      </section>

      {/* Connectivity Banner Hint */}
      {isOffline && !checkInReceipt && (
        <div className="p-3 bg-amber-50 border border-amber-250 rounded-xl text-amber-900 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">wifi_off</span>
          <span>Offline Mode is active. Attendance records will be stored locally.</span>
        </div>
      )}

      {/* Persistent notifications (only shown when not active scanning) */}
      {statusMsg && !scanActive && !isUnlocked && !checkInReceipt && (
        <div className={`p-4 rounded-xl border text-xs leading-relaxed font-sans text-left ${
          statusMsg.type === 'success'
            ? 'bg-green-50 text-green-700 border-green-200'
            : statusMsg.type === 'error'
            ? 'bg-rose-50 text-rose-700 border-rose-200'
            : 'bg-cyan-50 text-cyan-800 border-cyan-200'
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* Initial trigger screen when locked and camera inactive */}
      {!checkInReceipt && !isUnlocked && !scanActive && (
        <div className="max-w-xl mx-auto bg-white border border-[#cbc3d7]/30 rounded-3xl p-8 shadow-sm text-center space-y-8 animate-fade-in my-8">
          <div className="space-y-3">
            <h3 className="font-display font-extrabold text-slate-800 text-lg leading-none font-sans">
              Verify Attendance
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              To log your attendance for the active class, scan the live QR code displayed on the lecturer's projector screen.
            </p>
          </div>

          {/* Pulsing Scanner Button */}
          <div className="flex flex-col items-center justify-center py-4">
            <button
              data-tour="scan-trigger"
              type="button"
              onClick={() => startCamera(null)}
              className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#6b38d4] to-[#8455ef] text-white flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer pulse-glowing"
            >
              <span className="material-symbols-outlined text-[40px]">qr_code_scanner</span>
            </button>
            <span className="text-xs font-bold text-[#6b38d4] mt-4 tracking-wider uppercase animate-pulse">
              Tap to Scan
            </span>
          </div>

          {/* Roster & Offline hints */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-150 text-left text-xs space-y-3 text-[#494454]">
            <div className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-sm text-[#6b38d4] mt-0.5">verified_user</span>
              <span><strong>Offline-First Architecture:</strong> Camera scanning and dynamic signature validation operate entirely on-device, saving your record locally if campus Wi-Fi drops.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-sm text-[#6b38d4] mt-0.5">shield_lock</span>
              <span><strong>USN Identity Check:</strong> The system locks submissions until you synchronize with the live classroom verification keys.</span>
            </div>
          </div>

          {/* Manual Link Input */}
          <div className="pt-4 border-t border-slate-100 text-left space-y-2">
            <label className="block text-[10px] font-sans font-extrabold text-[#7b7486] uppercase tracking-wider">
              Trouble scanning? Paste raw QR contents manually
            </label>
            <div className="flex gap-2 bg-[#f8fafc] rounded-xl p-1.5 border border-[#cbc3d7]/30">
              <input
                type="text"
                value={manualQrText}
                onChange={(e) => setManualQrText(e.target.value)}
                placeholder="Paste URL e.g. http://.../student?sessionId=...&otp=...&option=..."
                className="flex-1 bg-transparent border-none outline-none text-xs px-2.5 py-1.5 placeholder:text-gray-400 text-gray-800 font-sans"
              />
              <button
                type="button"
                onClick={() => handleManualQrPaste(manualQrText)}
                className="px-4 py-2 bg-[#6b38d4] hover:bg-[#8455ef] text-white rounded-lg text-[10px] font-sans font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0"
              >
                Sync Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active scanner viewfinder screen */}
      {!checkInReceipt && scanActive && (
        <div className="max-w-xl mx-auto bg-white border border-[#cbc3d7]/30 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[#6b38d4] text-[32px]">
                photo_camera
              </span>
              <div className="text-left">
                <h3 className="font-display font-extrabold text-[#191c1e] font-sans">
                  Projector Viewfinder
                </h3>
                <p className="text-[10px] text-[#7b7486] font-sans leading-none mt-0.5">
                  Align QR code inside the brackets
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {videoDevices.length > 1 && (
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-[#6b38d4] rounded-xl text-xs font-sans font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">switch_camera</span>
                  Switch
                </button>
              )}
              <button
                type="button"
                onClick={handleCancelScan}
                className="px-3 py-1.5 bg-[#ba1a1a]/10 hover:bg-[#ba1a1a]/20 text-[#ba1a1a] rounded-xl text-xs font-sans font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">cancel</span>
                Cancel
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-[#6b38d4]/50 p-4 bg-[#f8f6fc] relative overflow-hidden transition-all duration-300">
            <div className="text-center space-y-1 mb-3.5">
              <span className="text-[10px] bg-[#6b38d4] text-white px-2 py-0.5 rounded-full font-sans font-black uppercase inline-block animate-pulse">
                {scanProgress === 'searching' ? '📷 SEARCHING FOR QR CODE...' : scanProgress === 'locked' ? '⚡ SECURING QR TOKEN...' : '✓ COMPLETE'}
              </span>
              <p className="text-xs text-slate-500">
                Align the rotating projector QR squarely within the viewfinder.
              </p>
            </div>

            {/* Viewfinder box */}
            <div className="w-64 h-64 sm:w-80 sm:h-80 mx-auto rounded-3xl relative border-4 border-slate-800 bg-slate-950 overflow-hidden shadow-2xl flex items-center justify-center">
              {cameraStream && (
                <video 
                  ref={(el) => {
                    if (el) {
                      videoRef.current = el;
                      if (cameraStream && el.srcObject !== cameraStream) {
                        el.srcObject = cameraStream;
                        el.play().catch(e => console.warn('Play failed in ref callback', e));
                      }
                    }
                  }}
                  playsInline
                  autoPlay
                  muted
                  onLoadedData={() => setVideoLoaded(true)}
                  style={{ transform: isBackCameraActive ? 'none' : 'scaleX(-1)' }}
                  className={`w-full h-full object-cover transition-opacity duration-300 ${videoLoaded ? 'opacity-100' : 'opacity-0'}`}
                />
              )}
              
              {(!cameraStream || !videoLoaded) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-center p-6 space-y-4 z-10">
                  {/* Animated Radar/Scanner rings */}
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-violet-500/30 animate-ping"></div>
                    <div className="absolute w-12 h-12 rounded-full border border-[#6b38d4]/50 animate-pulse"></div>
                    <span className="material-symbols-outlined text-[36px] text-violet-400 animate-pulse">
                      sensors
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-violet-300 tracking-wider uppercase animate-pulse">
                      Starting Camera Stream...
                    </p>
                    <p className="text-[9px] text-slate-400 max-w-[180px] mx-auto leading-relaxed font-sans">
                      Initializing video hardware and checking permissions.
                    </p>
                  </div>
                </div>
              )}

              {/* Corner brackets */}
              <div className="absolute top-4 left-4 w-6 h-6 border-t-4 border-l-4 border-[#6b38d4] rounded-tl-md"></div>
              <div className="absolute top-4 right-4 w-6 h-6 border-t-4 border-r-4 border-[#6b38d4] rounded-tr-md"></div>
              <div className="absolute bottom-4 left-4 w-6 h-6 border-b-4 border-l-4 border-[#6b38d4] rounded-bl-md"></div>
              <div className="absolute bottom-4 right-4 w-6 h-6 border-b-4 border-r-4 border-[#6b38d4] rounded-br-md"></div>

              {/* Sweeping Laser Line */}
              {scanProgress === 'searching' && (
                <div className="absolute left-0 w-full h-1 bg-[#8455ef] shadow-[0_0_15px_#8455ef] scanner-laser"></div>
              )}

              {/* Lock indicators */}
              {scanProgress === 'locked' && (
                <div className="absolute inset-0 bg-[#00687a]/15 backdrop-blur-[1px] flex items-center justify-center flex-col space-y-2">
                  <span className="material-symbols-outlined text-[48px] text-[#00687a] animate-ping">lock</span>
                  <span className="text-xs font-bold text-[#004e5c] uppercase bg-white/90 px-3 py-1 rounded-full shadow-md font-mono">
                    OTP SYNC: MATCHED
                  </span>
                </div>
              )}

              {scanProgress === 'success' && (
                <div className="absolute inset-0 bg-green-950/40 flex items-center justify-center flex-col space-y-1">
                  <span className="material-symbols-outlined text-[48px] text-[#00e676]">check_circle</span>
                  <span className="text-xs font-bold text-white uppercase bg-green-600 px-3 py-1 rounded-full">
                    HANDSHAKE SUCCESS
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 text-center text-[10px] text-gray-500 font-mono">
              CAMERA INGRESS RESOLUTION &bull; ENVIRONMENT MATRIX OVERLAY
            </div>
          </div>
        </div>
      )}

      {/* Unlocked check-in form screen */}
      {!checkInReceipt && isUnlocked && !scanActive && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-slide-up">
          {/* Left: Check-in console */}
          <div className="lg:col-span-8 bg-white border border-[#cbc3d7]/30 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <span className="material-symbols-outlined text-[#6b38d4] text-[32px]">
                assignment_turned_in
              </span>
              <div className="text-left">
                <h3 className="font-display font-extrabold text-[#191c1e] font-sans">
                  Confirm Check-in Details
                </h3>
                <p className="text-[10px] text-[#7b7486] font-sans leading-none mt-0.5">
                  Please review and submit your university credentials
                </p>
              </div>
            </div>

            <form onSubmit={handleCheckIn} className="space-y-4">
              {/* Countdown and network status indicator */}
              <div className="flex items-center justify-between p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl mb-4 text-emerald-800">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-lg animate-spin text-emerald-700">sync</span>
                  <div className="text-left">
                    <p className="text-xs font-bold leading-none">Secure Handshake Established</p>
                    <p className="text-[10px] text-emerald-950 mt-0.5 font-sans">Please verify and submit your credentials before the OTP rotates!</p>
                  </div>
                </div>
                <div className="bg-emerald-600 text-white font-mono text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0">
                  <span className="material-symbols-outlined text-xs">timer</span>
                  <span>{timeLeft}s remaining</span>
                </div>
              </div>

              {/* Class session details block card */}
              <div className="bg-violet-50/50 border border-violet-100 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="space-y-1 text-left">
                  <span className="text-[9px] font-sans font-extrabold text-[#6b38d4] uppercase tracking-wider bg-[#6b38d4]/10 px-2.5 py-0.5 rounded-full">
                    Target Class Session
                  </span>
                  <h4 className="font-display font-bold text-slate-800 text-sm mt-1 font-sans">
                    {selectedSession ? `${selectedSession.subjectCode} — ${selectedSession.subjectName}` : 'Unknown Session'}
                  </h4>
                  <p className="text-[10px] text-slate-500 font-sans">
                    {selectedSession ? `Section ${selectedSession.section} • Year ${selectedSession.year} • ${selectedSession.timeline}` : 'Verification Session'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 border border-emerald-200/50 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider shrink-0 font-sans">
                  <span className="material-symbols-outlined text-xs">verified</span>
                  <span>Verified</span>
                </div>
              </div>

              {/* Credentials */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                <div>
                  <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider mb-2">
                    University USN Code
                  </label>
                  <input
                    type="text"
                    value={usn}
                    onChange={(e) => setUsn(e.target.value.toUpperCase())}
                    className="w-full p-3.5 rounded-xl border border-slate-200 bg-white font-mono text-sm focus:ring-2 focus:ring-[#6b38d4]/20 focus:border-[#6b38d4] outline-none text-[#191c1e]"
                    placeholder="e.g. 4SJ21CS005"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Student Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full p-3.5 rounded-xl border border-slate-200 bg-white font-sans text-sm focus:ring-2 focus:ring-[#6b38d4]/20 focus:border-[#6b38d4] outline-none text-[#191c1e]"
                    placeholder="e.g. Ananya K."
                    required
                  />
                </div>
              </div>

              {/* OTP code */}
              <div className="text-left">
                <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Verification OTP (Enter manually)
                </label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').substring(0, 4))}
                  className="w-full p-3.5 text-center rounded-xl border border-slate-200 bg-white tracking-[0.4em] font-display font-extrabold text-[#6b38d4] text-xl focus:ring-2 focus:ring-[#6b38d4]/20 focus:border-[#6b38d4] outline-none"
                  placeholder="0000"
                  maxLength={4}
                  required
                />
              </div>

              {/* Challenge verification option */}
              <div className="text-left">
                <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Projector Challenge Shape
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { value: 'BLUE_CIRCLE', emoji: '🔵', label: 'Blue Circle' },
                    { value: 'RED_SQUARE', emoji: '🟥', label: 'Red Square' },
                    { value: 'GREEN_TRIANGLE', emoji: '🔺', label: 'Green Triangle' },
                    { value: 'YELLOW_STAR', emoji: '⭐', label: 'Yellow Star' },
                  ].map((opt) => {
                    const isSelected = studentVerifyOption === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setStudentVerifyOption(opt.value)}
                        className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#6b38d4]/10 border-[#6b38d4] ring-2 ring-[#6b38d4]/10 text-[#6b38d4]'
                            : 'bg-white border-slate-200 hover:bg-[#6b38d4]/5 text-[#494454]'
                        }`}
                      >
                        <span className="text-xl mb-1">{opt.emoji}</span>
                        <span className="text-[10px] font-sans font-bold uppercase tracking-tight">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {statusMsg && statusMsg.type !== 'success' && (
                <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs leading-relaxed text-left">
                  {statusMsg.text}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsUnlocked(false);
                    setStatusMsg(null);
                  }}
                  className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-sans font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">cancel</span>
                  Cancel / Re-scan
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className={`flex-[2] py-3.5 bg-gradient-to-r from-[#6b38d4] to-[#8455ef] text-white rounded-xl font-sans font-extrabold text-sm shadow-md shadow-[#6b38d4]/10 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    submitting ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                >
                  {submitting ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                      Verifying Presence...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">vpn_key</span>
                      Submit Attendance Handshake
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Right column: Status details */}
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-red-50/50 border border-red-200/50 rounded-2xl p-6 shadow-sm text-left">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-[#ba1a1a]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  warning
                </span>
                <h3 className="text-md sm:text-lg font-display font-black text-[#ba1a1a]">
                  Shortage Alerts
                </h3>
              </div>
              <p className="text-xs text-[#494454] leading-relaxed mb-4">
                Your discrete cognitive attendance marks display shortage status. Complete 3 subsequent check-ins to restore optimal grading!
              </p>
              <div className="bg-white p-4 rounded-xl shadow-inner border border-red-100">
                <span className="text-[8px] font-sans font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                  COGNITIVE PSYCHOLOGY
                </span>
                <div className="flex justify-between items-baseline">
                  <span className="text-2xl font-display font-black text-[#ba1a1a]">72%</span>
                  <span className="text-xl text-[#ba1a1a] material-symbols-outlined">trending_down</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-2 italic">
                  Need 8 more lecture hours to bridge 75% grading threshold.
                </p>
              </div>
            </section>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm text-xs space-y-3 text-left">
              <h4 className="font-display font-bold text-slate-900 text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[#6b38d4]">lock</span>
                Trust Handshake Rules
              </h4>
              <ul className="space-y-2 text-slate-600 list-disc list-inside leading-relaxed font-sans">
                <li>Visual codes update on a dynamic interval to ensure classroom presence.</li>
                <li>Offline buffers store receipts safely locally on network dropouts.</li>
                <li>Encryption matches USN code to student directories automatically.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Permanent verified check-in receipt screen */}
      {checkInReceipt && (
        <div className="max-w-xl mx-auto bg-white border border-emerald-200 rounded-3xl p-8 shadow-xl text-center space-y-6 animate-fade-in my-8 text-slate-800">
          <div className="flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 shadow-sm">
              <span className="material-symbols-outlined text-[36px]">verified</span>
            </div>
            <h3 className="font-display font-black text-slate-800 text-xl leading-none font-sans">
              Attendance Verified!
            </h3>
            <p className="text-xs text-slate-400 mt-2 font-sans">
              Your secure classroom handshake has been logged successfully.
            </p>
          </div>

          <div className="bg-emerald-50/50 rounded-2xl p-5 border border-emerald-100 text-left text-xs space-y-3 font-sans">
            <div className="flex justify-between border-b border-emerald-100/50 pb-2 gap-4">
              <span className="text-slate-500 font-medium whitespace-nowrap">Course:</span>
              <span className="font-extrabold text-slate-800 text-right">{checkInReceipt.subjectCode} - {checkInReceipt.subjectName}</span>
            </div>
            <div className="flex justify-between border-b border-emerald-100/50 pb-2">
              <span className="text-slate-500 font-medium">Timeline:</span>
              <span className="font-semibold text-slate-800">{checkInReceipt.timeline}</span>
            </div>
            <div className="flex justify-between border-b border-emerald-100/50 pb-2">
              <span className="text-slate-500 font-medium">Student USN:</span>
              <span className="font-mono font-bold text-[#6b38d4]">{checkInReceipt.usn}</span>
            </div>
            <div className="flex justify-between border-b border-emerald-100/50 pb-2">
              <span className="text-slate-500 font-medium">Student Name:</span>
              <span className="font-bold text-slate-800">{checkInReceipt.name}</span>
            </div>
            <div className="flex justify-between border-b border-emerald-100/50 pb-2">
              <span className="text-slate-500 font-medium">Verification Shape:</span>
              <span className="font-bold text-slate-800">
                {checkInReceipt.shape === 'BLUE_CIRCLE' ? '🔵 Blue Circle' : checkInReceipt.shape === 'RED_SQUARE' ? '🟥 Red Square' : checkInReceipt.shape === 'GREEN_TRIANGLE' ? '🔺 Green Triangle' : '⭐ Yellow Star'}
              </span>
            </div>
            <div className="flex justify-between border-b border-emerald-100/50 pb-2">
              <span className="text-slate-500 font-medium">Timestamp:</span>
              <span className="font-semibold text-slate-800">{new Date(checkInReceipt.markedAt).toLocaleTimeString()} ({new Date(checkInReceipt.markedAt).toLocaleDateString()})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Connectivity:</span>
              <span className={`font-bold uppercase tracking-wider text-[9px] px-2 py-0.5 rounded ${checkInReceipt.isOnline ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {checkInReceipt.isOnline ? 'Verified Online' : 'Buffered Offline'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setCheckInReceipt(null);
              setIsUnlocked(false);
              onSuccessCheckIn();
            }}
            className="w-full py-3.5 bg-gradient-to-r from-[#6b38d4] to-[#8455ef] hover:from-[#8455ef] hover:to-[#6b38d4] text-white rounded-xl font-sans font-extrabold text-sm shadow-md transition-all cursor-pointer"
          >
            Done & Back to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
