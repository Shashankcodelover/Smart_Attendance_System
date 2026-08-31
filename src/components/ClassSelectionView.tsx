import React, { useState, useEffect } from 'react';

interface ClassSelectionViewProps {
  onProceed: (data: {
    department: string;
    course: string;
    year: number;
    section: string;
  }) => void;
}

export default function ClassSelectionView({ onProceed }: ClassSelectionViewProps) {
  const [dept, setDept] = useState('Computer Science (CSE)');
  const [course, setCourse] = useState('B.E.');
  const [year, setYear] = useState(3);
  const [section, setSection] = useState('A');
  const [preview, setPreview] = useState<{ total: number; avg: number; subject: string }>({
    total: 64,
    avg: 82,
    subject: 'Computer Architecture (CS501)'
  });
  const [loading, setLoading] = useState(false);

  // Fetch real-time live preview stats from backend SQLite database
  useEffect(() => {
    async function fetchLivePreview() {
      setLoading(true);
      try {
        const res = await fetch(`/api/classes/preview?department=${encodeURIComponent(dept)}&course=${encodeURIComponent(course)}&year=${year}&section=${encodeURIComponent(section)}`);
        if (res.ok) {
          const data = await res.json();
          setPreview({
            total: data.total || 0,
            avg: data.avg || 85,
            subject: data.subject || 'Advanced Core Lecture'
          });
        }
      } catch (err) {
        console.error('Failed to fetch real-time class metrics', err);
      } finally {
        setLoading(false);
      }
    }
    fetchLivePreview();
  }, [dept, course, year, section]);

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <section className="space-y-1">
        <h2 className="text-2xl md:text-3xl font-display font-semibold text-[#191c1e] tracking-tight">
          Class Selection
        </h2>
        <p className="text-sm text-[#494454]">
          Select department, batch year, and section to launch a live attendance terminal with real-time class data.
        </p>
      </section>

      {/* Filtering Hierarchy - Bento Grid Selection */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Step 1: Department */}
        <div className="md:col-span-12 acrylic-card rounded-2xl p-6 shadow-sm border border-[#6b38d4]/10">
          <h3 className="text-xs font-sans font-bold tracking-widest text-[#494454] mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#6b38d4] text-white flex items-center justify-center text-[10px]">1</span>
            SELECT DEPARTMENT
          </h3>
          <div className="flex flex-wrap gap-3">
            {[
              'Computer Science (CSE)',
              'Electronics (ECE)',
              'Mechanical (ME)',
              'Information Science (ISE)'
            ].map((d) => (
              <button
                key={d}
                onClick={() => setDept(d)}
                className={`px-4 py-2.5 rounded-xl border font-sans font-medium text-sm transition-all duration-200 cursor-pointer ${
                  dept === d
                    ? 'bg-[#6b38d4] text-white border-transparent shadow-[0_4px_12px_rgba(107,56,212,0.2)]'
                    : 'border-[#cbc3d7]/30 text-[#494454] hover:bg-[#eceef0]/50'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Course */}
        <div className="md:col-span-6 acrylic-card rounded-2xl p-6 shadow-sm border border-[#6b38d4]/10">
          <h3 className="text-xs font-sans font-bold tracking-widest text-[#494454] mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#6b38d4] text-white flex items-center justify-center text-[10px]">2</span>
            SELECT COURSE
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'B.E.', icon: 'school', title: 'B.E.' },
              { id: 'M.Tech', icon: 'workspace_premium', title: 'M.Tech' }
            ].map((c) => (
              <button
                key={c.id}
                onClick={() => setCourse(c.id)}
                className={`flex flex-col items-center justify-center py-4 rounded-xl border font-sans font-medium text-sm transition-all duration-200 cursor-pointer ${
                  course === c.id
                    ? 'bg-[#6b38d4] text-white border-transparent shadow-[0_4px_12px_rgba(107,56,212,0.2)]'
                    : 'border-[#cbc3d7]/30 text-[#494454] hover:bg-[#eceef0]/50'
                }`}
              >
                <span className="material-symbols-outlined mb-1 text-xl">{c.icon}</span>
                {c.title}
              </button>
            ))}
          </div>
        </div>

        {/* Step 3: Year */}
        <div className="md:col-span-6 acrylic-card rounded-2xl p-6 shadow-sm border border-[#6b38d4]/10">
          <h3 className="text-xs font-sans font-bold tracking-widest text-[#494454] mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#6b38d4] text-white flex items-center justify-center text-[10px]">3</span>
            SELECT YEAR
          </h3>
          <div className="flex gap-2 w-full">
            {[1, 2, 3, 4].map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`flex-1 flex justify-center items-center py-4 rounded-xl border font-sans font-semibold text-sm transition-all duration-200 cursor-pointer ${
                  year === y
                    ? 'bg-[#6b38d4] text-white border-transparent shadow-[0_4px_12px_rgba(107,56,212,0.2)]'
                    : 'border-[#cbc3d7]/30 text-[#494454] hover:bg-[#eceef0]/50'
                }`}
              >
                Year {y}
              </button>
            ))}
          </div>
        </div>

        {/* Step 4: Section */}
        <div className="md:col-span-4 acrylic-card rounded-2xl p-6 shadow-sm border border-[#6b38d4]/10">
          <h3 className="text-xs font-sans font-bold tracking-widest text-[#494454] mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#6b38d4] text-white flex items-center justify-center text-[10px]">4</span>
            SECTION
          </h3>
          <div className="flex gap-3 w-full">
            {['A', 'B', 'C', 'D'].map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                className={`flex-1 flex justify-center items-center py-3 rounded-xl border font-sans font-semibold text-sm transition-all duration-200 cursor-pointer ${
                  section === s
                    ? 'bg-[#6b38d4] text-white border-transparent shadow-[0_4px_12px_rgba(107,56,212,0.2)]'
                    : 'border-[#cbc3d7]/30 text-[#494454] hover:bg-[#eceef0]/50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Class Preview Card */}
        <div className="md:col-span-8 acrylic-card bg-[#8455ef]/90 text-white rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-[0_8px_32px_rgba(107,56,212,0.15)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
          <div className="flex-1 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
              <span className="material-symbols-outlined text-[18px]">groups</span>
              <h4 className="font-display text-lg font-bold">
                {dept.split(' ')[0]} &bull; {course} &bull; Year {year} &bull; Section {section}
              </h4>
            </div>
            <p className="text-xs text-white/80 mb-3 block italic">
              Upcoming Lecture: {preview.subject}
            </p>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="bg-white/10 px-4 py-2.5 rounded-xl text-center backdrop-blur-sm">
                <p className="text-[10px] font-sans font-bold tracking-wider uppercase opacity-80">
                  Enrolled Students
                </p>
                <p className="text-2xl font-display font-extrabold">{loading ? '...' : preview.total}</p>
              </div>
              <div className="bg-white/10 px-4 py-2.5 rounded-xl text-center backdrop-blur-sm">
                <p className="text-[10px] font-sans font-bold tracking-wider uppercase opacity-80">
                  Live Attendance Avg
                </p>
                <p className="text-2xl font-display font-extrabold">{loading ? '...' : `${preview.avg}%`}</p>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Action Button Container */}
      <div className="flex justify-end mt-4">
        <button
          onClick={() => onProceed({ department: dept, course, year, section })}
          className="bg-[#6b38d4] hover:bg-[#8455ef] text-white px-8 py-3.5 rounded-full font-display text-base font-bold flex items-center gap-3 shadow-lg active:scale-95 transition-all duration-200 cursor-pointer"
        >
          Proceed to Session Creation
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
      </div>

    </div>
  );
}
