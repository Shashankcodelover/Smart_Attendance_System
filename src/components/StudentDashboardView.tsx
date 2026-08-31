import React, { useState, useEffect } from 'react';
import { Student, Session } from '../types';

interface StudentDashboardViewProps {
  onCheckInClick: () => void;
  currentUser?: { codeOrUsn: string; name: string } | null;
  students?: Student[];
  sessions?: Session[];
}

export default function StudentDashboardView({ onCheckInClick, currentUser, sessions = [] }: StudentDashboardViewProps) {
  const [now, setNow] = useState(new Date());
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [bunkData, setBunkData] = useState<any>(null);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const [dashRes, bunkRes, leaveRes] = await Promise.all([
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
        fetch(`/api/leave/requests?studentUsn=${usn}`).catch(() => null)
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
  const records = dashboardData?.records || [];
  const stats = dashboardData?.stats || [];

  // Overall attendance calculation from real records or student record
  let overallPct = student?.attendanceRate ?? 85;
  if (stats.length > 0) {
    const totalSessions = stats.reduce((acc: number, s: any) => acc + (s.total_sessions || 0), 0);
    const attended = stats.reduce((acc: number, s: any) => acc + (s.attended_sessions || 0), 0);
    if (totalSessions > 0) {
      overallPct = Math.round((attended / totalSessions) * 100);
    }
  }

  const displayName = currentUser?.name?.split(' ')[0] || student?.name?.split(' ')[0] || 'Student';
  const myUsn = currentUser?.codeOrUsn?.toUpperCase() || student?.usn || '';

  const attendanceStatus = overallPct >= 85 ? 'Healthy' : overallPct >= 75 ? 'Moderate' : 'Critical';
  const attendanceColor = overallPct >= 85 ? '#6b38d4' : overallPct >= 75 ? '#f59e0b' : '#ba1a1a';
  const statusTagColor = overallPct >= 85 ? 'text-[#6b38d4] bg-[#6b38d4]/5' : overallPct >= 75 ? 'text-amber-700 bg-amber-50' : 'text-[#ba1a1a] bg-red-50';

  const circleCircumference = 408.4;
  const strokeDashoffset = circleCircumference * (1 - overallPct / 100);

  const activeSessions = sessions.filter(s => s.status === 'ACTIVE');
  const currentTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return <div className="p-12 text-center text-slate-500 animate-pulse font-sans text-sm">Loading your real-time academic profile...</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-red-500 font-sans text-sm">Error: {error}</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Welcome & Status Bento Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

        {/* Welcome card */}
        <div className="md:col-span-8 acrylic-card rounded-2xl p-6 flex flex-col justify-between overflow-hidden relative group border border-[#eceef0]">
          <div className="relative z-10 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[10px] uppercase tracking-widest font-extrabold px-2.5 py-1 rounded-full inline-block ${statusTagColor}`}>
                {attendanceStatus === 'Healthy' ? 'OPTIMAL PROFILE' : attendanceStatus === 'Moderate' ? 'MODERATE STANDING' : '⚠ ATTENDANCE ALERT'}
              </span>
              <span className="text-[10px] font-sans font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {student?.department || 'Computer Science'} &bull; Year {student?.year || 3} &bull; Sec {student?.section || 'A'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-semibold text-[#191c1e] leading-snug">
              Welcome back, {displayName}.
            </h1>
            {myUsn && (
              <p className="text-xs font-mono text-[#7b7486]">USN: {myUsn} &bull; Roll: {student?.roll_number || myUsn.slice(-3)}</p>
            )}
            <p className="text-xs text-[#494454] max-w-md leading-relaxed">
              {overallPct >= 75
                ? `Your attendance is in good standing at ${overallPct}%. You are clear for university semester exams.`
                : `Warning: Your attendance is ${overallPct}%, below the mandatory 75% cutoff. Attend upcoming lectures to prevent detention.`}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3 relative z-10">
            <button
              onClick={onCheckInClick}
              className="px-6 py-2.5 bg-gradient-to-r from-[#6b38d4] to-[#8455ef] hover:from-[#8455ef] hover:to-[#6b38d4] text-white font-display text-sm font-semibold rounded-xl shadow-md hover:scale-[1.01] transition-transform flex items-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">qr_code_scanner</span>
              Check-in with QR / OTP
            </button>
            <button
              onClick={() => setShowLeaveModal(true)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-sans text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <span className="material-symbols-outlined text-sm">event_busy</span>
              Apply Leave / OD Claim
            </button>
          </div>

          <div className="absolute -right-16 -bottom-16 w-48 h-48 bg-[#6b38d4]/5 rounded-full blur-3xl pointer-events-none group-hover:bg-[#6b38d4]/10 transition-colors" />
        </div>

        {/* Live session alert or time card */}
        <div className="md:col-span-4 acrylic-card rounded-2xl p-6 flex flex-col items-center justify-center text-center border border-slate-100">
          {activeSessions.length > 0 ? (
            <>
              <span className="flex h-3 w-3 relative mb-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-[9px] font-sans font-extrabold text-emerald-600 uppercase tracking-wider mb-1">
                Live Session Active!
              </span>
              <p className="font-display font-bold text-base text-[#191c1e]">
                {activeSessions[0].subjectCode}
              </p>
              <p className="text-xs text-[#7b7486] font-sans mt-0.5 font-semibold">
                {activeSessions[0].subjectName}
              </p>
              <p className="text-[10px] text-emerald-600 font-bold mt-1">
                Sec {activeSessions[0].section} &bull; Year {activeSessions[0].year}
              </p>
              <button
                onClick={onCheckInClick}
                className="mt-3 px-4 py-2 bg-emerald-600 text-white text-[11px] font-bold rounded-xl hover:bg-emerald-700 transition-all cursor-pointer shadow-xs"
              >
                Mark Presence Now &rarr;
              </button>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[36px] text-[#6b38d4]/30 mb-2">sensors_off</span>
              <p className="font-display font-bold text-sm text-[#191c1e]">No Active Session Gate</p>
              <p className="text-xs text-[#7b7486] font-sans mt-1 leading-relaxed">
                Your faculty hasn't broadcasted an attendance gate yet. It will alert automatically when class opens.
              </p>
              <p className="text-[10px] font-mono text-[#7b7486] mt-3">{currentTime}</p>
            </>
          )}
        </div>
      </div>

      {/* Attendance Health & Bunk Radar Overview */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

        {/* Progress ring */}
        <div className="md:col-span-4 acrylic-card rounded-2xl p-6 flex flex-col items-center shadow-sm border border-slate-100">
          <h3 className="font-display font-bold self-start text-[#191c1e] text-base mb-4">
            Cumulative Attendance
          </h3>

          <div className="relative w-36 h-36 flex items-center justify-center">
            <svg className="w-full h-full">
              <circle className="text-[#eceef0] stroke-current" cx="72" cy="72" fill="transparent" r="58" strokeWidth="9" />
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
              <span className="text-3xl font-display font-bold text-[#191c1e]">
                {overallPct}%
              </span>
              <span className="text-[9px] font-sans font-bold tracking-widest uppercase mt-0.5" style={{ color: attendanceColor }}>
                {attendanceStatus}
              </span>
            </div>
          </div>

          <div className="mt-5 w-full grid grid-cols-3 gap-2 px-1 font-sans text-xs text-center border-t border-slate-100 pt-3">
            <div>
              <p className="text-[9px] text-[#7b7486] uppercase font-bold tracking-wider mb-0.5">Threshold</p>
              <p className="font-bold text-slate-800 text-sm">75%</p>
            </div>
            <div>
              <p className="text-[9px] text-[#7b7486] uppercase font-bold tracking-wider mb-0.5">Courses</p>
              <p className="font-bold text-[#6b38d4] text-sm">{stats.length || 3}</p>
            </div>
            <div>
              <p className="text-[9px] text-[#7b7486] uppercase font-bold tracking-wider mb-0.5">Status</p>
              <p className="font-bold text-sm" style={{ color: attendanceColor }}>{attendanceStatus}</p>
            </div>
          </div>
        </div>

        {/* Live Subject-wise Breakdown Table */}
        <div className="md:col-span-8 acrylic-card rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-display font-bold text-base text-[#191c1e]">Subject Attendance Breakdown</h3>
            <span className="text-[10px] uppercase font-sans tracking-wide text-[#7b7486] font-bold">Live Records</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-150 flex-1">
            <table className="w-full text-left font-sans text-xs">
              <thead className="bg-slate-50 border-b border-slate-150">
                <tr>
                  <th className="px-3.5 py-2.5 font-bold text-slate-500 uppercase text-[9px]">Course</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-500 uppercase text-[9px] text-center">Conducted</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-500 uppercase text-[9px] text-center">Attended</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-500 uppercase text-[9px] text-center">Percentage</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-500 uppercase text-[9px] text-right">Bunk Buffer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-400 text-xs">
                      No subject records marked yet. Check in to live sessions to populate real statistics.
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
                          <p className="font-bold text-slate-800">{st.subject_code}</p>
                          <p className="text-[10px] text-slate-500">{st.subject_name}</p>
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-semibold">{st.total_sessions}</td>
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
                            <span className="text-emerald-700 font-bold text-[11px]">{canBunkCount} safe bunks</span>
                          ) : (
                            <span className="text-rose-700 font-bold text-[11px]">Need {reqCount} classes</span>
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
      </div>

      {/* Leave Application History Tracker */}
      <div className="acrylic-card rounded-2xl p-6 shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#6b38d4] text-lg">history_edu</span>
            <h3 className="font-display font-bold text-base text-[#191c1e]">Your Leave & Medical Claims</h3>
          </div>
          <button
            onClick={() => setShowLeaveModal(true)}
            className="text-xs font-bold text-[#6b38d4] hover:underline cursor-pointer"
          >
            + New Claim
          </button>
        </div>

        {leaveRequests.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">No leave claims submitted. Medical and on-duty exemptions will display here.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-150">
            <table className="w-full text-left font-sans text-xs">
              <thead className="bg-slate-50 border-b border-slate-150">
                <tr>
                  <th className="px-3 py-2 font-bold text-slate-500 uppercase text-[9px]">Type</th>
                  <th className="px-3 py-2 font-bold text-slate-500 uppercase text-[9px]">Duration</th>
                  <th className="px-3 py-2 font-bold text-slate-500 uppercase text-[9px]">Reason</th>
                  <th className="px-3 py-2 font-bold text-slate-500 uppercase text-[9px] text-right">Status</th>
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

      {/* --- LEAVE MODAL --- */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-display font-bold text-lg text-[#191c1e]">Apply for Leave / OD Claim</h3>
              <button onClick={() => setShowLeaveModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
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
