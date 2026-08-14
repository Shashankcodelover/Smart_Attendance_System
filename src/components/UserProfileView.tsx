import React, { useState } from 'react';
import { Student } from '../types';

interface UserProfileViewProps {
  persona: 'lecturer' | 'student';
  currentUser: { codeOrUsn: string; name: string; email?: string } | null;
  onUpdateUser: (updatedCreds: { codeOrUsn: string; name: string; email?: string }) => void;
  students?: Student[];
  onRefreshRoster?: () => void;
  onResetTour: () => void;
}

const AVATAR_PRESETS = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCvqPQHLs8fAo0h0Meuc0c0CSu_1Xr-vjpdMnz3TsTHyxtBK7LfJkRXS7LMHlOb1vFBcHSfkoSMCWQhxGhz3zpLmw_Mb_OsOQEDIrldR1ssshZK8_C1hHKRphePXDIHbMLbU2ySP2M1wNFGYB_HEocAJsErcZfrtPFOu0eFOyWz3CdvLT4fJZzSFBAQOnc0AhzihY0b2_R3lJt2i2Fh10aTR5NlM-uTwFBr1mvi3f0rO7oFne_8DquJcdsB2FMDxNERQ1I8m8mTiNsD',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAI5zb_xDryBO-Urr_VPWO4XwQ8j97kowR01KJIOy0CBKBw3zuwzO42wB3KxiV9cBfx-vP4faJxIfjWwWGqUw0g0TZz7Fygx9hfULbrHvtmKmmwVWSnuFBQL-Q6konK-6elQlgvyGirl2m_0mgabzc1hAFVIgpawC3n_06imn3JfBJai8WdQqBbfYRiJDeR-Ud3waBfiW2yqwncWQ216wOtiDeauqhI3q-nBtGPHz879rqP_IhODpE3F24sB0Pd5ehoPeqgUA0EDc7b',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC6TCkGLdQmC-wiWlzZcm5tAZT52rq2ZlKZ5zgIcgOwjJ3vbFcHde8GK3b-chr_x6LNfR5Xm6C19HA5EUA8Bsaz32NcQmcvvBHabP15HWYSlbQI3MVcHFdInm9mdP6NXfcVKzYKQhFdnbOKrfbaXiidXSUjuZyUnDh8txZ2L-XKNcazFmleP-ic2ugTQDJpD-A63x-UShHnlJMJc38fLwzGXAT-T5gsyGvFhhkp6ActNNiqMWqQv0sE8sG4FXt7kkDVhMKaff0AwDLp',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDzZN9rs10ZaNHQlGZC291aVwftnrpmYF6_VICDftYHDDBXaeFblUMihY5gqNPGGrrkTmq0WJeIoCflnh8Mb1tIdS9aQEvRPYuOdlzxR_Q_56a_lOZuYp8JuKH85TdxMNbSR_rG1ieqHO-sZjfMq7N8SjvmNFXAsIpVI11mEvlC89zkg6zMyunDo9AG91ih46KmuDI4Zzu5-Z2pHUt-pwIZLip8-78TDF_cLZxR78TJqz5dL962FxANfuG9XsS2bTHiy47xU4y72RSf',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCrnmOpZYwMFvyoyIDr0laEPV0oi6_6LDXCNMzTQWrYF3n0c6lW8PT3kNaeLQe5KetziC72iDKhtG9XFkZ-7pyybwvvKFPDOHLiP7ilhDws_9_wddEVzATDN9niHufwsWdP_n_Tw0D3tkhjJE_ylILyvoomZ2QsN0x8bW7vy7f7lLn0pps2ch2Wa5M2H_Tk44rpHywDZlTWZY9l-6i1oVp6FEM2v8Tp1PQFrkfY3cU4Zem5D6y5FuVKpftJcxg4Jm09CLSye3EDUXJZ',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCsS2vxOIaM2BrLX4x3_2iLEWmOUrv2hhDoR8M9Qgy5A_o9C2txbUXSB70pLFes9PN2zZ7yXtYi96xzJFwrEXpMW0VB-mC8OnFqU-L9Sh4OAUGlzQ1c9J68oM9AJ9hSm3KQSojZvB3tPSACQwmlT60yl7xsLOWdf7JEYfA_Chzi7MRdBgDGfPjYJqy_L3Wg6qi4YVqZqdbfODNHHMCuygZtfjl-WE13UuG1bXVQp8VCvGG5WXMGJy9lsVVYGaaCijpx6kZ8jVPpjy32'
];

export default function UserProfileView({
  persona,
  currentUser,
  onUpdateUser,
  students = [],
  onRefreshRoster,
  onResetTour
}: UserProfileViewProps) {
  // Find current student database record if student persona
  const studentDbRec = persona === 'student' && currentUser
    ? students.find(s => s.usn.toUpperCase() === currentUser.codeOrUsn.toUpperCase())
    : null;

  // Form states
  const [name, setName] = useState(currentUser?.name || '');
  const [emailOrUsn] = useState(currentUser?.codeOrUsn || '');
  
  // Student-specific states
  const [section, setSection] = useState(studentDbRec?.section || 'A');
  const [year, setYear] = useState(studentDbRec?.year || 3);
  const [avatarUrl, setAvatarUrl] = useState(studentDbRec?.avatarUrl || AVATAR_PRESETS[0]);
  
  // Lecturer-specific states
  const [designation, setDesignation] = useState(() => {
    return localStorage.getItem('sjce_lecturer_designation') || 'Assistant Professor';
  });
  const [department, setDepartment] = useState(() => {
    return localStorage.getItem('sjce_lecturer_dept') || 'Computer Science (CSE)';
  });

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus('idle');

    try {
      if (persona === 'student') {
        const currentRate = studentDbRec?.attendanceRate || 75;
        const token = localStorage.getItem('sjce_auth_token_student') || localStorage.getItem('sjce_auth_token_lecturer') || localStorage.getItem('sjce_auth_token_admin');
        // Call backend API to save the student parameters
        const res = await fetch('/api/students', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          body: JSON.stringify({
            usn: emailOrUsn.toUpperCase(),
            name: name.trim(),
            attendanceRate: currentRate,
            courseCode: 'CS501',
            section: section,
            year: Number(year),
            avatarUrl: avatarUrl
          })
        });
        const data = await res.json();
        if (data.success) {
          onUpdateUser({ codeOrUsn: emailOrUsn.toUpperCase(), name: name.trim() });
          if (onRefreshRoster) onRefreshRoster();
          setSaveStatus('success');
        } else {
          setSaveStatus('error');
        }
      } else {
        // Lecturer persona - details stored locally
        localStorage.setItem('sjce_lecturer_designation', designation);
        localStorage.setItem('sjce_lecturer_dept', department);
        onUpdateUser({ codeOrUsn: emailOrUsn, name: name.trim() });
        setSaveStatus('success');
      }
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in" data-tour="profile-page">
      <section className="space-y-1">
        <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-[#6b38d4] px-2.5 py-1 rounded-full font-sans font-black tracking-widest uppercase inline-block">
          Personal Profile Deck
        </span>
        <h2 className="text-2xl md:text-3xl font-display font-black tracking-tight text-slate-900 leading-none">
          Manage Profile Details
        </h2>
        <p className="text-xs md:text-sm text-slate-650">
          Configure credentials name values, adjust classroom settings, and manage visual avatar selections.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left column: Quick Stats Card */}
        <div className="md:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -mr-8 -mt-8 blur-xl" />
            
            {/* Avatar Section */}
            <div className="relative mb-4 group">
              <img 
                src={persona === 'student' ? avatarUrl : 'https://lh3.googleusercontent.com/aida-public/AB6AXuCsS2vxOIaM2BrLX4x3_2iLEWmOUrv2hhDoR8M9Qgy5A_o9C2txbUXSB70pLFes9PN2zZ7yXtYi96xzJFwrEXpMW0VB-mC8OnFqU-L9Sh4OAUGlzQ1c9J68oM9AJ9hSm3KQSojZvB3tPSACQwmlT60yl7xsLOWdf7JEYfA_Chzi7MRdBgDGfPjYJqy_L3Wg6qi4YVqZqdbfODNHHMCuygZtfjl-WE13UuG1bXVQp8VCvGG5WXMGJy9lsVVYGaaCijpx6kZ8jVPpjy32'} 
                alt="Profile Avatar"
                className="w-24 h-24 object-cover rounded-full border-4 border-indigo-50 shadow-md transition-all group-hover:scale-105"
              />
              <div className="absolute bottom-0 right-0 w-7 h-7 bg-[#6b38d4] text-white rounded-full flex items-center justify-center border-2 border-white shadow-md">
                <span className="material-symbols-outlined text-sm font-bold">verified</span>
              </div>
            </div>

            <h3 className="text-lg font-display font-bold text-slate-900 leading-snug">{name}</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{emailOrUsn}</p>

            <div className="w-full border-t border-slate-100 my-4 pt-4 flex justify-around gap-2 text-center">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Role</span>
                <span className="text-xs font-bold text-[#00687a] uppercase bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-150 inline-block mt-1">
                  {persona}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Dept</span>
                <span className="text-xs font-semibold text-slate-700 block mt-1.5">
                  {persona === 'student' ? 'Computer Science' : department.split(' ')[0]}
                </span>
              </div>
            </div>

            {/* Attendance Quotient ring for Student */}
            {persona === 'student' && studentDbRec && (
              <div className="w-full bg-slate-50 rounded-2xl p-4 border border-slate-150 flex items-center justify-between gap-4">
                <div className="text-left">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Roster Quotient</span>
                  <span className="text-sm font-display font-extrabold text-slate-800">Attendance Quotient</span>
                </div>
                <div className="relative flex items-center justify-center">
                  <svg className="w-14 h-14">
                    <circle 
                      cx="28" cy="28" r="23" 
                      className="text-slate-200 stroke-current" 
                      strokeWidth="4" fill="transparent"
                    />
                    <circle 
                      cx="28" cy="28" r="23" 
                      className={`${studentDbRec.attendanceRate >= 75 ? 'text-emerald-500' : 'text-rose-500'} stroke-current`}
                      strokeWidth="4" fill="transparent"
                      strokeDasharray={`${2 * Math.PI * 23}`}
                      strokeDashoffset={`${2 * Math.PI * 23 * (1 - studentDbRec.attendanceRate / 100)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-xs font-display font-black text-slate-850">
                    {studentDbRec.attendanceRate}%
                  </span>
                </div>
              </div>
            )}

            {/* Timetable / Classes Count for Lecturer */}
            {persona === 'lecturer' && (
              <div className="w-full bg-slate-50 rounded-2xl p-4 border border-slate-150 text-left space-y-1.5">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Administrative Deck</span>
                <p className="text-xs text-slate-650 leading-relaxed">
                  Lecturer is logged in under Department CSE. You are authorized to open verification gates on local classrooms.
                </p>
              </div>
            )}
          </div>

          {/* Tour reset panel */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-3">
            <h4 className="text-xs font-sans font-bold tracking-widest text-[#494454] uppercase">Guided Tour Manager</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              New to this platform? Reset the guided interactive dashboard tour to walk through all check-in scanner and AI helper features again.
            </p>
            <button
              onClick={onResetTour}
              className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-[#6b38d4] font-sans font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-98"
            >
              <span className="material-symbols-outlined text-sm">restart_alt</span>
              Reset Guided Onboarding Tour
            </button>
          </div>
        </div>

        {/* Right column: Edit Details Form */}
        <div className="md:col-span-7 bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <h3 className="text-xs font-sans font-bold tracking-widest text-[#7b7486] uppercase mb-5">
            Credential Details Editing
          </h3>

          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Full Name / Descriptor
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-250 bg-white font-sans text-xs focus:ring-1 focus:ring-indigo-300 outline-none text-[#191c1e]"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  {persona === 'student' ? 'USN (Locked)' : 'E-mail ID (Locked)'}
                </label>
                <input
                  type="text"
                  value={emailOrUsn}
                  disabled
                  className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs text-slate-400 outline-none cursor-not-allowed"
                />
              </div>
            </div>

            {/* Student-specific fields */}
            {persona === 'student' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Roster Section
                    </label>
                    <select
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                      className="w-full p-3 rounded-xl border border-slate-250 bg-white font-sans text-xs focus:ring-1 focus:ring-indigo-300 outline-none text-[#191c1e] cursor-pointer"
                    >
                      <option value="A">Section A</option>
                      <option value="B">Section B</option>
                      <option value="C">Section C</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Academic Year (1-4)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="4"
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                      className="w-full p-3 rounded-xl border border-slate-250 bg-white font-sans text-xs focus:ring-1 focus:ring-indigo-300 outline-none text-[#191c1e]"
                      required
                    />
                  </div>
                </div>

                {/* Avatar presets grid */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider">
                    Select Avatar Preset
                  </label>
                  <div className="grid grid-cols-6 gap-2.5 pt-1">
                    {AVATAR_PRESETS.map((preset, index) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAvatarUrl(preset)}
                        className={`relative rounded-full overflow-hidden aspect-square border-2 transition-all cursor-pointer ${
                          avatarUrl === preset 
                            ? 'border-[#6b38d4] scale-105 ring-2 ring-indigo-200' 
                            : 'border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        <img 
                          src={preset} 
                          alt={`Avatar Option ${index + 1}`} 
                          className="w-full h-full object-cover" 
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Lecturer-specific fields */}
            {persona === 'lecturer' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Designation Title
                  </label>
                  <select
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-250 bg-white font-sans text-xs focus:ring-1 focus:ring-indigo-300 outline-none text-[#191c1e] cursor-pointer"
                  >
                    <option value="Professor & HOD">Professor & HOD</option>
                    <option value="Professor">Professor</option>
                    <option value="Assistant Professor">Assistant Professor</option>
                    <option value="Adjunct Lecturer">Adjunct Lecturer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Department Affiliation
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-250 bg-white font-sans text-xs focus:ring-1 focus:ring-indigo-300 outline-none text-[#191c1e] cursor-pointer"
                  >
                    <option value="Computer Science (CSE)">Computer Science (CSE)</option>
                    <option value="Electronics & Communication (ECE)">Electronics (ECE)</option>
                    <option value="Mechanical Engineering (ME)">Mechanical Engineering (ME)</option>
                  </select>
                </div>
              </div>
            )}

            {saveStatus === 'success' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-semibold leading-relaxed flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Roster details updated successfully!
              </div>
            )}

            {saveStatus === 'error' && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold leading-relaxed flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">error</span>
                Error: Failed to synchronize details with registrar DB.
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-[#6b38d4] hover:bg-[#8455ef] text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-[0.99]"
            >
              {saving ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-xs">sync</span>
                  Updating Database...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">save</span>
                  Save Profile Changes
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
