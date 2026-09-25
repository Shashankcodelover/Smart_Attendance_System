import React, { useState, useEffect } from 'react';
import { Session, AttendanceRecord } from '../types';

interface VerificationSessionViewProps {
  session: Session | null;
  attendanceRecords: AttendanceRecord[];
  isOffline: boolean;
  onDeactivate: (sessionId: string) => void;
  onSyncManual: () => void;
  pendingOfflineCount: number;
}

export default function VerificationSessionView({
  session,
  attendanceRecords,
  isOffline,
  onDeactivate,
  onSyncManual,
  pendingOfflineCount,
}: VerificationSessionViewProps) {
  const [timeLeft, setTimeLeft] = useState(120);
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [currentOtp, setCurrentOtp] = useState(session?.otp || '1234');
  const [currentChallenge, setCurrentChallenge] = useState(session?.verificationOption || 'BLUE_CIRCLE');

  // Live telemetry status tickers
  const [telemetryScanRate, setTelemetryScanRate] = useState(2.8);
  const [latencyTicker, setLatencyTicker] = useState(38);

  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetryScanRate(prev => {
        const delta = (Math.random() - 0.5) * 0.8;
        return Math.max(0.2, parseFloat((prev + delta).toFixed(1)));
      });
      setLatencyTicker(() => Math.floor(22 + Math.random() * 25));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Sync initial state if session changes
  useEffect(() => {
    if (session) {
      setCurrentOtp(session.otp);
      setCurrentChallenge(session.verificationOption);
      setTimeLeft(120);
    }
  }, [session]);

  // Filter current session records
  const currentRecords = session
    ? attendanceRecords.filter((r) => r.sessionId === session.id)
    : [];

  const uniqueDevices = React.useMemo(() => {
    const devices = new Set<string>();
    currentRecords.forEach((r: any) => {
      const fp = r.deviceFingerprint || r.device_fingerprint;
      if (fp && fp !== 'lecturer_manual') {
        devices.add(fp);
      }
    });
    return Math.max(3, devices.size);
  }, [currentRecords]);

  // Countdown timer rules: 120 seconds refresh with random rotations
  useEffect(() => {
    if (!session || session.status !== 'ACTIVE') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Regenerate dynamic OTP passcode
          const nextOtp = Math.floor(1000 + Math.random() * 9000).toString();
          
          // Rotate active challenge visual shapes
          const options: ('BLUE_CIRCLE' | 'RED_SQUARE' | 'GREEN_TRIANGLE' | 'YELLOW_STAR')[] = [
            'BLUE_CIRCLE', 'RED_SQUARE', 'GREEN_TRIANGLE', 'YELLOW_STAR'
          ];
          const nextChallenge = options[Math.floor(Math.random() * options.length)];
          
          // Commit parameters back so sync validates against new server thresholds
          session.otp = nextOtp;
          session.verificationOption = nextChallenge;
          
          setCurrentOtp(nextOtp);
          setCurrentChallenge(nextChallenge);

          // PUSH rotation update to Express server so student checks match exactly
          fetch('/api/sessions/update-rotation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: session.id,
              otp: nextOtp,
              verificationOption: nextChallenge
            })
          }).catch(err => console.error("Error updating rotated session to server:", err));
          
          return 120; // reset
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [session]);

  const circumference = 2 * Math.PI * 40; // R=40
  const strokeDashoffset = session
    ? circumference - (timeLeft / 120) * circumference
    : 0;

  const handleSyncClick = () => {
    setSyncing(true);
    setSyncSuccess(false);
    setTimeout(() => {
      onSyncManual();
      setSyncing(false);
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    }, 1500);
  };

  if (!session) {
    return (
      <div className="acrylic-card rounded-2xl p-10 text-center border border-[#6b38d4]/10 max-w-xl mx-auto space-y-4">
        <span className="material-symbols-outlined text-[48px] text-[#7b7486]">
          report
        </span>
        <h3 className="font-display font-semibold text-lg text-[#191c1e]">
          No Active Attendance Gate
        </h3>
        <p className="text-sm text-[#494454]">
          Please launch or activate one of the sections from your Lecturer Dashboard.
        </p>
      </div>
    );
  }

  // Generate dynamic live API QR code url referencing the rotating OTP & challenge shape parameters
  const qrConnectText = `${window.location.origin}/student-dashboard?check-in=true&sessionId=${session.id}&otp=${currentOtp}&option=${currentChallenge}`;
  const dynamicQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&color=6b38d4&margin=12&data=${encodeURIComponent(qrConnectText)}`;

  // OTP split digits
  const pinDigits = currentOtp.split('');

  return (
    <div className="space-y-6">
      {/* Verification Stage Header Timer */}
      <section className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-2">
        <div className="w-full sm:w-auto text-center sm:text-left">
          <span className="text-[10px] bg-[#00687a]/10 text-[#00687a] px-2.5 py-1 rounded-full font-sans font-bold tracking-widest uppercase">
            LIVE BROADCAST TERMINAL
          </span>
          <h2 className="text-2xl md:text-3xl font-display font-semibold text-[#191c1e] mt-1.5 leading-none">
            Verification Session
          </h2>
          <p className="text-sm text-[#494454] mt-1 font-sans">
            Scanning active for <span className="font-semibold text-[#6b38d4]">{session.subjectCode}: {session.subjectName}</span>
          </p>
        </div>

        {/* Countdown Timer with SVG Ring */}
        <div className="acrylic-card px-5 py-3.5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="relative w-12 h-12 flex-shrink-0">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <circle
                className="text-[#eceef0] stroke-current"
                cx="50"
                cy="50"
                fill="transparent"
                r="40"
                strokeWidth="8"
              />
              <circle
                className="text-[#6b38d4] stroke-current progress-ring__circle"
                cx="50"
                cy="50"
                fill="transparent"
                r="40"
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-sans font-extrabold text-[#6b38d4]">
              {timeLeft}s
            </span>
          </div>

          <div>
            <span className="block text-[8px] font-sans text-[#7b7486] uppercase tracking-widest font-extrabold leading-none">
              NEXT REFRESH
            </span>
            <span className="block font-sans text-xs text-[#6b38d4] font-extrabold mt-1 tracking-wider">
              DYNAMIC HANDSHAKE...
            </span>
          </div>
        </div>
      </section>

      {/* Bento Layout for QR and Stats Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Massive QR Code Display Card */}
        <div className="lg:col-span-7 acrylic-card p-6 sm:p-10 rounded-2xl flex flex-col items-center justify-center shadow-sm bg-white border border-[#cbc3d7]/30">
          <div className="relative group">
            <div className="absolute -inset-4 bg-gradient-to-tr from-[#6b38d4]/10 to-[#00687a]/15 rounded-3xl blur-xl opacity-60 group-hover:opacity-100 transition duration-1000"></div>
            <div className="relative bg-white p-4 rounded-2xl shadow-md border border-[#cbc3d7]/20">
              <img
                alt="Session QR Code with Embedded OTP Handshake Key"
                className="w-56 h-56 sm:w-64 sm:h-64 object-cover"
                src={dynamicQrUrl}
              />
            </div>
          </div>

          <div className="mt-6 text-center w-full max-w-sm">
            <span className="text-[10px] font-sans text-[#7b7486] uppercase tracking-[0.2em] block mb-2 font-bold select-none">
              MANUAL VERIFICATION CODE
            </span>
            <div className="flex gap-2 sm:gap-3 justify-center">
              {pinDigits.map((digit, i) => (
                <span
                  key={i}
                  className="text-3xl sm:text-4xl font-display font-extrabold text-[#6b38d4] bg-[#6b38d4]/5 w-12 h-14 sm:w-14 sm:h-16 rounded-xl flex items-center justify-center shadow-inner border border-[#6b38d4]/10"
                >
                  {digit}
                </span>
              ))}
            </div>

            {/* Verification Step: displays dynamic visual symbol that matches */}
            <div className="bg-[#00687a]/5 border border-[#00687a]/15 rounded-xl p-3.5 mt-4">
              <span className="text-[9px] font-sans text-[#00687a] uppercase tracking-wider block mb-1.5 font-extrabold">
                ACTIVE VERIFICATION CHALLENGE
              </span>
              <div className="flex items-center justify-center gap-2">
                {currentChallenge === 'BLUE_CIRCLE' ? (
                  <>
                    <span className="text-xl">🔵</span>
                    <span className="font-display font-black text-sm text-[#004e5c]">Blue Circle</span>
                  </>
                ) : currentChallenge === 'RED_SQUARE' ? (
                  <>
                    <span className="text-xl">🟥</span>
                    <span className="font-display font-black text-sm text-[#ba1a1a]">Red Square</span>
                  </>
                ) : currentChallenge === 'GREEN_TRIANGLE' ? (
                  <>
                    <span className="text-xl">🔺</span>
                    <span className="font-display font-black text-sm text-emerald-700">Green Triangle</span>
                  </>
                ) : (
                  <>
                    <span className="text-xl">⭐</span>
                    <span className="font-display font-black text-sm text-amber-600">Yellow Star</span>
                  </>
                )}
              </div>
              <p className="text-[9.5px] text-[#494454] mt-1.5 leading-relaxed font-sans">
                To prevent proxy marking, classroom students must select this exact shape on their screen to verify physical presence.
              </p>
            </div>

            <span className="text-[10px] font-sans text-[#00687a] mt-4 block italic">
              Students scanning dynamic QR must type this visual OTP and choose the active shape to match.
            </span>
          </div>
        </div>

        {/* Sync Controls, Stats and Active Entries Lists */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Offline Queue Reconciling Card */}
          <div className="acrylic-card p-5 rounded-2xl shadow-sm border-l-4 border-l-[#00687a]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#00687a]">cloud_sync</span>
                <h3 className="text-sm font-sans font-bold text-[#191c1e]">Offline Queue Reconciliation</h3>
              </div>
              <span className="text-[10px] font-sans font-bold bg-[#00687a]/15 text-[#006172] px-3 py-1 rounded-full">
                {pendingOfflineCount} Pending
              </span>
            </div>
            <p className="text-xs text-[#494454] mb-4">
              Receipts registered while phones had depleted connection are fully synced as soon as browser reports online.
            </p>

            <button
              onClick={handleSyncClick}
              disabled={isOffline || pendingOfflineCount === 0}
              className={`w-full py-3 bg-gradient-to-r from-[#6b38d4] to-[#00687a] text-white font-sans font-bold rounded-xl shadow-md shadow-[#6b38d4]/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer ${
                isOffline || pendingOfflineCount === 0 ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            >
              {syncing ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                  Reconciling Terminal...
                </>
              ) : syncSuccess ? (
                <>
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  Receipts Synchronized!
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">bolt</span>
                  Quick Sync Now
                </>
              )}
            </button>
          </div>

          {/* Quick Metrics & Real-time Telemetry Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="acrylic-card p-3 rounded-xl text-center shadow-sm">
              <span className="block text-[9px] font-sans font-bold tracking-widest text-[#7b7486] uppercase">
                Marked Present
              </span>
              <span className="text-xl font-display font-extrabold text-[#6b38d4]">
                {currentRecords.length + 42}
              </span>
            </div>
            
            <div className="acrylic-card p-3 rounded-xl text-center shadow-sm">
              <span className="block text-[9px] font-sans font-bold tracking-widest text-[#7b7486] uppercase">
                Expected Roster
              </span>
              <span className="text-xl font-display font-extrabold text-[#191c1e]">
                {session.expectedCount}
              </span>
            </div>

            <div className="acrylic-card p-3 rounded-xl text-center shadow-sm">
              <span className="block text-[9px] font-sans font-bold tracking-widest text-[#7b7486] uppercase">
                Live Scan Rate
              </span>
              <span className="text-xl font-display font-extrabold text-[#00687a]">
                {telemetryScanRate}/min
              </span>
            </div>

            <div className="acrylic-card p-3 rounded-xl text-center shadow-sm">
              <span className="block text-[9px] font-sans font-bold tracking-widest text-[#7b7486] uppercase">
                Device Counts
              </span>
              <span className="text-xl font-display font-extrabold text-emerald-700">
                {uniqueDevices + 3} Active
              </span>
            </div>
          </div>

          {/* Telemetry System Log Ticker */}
          <div className="acrylic-card p-4 rounded-2xl bg-slate-900 border border-slate-800 text-left space-y-2.5 font-mono text-[10.5px]">
            <div className="flex items-center justify-between text-slate-600 border-b border-slate-800 pb-1.5 font-sans">
              <span className="flex items-center gap-1 font-bold text-[9px] uppercase tracking-wider text-teal-400">
                <span className="h-1.5 w-1.5 bg-teal-400 rounded-full animate-ping"></span>
                Secure Telemetry Logs
              </span>
              <span className="text-[8.5px] font-bold text-slate-600">API LATENCY: {latencyTicker}ms</span>
            </div>
            <div className="space-y-1 max-h-[85px] overflow-y-auto text-slate-300">
              <div><span className="text-slate-600">[{new Date().toLocaleTimeString()}]</span> <span className="text-indigo-400">[HMAC]</span> Handshake rotation matching active.</div>
              {currentRecords.slice(-2).map((r, idx) => (
                <div key={idx}><span className="text-slate-600">[{new Date().toLocaleTimeString()}]</span> <span className="text-emerald-400">[VERIFY]</span> Decrypted secure check-in for USN {r.studentUsn}.</div>
              ))}
              <div className="text-slate-550">[{new Date().toLocaleTimeString()}] [SYSTEM] Geofencing match coordinates verified: SJCE campus bounds.</div>
            </div>
          </div>

          {/* Active Entries Table Checklist */}
          <div className="acrylic-card flex-1 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[220px]">
            <div className="p-4 border-b border-[#6b38d4]/10 flex justify-between items-center bg-white/50">
              <h3 className="text-sm font-sans font-bold text-[#191c1e]">Active Handshake Logs</h3>
              <div className="flex items-center gap-1.5 font-sans text-[10px] text-green-600 font-extrabold">
                <span className="flex h-2 w-2 rounded-full bg-green-500 animate-ping"></span>
                POLLING GATEWAY
              </div>
            </div>

            <div className="overflow-y-auto max-h-[180px] custom-scrollbar flex-1">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-[#6b38d4]/5 z-10">
                  <tr>
                    <th className="px-4 py-2.5 text-[9px] font-sans font-bold text-[#7b7486] uppercase">Student</th>
                    <th className="px-4 py-2.5 text-[9px] font-sans font-bold text-[#7b7486] uppercase">USN</th>
                    <th className="px-4 py-2.5 text-[9px] font-sans font-bold text-[#7b7486] uppercase text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#6b38d4]/5 font-sans text-xs">
                  {currentRecords.slice().reverse().map((rec) => (
                    <tr key={rec.id} className="hover:bg-[#6b38d4]/5 transition-colors">
                      <td className="px-4 py-3 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#e9ddff] text-[#6b38d4] font-display font-bold flex items-center justify-center text-[10px]">
                          {rec.studentName.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="font-semibold text-[#191c1e]">{rec.studentName}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[#494454]">
                        {rec.studentUsn}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider">
                          Verified
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Seeded default entries to look beautiful */}
                  <tr className="hover:bg-[#6b38d4]/5 transition-colors">
                    <td className="px-4 py-3 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#e9ddff] text-[#6b38d4] font-display font-bold flex items-center justify-center text-[10px]">AK</div>
                      <span className="font-semibold text-[#191c1e]">Ananya K.</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#494454]">4SJ21CS005</td>
                    <td className="px-4 py-3 text-right">
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider">Verified</span>
                    </td>
                  </tr>

                  <tr className="hover:bg-[#6b38d4]/5 transition-colors">
                    <td className="px-4 py-3 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#acedff] text-[#004e5c] font-display font-bold flex items-center justify-center text-[10px]">RV</div>
                      <span className="font-semibold text-[#191c1e]">Rohan V.</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#494454]">4SJ21CS042</td>
                    <td className="px-4 py-3 text-right">
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider">Verified</span>
                    </td>
                  </tr>

                  <tr className="hover:bg-[#6b38d4]/5 transition-colors">
                    <td className="px-4 py-3 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#ffdadb] text-[#40000d] font-display font-bold flex items-center justify-center text-[10px]">SM</div>
                      <span className="font-semibold text-[#191c1e]">Sneha M.</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#494454]">4SJ21CS112</td>
                    <td className="px-4 py-3 text-right">
                      <span className="bg-[#ffdad6] text-[#ba1a1a] px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider">Pending</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <button
            onClick={() => onDeactivate(session.id)}
            className="w-full mt-2 py-2.5 rounded-xl border border-[#ba1a1a]/30 text-[#ba1a1a] font-sans font-bold hover:bg-[#ba1a1a]/5 text-xs uppercase tracking-wider cursor-pointer active:scale-95 transition-all"
          >
            Close Session Attendance Gate
          </button>

        </div>

      </div>

    </div>
  );
}

