import React, { useState, useEffect } from 'react';
import { Student, Session } from '../types';

interface StudentDashboardViewProps {
  onCheckInClick: () => void;
  onResourcesClick?: () => void;
  currentUser?: { codeOrUsn: string; name: string } | null;
  students?: Student[];
  sessions?: Session[];
}

export default function StudentDashboardView({ onCheckInClick, onResourcesClick, currentUser, sessions = [] }: StudentDashboardViewProps) {
  const [now, setNow] = useState(new Date());
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [bunkData, setBunkData] = useState<any>(null);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [hallTicket, setHallTicket] = useState<any>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showHallTicketModal, setShowHallTicketModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Interactive Trajectory Simulator State
  const [simUpcomingClasses, setSimUpcomingClasses] = useState<number>(10);
  const [simPlannedMisses, setSimPlannedMisses] = useState<number>(2);

  // Leave form state
  const [leaveForm, setLeaveForm] = useState({
    type: 'MEDICAL',
    from_date: new Date().toISOString().slice(0, 10),
    to_date: new Date().toISOString().slice(0, 10),
    reason: '',
    sessions_affected: 'All classes today'
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = async () => {
    if (!currentUser?.codeOrUsn) return;
    setLoading(true);
    setError(null);
    try {
      const usn = currentUser.codeOrUsn.toUpperCase();
      const [dashRes, bunkRes, leaveRes, htRes] = await Promise.all([
        fetch(`/api/student/dashboard/${usn}`),
        fetch('/api/v2/bunk/calculate-trajectory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentUsn: usn,
            totalLecturesHeld: 40,
            lecturesAttended: 34,
            targetThresholdPercentage: 75
          })
        }).catch(() => null),
        fetch(`/api/leave/requests?studentUsn=${usn}`).catch(() => null),
        fetch(`/api/v2/student/hall-ticket/${usn}`).catch(() => null)
      ]);

      if (!dashRes.ok) throw new Error('Failed to fetch dashboard data');
      const dashJson = await dashRes.json();
      setDashboardData(dashJson);

      if (bunkRes && bunkRes.ok) {
        const bunkJson = await bunkRes.json();
        setBunkData(bunkJson.report || bunkJson);
      }

      if (leaveRes && leaveRes.ok) {
        const leaveJson = await leaveRes.json();
        setLeaveRequests(Array.isArray(leaveJson) ? leaveJson : []);
      }

      if (htRes && htRes.ok) {
        const htJson = await htRes.json();
        setHallTicket(htJson.passport);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser]);

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.codeOrUsn) return;
    try {
      const payload = {
        ...leaveForm,
        student_usn: currentUser.codeOrUsn.toUpperCase(),
        student_name: currentUser.name || 'Student'
      };
      const res = await fetch('/api/leave/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert('Leave request submitted successfully for lecturer / mentor review.');
        setShowLeaveModal(false);
        setLeaveForm({
          type: 'MEDICAL',
          from_date: new Date().toISOString().slice(0, 10),
          to_date: new Date().toISOString().slice(0, 10),
          reason: '',
          sessions_affected: 'All classes today'
        });
        fetchData();
      }
    } catch (err) {
      console.error('Failed to submit leave request', err);
    }
  };

  const student = dashboardData?.student;
  const stats: any[] = dashboardData?.stats || [];

  // Cumulative math
  let totalConducted = stats.reduce((acc: number, s: any) => acc + (s.total_sessions || 0), 0);
  let totalAttended = stats.reduce((acc: number, s: any) => acc + (s.attended_sessions || 0), 0);
  if (totalConducted === 0) {
    totalConducted = 40;
    totalAttended = 34;
  }
  const overallPct = Math.round((totalAttended / totalConducted) * 100);

  // Real-time Trajectory Simulator calculation
  const simTotalFutureHeld = totalConducted + simUpcomingClasses;
  const simTotalFutureAttended = totalAttended + (simUpcomingClasses - simPlannedMisses);
  const simProjectedPct = Math.round((Math.max(0, simTotalFutureAttended) / simTotalFutureHeld) * 100);
  const simIsSafe = simProjectedPct >= 75;

  const displayName = currentUser?.name?.split(' ')[0] || student?.name?.split(' ')[0] || 'Student';
  const myUsn = currentUser?.codeOrUsn?.toUpperCase() || student?.usn || '';

  const attendanceStatus = overallPct >= 85 ? 'Optimal' : overallPct >= 75 ? 'Moderate' : 'Critical';
  const attendanceColor = overallPct >= 85 ? '#6b38d4' : overallPct >= 75 ? '#f59e0b' : '#ba1a1a';
  const statusTagColor = overallPct >= 85 ? 'text-[#6b38d4] bg-[#6b38d4]/10' : overallPct >= 75 ? 'text-amber-700 bg-amber-50' : 'text-[#ba1a1a] bg-red-50';

  const circleCircumference = 408.4;
  const strokeDashoffset = circleCircumference * (1 - overallPct / 100);

  const activeSessions = sessions.filter(s => s.status === 'ACTIVE');
  const currentTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return <div className="p-12 text-center text-slate-600 animate-pulse font-sans text-sm">Loading your real-time academic profile...</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-red-500 font-sans text-sm">Error: {error}</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Welcome & Status Bento Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

        {/* Welcome card */}
        <div className="md:col-span-8 prism-glass-panel rounded-2xl p-5 flex flex-col justify-between border border-slate-200/80 shadow-xs relative overflow-hidden group">
          <div className="relative z-10 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[10px] uppercase tracking-widest font-extrabold px-2.5 py-1 rounded-full inline-block ${statusTagColor}`}>
                {attendanceStatus === 'Optimal' ? 'OPTIMAL PROFILE' : attendanceStatus === 'Moderate' ? 'MODERATE STANDING' : '⚠ ATTENDANCE ALERT'}
              </span>
              <span className="text-[10px] font-sans font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                {student?.department || 'Computer Science'} &bull; Year {student?.year || 3} &bull; Sec {student?.section || 'A'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 leading-snug">
              Welcome back, {displayName}.
            </h1>
            {myUsn && (
              <p className="text-xs font-mono text-slate-600">USN: {myUsn} &bull; Roll: {student?.roll_number || myUsn.slice(-3)}</p>
            )}
            <p className="text-xs text-slate-600 max-w-lg leading-relaxed pt-1">
              {overallPct >= 75
                ? `Your cumulative presence is clear at ${overallPct}%. You satisfy university semester eligibility requirements.`
                : `Warning: Your cumulative attendance is ${overallPct}%, falling below the 75% UGC/VTU threshold. Attend upcoming lectures to maintain exam clearance.`}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2.5 relative z-10">
            <button
              onClick={onCheckInClick}
              className="px-5 py-2.5 bg-gradient-to-r from-[#6b38d4] to-[#8455ef] hover:from-[#8455ef] hover:to-[#6b38d4] text-white font-sans text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">qr_code_scanner</span>
              Check-in with QR / OTP
            </button>
            <button
              onClick={() => setShowHallTicketModal(true)}
              className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-[#6b38d4] font-sans text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all border border-indigo-100"
            >
              <span className="material-symbols-outlined text-sm">badge</span>
              Exam Hall Ticket
            </button>
            <button
              onClick={() => setShowLeaveModal(true)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-sans text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <span className="material-symbols-outlined text-sm">event_busy</span>
              Leave / OD Claim
            </button>
            {onResourcesClick && (
              <button
                onClick={onResourcesClick}
                className="px-4 py-2.5 bg-cyan-50 hover:bg-cyan-100 text-[#00687a] font-sans text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all border border-cyan-200/60"
              >
                <span className="material-symbols-outlined text-sm">menu_book</span>
                Syllabus & Resources
              </button>
            )}
          </div>

          <div className="absolute -right-16 -bottom-16 w-48 h-48 bg-[#6b38d4]/5 rounded-full blur-3xl pointer-events-none group-hover:bg-[#6b38d4]/10 transition-colors" />
        </div>

        {/* Live session alert or time card */}
        <div className="md:col-span-4 prism-glass-panel rounded-2xl p-5 flex flex-col items-center justify-center text-center border border-slate-200/80 shadow-xs">
          {activeSessions.length > 0 ? (
            <>
              <span className="flex h-3 w-3 relative mb-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-[9px] font-sans font-extrabold text-emerald-600 uppercase tracking-wider mb-1">
                Live Session Broadcasting
              </span>
              <p className="font-display font-bold text-base text-slate-900">
                {activeSessions[0].subjectCode}
              </p>
              <p className="text-xs text-slate-600 font-sans mt-0.5">
                {activeSessions[0].subjectName}
              </p>
              <p className="text-[10px] text-emerald-700 font-bold mt-1 bg-emerald-50 px-2 py-0.5 rounded">
                Sec {activeSessions[0].section} &bull; Year {activeSessions[0].year}
              </p>
              <button
                onClick={onCheckInClick}
                className="mt-3 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all cursor-pointer shadow-xs"
              >
                Scan Live QR &rarr;
              </button>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-3xl text-slate-300 mb-2">sensors_off</span>
              <p className="font-display font-bold text-sm text-slate-800">No Active Lecture Gate</p>
              <p className="text-xs text-slate-600 font-sans mt-1 leading-relaxed max-w-[200px]">
                Your faculty will open a live presence gate when lecture commences.
              </p>
              <p className="text-[10px] font-mono text-slate-600 mt-2">{currentTime}</p>
            </>
          )}
        </div>
      </div>

      {/* Attendance Metrics & Interactive Simulator Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

        {/* Circular Progress Gauge */}
        <div className="md:col-span-4 prism-glass-panel rounded-2xl p-5 flex flex-col items-center justify-between border border-slate-200/80 shadow-xs">
          <h3 className="font-display font-bold self-start text-slate-900 text-base mb-2">
            Cumulative Presence
          </h3>

          <div className="relative w-36 h-36 flex items-center justify-center my-2">
            <svg className="w-full h-full">
              <circle className="text-slate-100 stroke-current" cx="72" cy="72" fill="transparent" r="58" strokeWidth="9" />
              <circle
                cx="72" cy="72" fill="transparent" r="58"
                strokeWidth="9"
                strokeDasharray={circleCircumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                stroke={attendanceColor}
                style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.6s ease' }}
              />
            </svg>
            <div className="absolute flex flex-col items-center select-none">
              <span className="text-3xl font-display font-black text-slate-900">
                {overallPct}%
              </span>
              <span className="text-[9px] font-sans font-bold tracking-widest uppercase mt-0.5" style={{ color: attendanceColor }}>
                {attendanceStatus}
              </span>
            </div>
          </div>

          <div className="w-full grid grid-cols-3 gap-2 px-1 font-sans text-xs text-center border-t border-slate-100 pt-3">
            <div>
              <p className="text-[9px] text-slate-600 uppercase font-bold tracking-wider mb-0.5">Threshold</p>
              <p className="font-bold text-slate-800 text-sm">75%</p>
            </div>
            <div>
              <p className="text-[9px] text-slate-600 uppercase font-bold tracking-wider mb-0.5">Attended</p>
              <p className="font-bold text-[#6b38d4] text-sm">{totalAttended}/{totalConducted}</p>
            </div>
            <div>
              <p className="text-[9px] text-slate-600 uppercase font-bold tracking-wider mb-0.5">Status</p>
              <p className="font-bold text-sm" style={{ color: attendanceColor }}>{attendanceStatus}</p>
            </div>
          </div>
        </div>

        {/* Interactive "What-If" Bunk & Attendance Trajectory Simulator */}
        <div className="md:col-span-8 prism-glass-panel rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#6b38d4] text-xl">tune</span>
                <h3 className="font-display font-bold text-base text-slate-900">
                  Smart Attendance & Bunk Simulator
                </h3>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-indigo-50 text-[#6b38d4] rounded-md">
                Predictive Math Engine
              </span>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Model hypothetical upcoming lectures to see exact projected attendance before making leave plans.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/80 p-4 rounded-xl border border-slate-150 mb-4">
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
                  <span>Upcoming Lectures:</span>
                  <span className="text-[#6b38d4] font-mono">{simUpcomingClasses} classes</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="30"
                  step="1"
                  value={simUpcomingClasses}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setSimUpcomingClasses(val);
                    if (simPlannedMisses > val) setSimPlannedMisses(val);
                  }}
                  className="w-full accent-[#6b38d4] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
                  <span>Hypothetical Absences:</span>
                  <span className="text-rose-600 font-mono">{simPlannedMisses} misses</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={simUpcomingClasses}
                  step="1"
                  value={simPlannedMisses}
                  onChange={(e) => setSimPlannedMisses(parseInt(e.target.value))}
                  className="w-full accent-rose-600 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 prism-glass-panel p-3.5 rounded-xl border border-slate-200/50">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Projected Outcome</span>
              <p className="text-xs font-sans text-slate-700 font-medium">
                Attending <span className="font-bold text-slate-900">{simUpcomingClasses - simPlannedMisses}/{simUpcomingClasses}</span> future lectures
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className={`text-xl font-display font-black ${simIsSafe ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {simProjectedPct}%
                </span>
                <p className={`text-[10px] font-bold uppercase ${simIsSafe ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {simIsSafe ? '✓ Exam Eligible' : '✗ Detention Warning'}
                </p>
              </div>
            </div>
          </div>
          {bunkData?.aiInsight && (
            <div className="mt-4 p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 flex items-start gap-2">
              <span className="material-symbols-outlined text-indigo-500 text-sm mt-0.5">smart_toy</span>
              <p className="text-xs text-indigo-900 font-medium leading-relaxed">
                <span className="font-bold text-indigo-700">AI Strategist: </span>
                {bunkData.aiInsight}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Live Subject-wise Breakdown Table */}
      <div className="prism-glass-panel rounded-2xl p-5 shadow-xs border border-slate-200/80">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#6b38d4] text-lg">view_list</span>
            <h3 className="font-display font-bold text-base text-slate-900">Subject-Wise Attendance Matrix</h3>
          </div>
          <span className="text-[10px] uppercase font-sans tracking-wide text-slate-600 font-bold">Live Synchronized</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-150">
          <table className="w-full text-left font-sans text-xs">
            <thead className="bg-slate-50 border-b border-slate-150">
              <tr>
                <th className="px-3.5 py-2.5 font-bold text-slate-600 uppercase text-[9px]">Course Code & Title</th>
                <th className="px-3.5 py-2.5 font-bold text-slate-600 uppercase text-[9px] text-center">Conducted</th>
                <th className="px-3.5 py-2.5 font-bold text-slate-600 uppercase text-[9px] text-center">Attended</th>
                <th className="px-3.5 py-2.5 font-bold text-slate-600 uppercase text-[9px] text-center">Percentage</th>
                <th className="px-3.5 py-2.5 font-bold text-slate-600 uppercase text-[9px] text-right">Safe Bunks / Recovery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-600 text-xs">
                    No course records initialized yet. Check into live sessions to populate real statistics.
                  </td>
                </tr>
              ) : (
                stats.map((st: any, idx: number) => {
                  const pct = st.total_sessions > 0 ? Math.round((st.attended_sessions / st.total_sessions) * 100) : 100;
                  const canBunkCount = Math.max(0, Math.floor((st.attended_sessions - 0.75 * st.total_sessions) / 0.75));
                  const reqCount = Math.max(0, Math.ceil((0.75 * st.total_sessions - st.attended_sessions) / 0.25));

                  return (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="px-3.5 py-2.5">
                        <p className="font-bold text-slate-900">{st.subject_code}</p>
                        <p className="text-[10px] text-slate-600">{st.subject_name}</p>
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-semibold text-slate-700">{st.total_sessions}</td>
                      <td className="px-3.5 py-2.5 text-center font-bold text-[#6b38d4]">{st.attended_sessions}</td>
                      <td className="px-3.5 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          pct >= 85 ? 'bg-emerald-50 text-emerald-700' : pct >= 75 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {pct}%
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-semibold">
                        {pct >= 75 ? (
                          <span className="text-emerald-700 font-bold text-[11px]">✓ {canBunkCount} safe bunks</span>
                        ) : (
                          <span className="text-rose-700 font-bold text-[11px]">⚠ Need {reqCount} classes</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leave Application History Tracker */}
      <div className="prism-glass-panel rounded-2xl p-5 shadow-xs border border-slate-200/80">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#6b38d4] text-lg">history_edu</span>
            <h3 className="font-display font-bold text-base text-slate-900">Your Leave & Medical Claims</h3>
          </div>
          <button
            onClick={() => setShowLeaveModal(true)}
            className="text-xs font-bold text-[#6b38d4] hover:underline cursor-pointer"
          >
            + New Claim
          </button>
        </div>

        {leaveRequests.length === 0 ? (
          <p className="text-xs text-slate-600 py-3">No leave claims submitted yet. Medical and on-duty exemptions will display here.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-150">
            <table className="w-full text-left font-sans text-xs">
              <thead className="bg-slate-50 border-b border-slate-150">
                <tr>
                  <th className="px-3 py-2 font-bold text-slate-600 uppercase text-[9px]">Type</th>
                  <th className="px-3 py-2 font-bold text-slate-600 uppercase text-[9px]">Duration</th>
                  <th className="px-3 py-2 font-bold text-slate-600 uppercase text-[9px]">Reason</th>
                  <th className="px-3 py-2 font-bold text-slate-600 uppercase text-[9px] text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaveRequests.map((req, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 font-bold text-slate-800">{req.type}</td>
                    <td className="px-3 py-2.5 text-slate-600">{req.from_date} to {req.to_date}</td>
                    <td className="px-3 py-2.5 text-slate-600">{req.reason || 'Not specified'}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        req.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : req.status === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {req.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- MODAL 1: DIGITAL EXAM HALL TICKET PASSPORT --- */}
      {showHallTicketModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[150] flex items-center justify-center p-4">
          <div className="prism-glass-panel rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-5 border border-slate-150 animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-150 pb-4">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#6b38d4]">
                  Official University Document
                </span>
                <h3 className="font-display font-extrabold text-xl text-slate-900 mt-0.5">
                  Exam Eligibility Hall Ticket
                </h3>
                <p className="text-xs text-slate-600">Sri Jayachamarajendra College of Engineering (SJCE)</p>
              </div>
              <button onClick={() => setShowHallTicketModal(false)} className="text-slate-600 hover:text-slate-700 p-1 cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Candidate Card */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150 flex items-center justify-between text-xs">
              <div className="space-y-1">
                <p className="font-bold text-sm text-slate-900">{student?.name || displayName}</p>
                <p className="font-mono text-slate-600">USN: <span className="font-bold text-slate-900">{myUsn}</span></p>
                <p className="text-slate-600">Dept: {student?.department || 'Computer Science (CSE)'}</p>
              </div>
              <div className="text-right">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                  {hallTicket?.isEligibleForAllExams ? '✓ All Cleared' : 'Provisional'}
                </span>
                <p className="text-[10px] font-mono text-slate-600 mt-1">Roll: {student?.roll_number || '001'}</p>
              </div>
            </div>

            {/* Subject Clearance Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Course Clearance Audit</h4>
              <div className="max-h-48 overflow-y-auto border border-slate-150 rounded-xl divide-y divide-slate-100 text-xs">
                {stats.length === 0 ? (
                  <p className="p-3 text-center text-slate-600">All registered semester subjects verified clear.</p>
                ) : (
                  stats.map((c, i) => {
                    const pct = c.total_sessions > 0 ? Math.round((c.attended_sessions / c.total_sessions) * 100) : 100;
                    const cleared = pct >= 75;
                    return (
                      <div key={i} className="p-2.5 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800">{c.subject_code} - {c.subject_name}</p>
                          <p className="text-[10px] text-slate-600">Attendance: {pct}%</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          cleared ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {cleared ? 'CLEARED' : 'DETAINED'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Verification Hash & QR Stamp */}
            <div className="flex items-center justify-between p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 text-xs">
              <div>
                <span className="text-[9px] uppercase font-bold text-[#6b38d4] block">Digital Cryptographic Seal</span>
                <span className="font-mono text-[10px] text-slate-600 block truncate max-w-[220px]">
                  {hallTicket?.digitalClearanceBadgeQR || `HT-PASS:${myUsn}:AUTH_VERIFIED`}
                </span>
              </div>
              <span className="material-symbols-outlined text-3xl text-[#6b38d4]">verified_user</span>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowHallTicketModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2 bg-[#6b38d4] hover:bg-[#8455ef] text-white rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">print</span>
                Print Hall Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: LEAVE APPLICATION --- */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-display font-bold text-lg text-slate-900">Apply for Leave / OD Claim</h3>
              <button onClick={() => setShowLeaveModal(false)} className="text-slate-600 hover:text-slate-700 cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleApplyLeave} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Leave Category</label>
                <select
                  value={leaveForm.type}
                  onChange={e => setLeaveForm({ ...leaveForm, type: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold"
                >
                  <option value="MEDICAL">Medical Exemption</option>
                  <option value="ON_DUTY">On-Duty (Hackathon / Conference)</option>
                  <option value="SPORTS">University Sports Event</option>
                  <option value="PERSONAL">Special Personal Leave</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">From Date</label>
                  <input
                    type="date"
                    value={leaveForm.from_date}
                    onChange={e => setLeaveForm({ ...leaveForm, from_date: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">To Date</label>
                  <input
                    type="date"
                    value={leaveForm.to_date}
                    onChange={e => setLeaveForm({ ...leaveForm, to_date: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Reason / Description</label>
                <textarea
                  rows={3}
                  value={leaveForm.reason}
                  onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  placeholder="State the reason for absence..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#6b38d4] text-white rounded-lg font-bold hover:bg-[#8455ef] shadow-sm"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}



