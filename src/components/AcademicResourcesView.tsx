import React, { useState, useEffect } from 'react';

interface TimetableItem {
  id?: number;
  day: string;
  time_slot: string;
  subject_code: string;
  subject_name: string;
  lecturer_email?: string;
  lecturer_name?: string;
  department: string;
  course?: string;
  year?: number;
  section?: string;
  room?: string;
}

interface SyllabusUnit {
  unit: string;
  title: string;
  topic: string;
}

interface ResourceItem {
  id: string;
  subjectCode: string;
  subjectName: string;
  credits: number;
  department: string;
  year: number;
  syllabus: SyllabusUnit[];
}

export default function AcademicResourcesView() {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [timetable, setTimetable] = useState<TimetableItem[]>([]);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>('Monday');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showAddSlotModal, setShowAddSlotModal] = useState(false);
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);

  // New slot form state
  const [slotForm, setSlotForm] = useState({
    day: 'Monday',
    time_slot: '09:00 AM - 10:00 AM',
    subject_code: '',
    subject_name: '',
    department: 'Computer Science (CSE)',
    year: 3,
    section: 'A',
    room: 'Room 301',
    lecturer_name: ''
  });

  // New syllabus form state
  const [resourceForm, setResourceForm] = useState({
    subject_code: '',
    subject_name: '',
    credits: 4,
    department: 'Computer Science (CSE)',
    year: 3,
    unit: 'Unit I',
    title: '',
    topic: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ttRes, resRes] = await Promise.all([
        fetch('/api/timetable'),
        fetch('/api/resources')
      ]);

      if (ttRes.ok) {
        const ttData = await ttRes.json();
        setTimetable(Array.isArray(ttData) ? ttData : []);
      }
      if (resRes.ok) {
        const rData = await resRes.json();
        setResources(Array.isArray(rData) ? rData : []);
        if (rData.length > 0 && !expandedSubject) {
          setExpandedSubject(rData[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load academic resources', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slotForm.subject_code || !slotForm.subject_name) {
      alert('Please provide Subject Code and Subject Name.');
      return;
    }
    try {
      const res = await fetch('/api/timetable/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slotForm)
      });
      if (res.ok) {
        setShowAddSlotModal(false);
        setSlotForm({
          day: 'Monday',
          time_slot: '09:00 AM - 10:00 AM',
          subject_code: '',
          subject_name: '',
          department: 'Computer Science (CSE)',
          year: 3,
          section: 'A',
          room: 'Room 301',
          lecturer_name: ''
        });
        fetchData();
      }
    } catch (err) {
      console.error('Failed to add timetable slot', err);
    }
  };

  const handleDeleteSlot = async (id: number) => {
    if (!confirm('Are you sure you want to delete this timetable slot?')) return;
    try {
      const res = await fetch(`/api/timetable/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTimetable(prev => prev.filter(t => t.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete timetable slot', err);
    }
  };

  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resourceForm.subject_code || !resourceForm.subject_name) {
      alert('Please fill out Subject Code and Subject Name.');
      return;
    }
    try {
      const payload = {
        subjectCode: resourceForm.subject_code.toUpperCase(),
        subjectName: resourceForm.subject_name,
        credits: Number(resourceForm.credits),
        department: resourceForm.department,
        year: Number(resourceForm.year),
        syllabus: [
          {
            unit: resourceForm.unit || 'Unit I',
            title: resourceForm.title || 'Course Fundamentals',
            topic: resourceForm.topic || 'Core curriculum syllabus concepts and modules.'
          }
        ]
      };
      const res = await fetch('/api/resources/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowAddResourceModal(false);
        setResourceForm({
          subject_code: '',
          subject_name: '',
          credits: 4,
          department: 'Computer Science (CSE)',
          year: 3,
          unit: 'Unit I',
          title: '',
          topic: ''
        });
        fetchData();
      }
    } catch (err) {
      console.error('Failed to add academic resource', err);
    }
  };

  const handleDeleteResource = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this course syllabus?')) return;
    try {
      const res = await fetch(`/api/resources/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setResources(prev => prev.filter(r => r.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete resource', err);
    }
  };

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const filteredTimetable = timetable.filter(t => t.day.toLowerCase() === selectedDay.toLowerCase());

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <section className="space-y-1">
          <span className="text-[10px] tracking-widest text-[#00687a] bg-[#00687a]/15 px-2.5 py-1 rounded-full font-sans font-extrabold uppercase">
            LIVE CURRICULUM & TIMETABLES
          </span>
          <h2 className="text-2xl md:text-3xl font-display font-semibold text-[#191c1e] tracking-tight mt-1.5">
            Class Schedules & Syllabi
          </h2>
          <p className="text-sm text-[#494454]">
            Manage master department timetables, course credits, and syllabus topics in real time.
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowAddSlotModal(true)}
            className="px-4 py-2 bg-[#6b38d4] hover:bg-[#8455ef] text-white text-xs font-bold font-sans rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
          >
            <span className="material-symbols-outlined text-base">add_circle</span>
            Add Timetable Slot
          </button>
          <button
            onClick={() => setShowAddResourceModal(true)}
            className="px-4 py-2 bg-[#00687a] hover:bg-[#005260] text-white text-xs font-bold font-sans rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
          >
            <span className="material-symbols-outlined text-base">menu_book</span>
            Add Syllabus Unit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Weekly Timetable List */}
        <div className="lg:col-span-5 acrylic-card rounded-2xl p-6 border border-[#cbc3d7]/30 shadow-sm space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-[#cbc3d7]/20">
            <h3 className="font-display font-bold text-[#191c1e] text-base">Weekly Timetable Matrix</h3>
            <span className="text-[9px] uppercase font-sans text-green-700 font-extrabold flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-ping"></span>
              Live Sync
            </span>
          </div>

          {/* Day Selector Tabs */}
          <div className="flex overflow-x-auto gap-1.5 pb-2 -mx-1 px-1 scrollbar-none">
            {days.map(d => (
              <button
                key={d}
                onClick={() => setSelectedDay(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans whitespace-nowrap cursor-pointer transition-all ${
                  selectedDay === d
                    ? 'bg-[#6b38d4] text-white shadow-sm'
                    : 'bg-slate-100 text-[#494454] hover:bg-slate-200'
                }`}
              >
                {d.slice(0, 3)}
              </button>
            ))}
          </div>

          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            {loading ? (
              <p className="text-xs text-center py-8 text-[#7b7486]">Loading live timetable...</p>
            ) : filteredTimetable.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <span className="material-symbols-outlined text-3xl text-[#7b7486] mb-1">calendar_today</span>
                <p className="text-xs text-[#494454] font-medium">No classes scheduled on {selectedDay}.</p>
                <button
                  onClick={() => setShowAddSlotModal(true)}
                  className="mt-2 text-xs font-bold text-[#6b38d4] hover:underline cursor-pointer"
                >
                  + Add schedule for {selectedDay}
                </button>
              </div>
            ) : (
              filteredTimetable.map((item) => (
                <div 
                  key={item.id}
                  className="p-3.5 bg-white/70 hover:bg-white border border-slate-100 rounded-xl transition-all shadow-xs group relative"
                >
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="font-mono text-xs text-[#6b38d4] font-bold">{item.time_slot}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-sans font-bold text-[#7b7486] uppercase bg-slate-100 px-2 py-0.5 rounded">
                        {item.room || 'Room 301'}
                      </span>
                      {item.id && (
                        <button
                          onClick={() => handleDeleteSlot(item.id!)}
                          className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 p-0.5 transition-opacity cursor-pointer"
                          title="Delete slot"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="font-display font-bold text-sm text-[#191c1e] leading-snug">
                    {item.subject_name} ({item.subject_code})
                  </p>
                  <p className="text-[11px] text-[#7b7486] mt-0.5">
                    Year {item.year || 3} &bull; Sec {item.section || 'A'} &bull; {item.lecturer_name || 'Faculty Incharge'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Syllabus Accordion Grid Panels */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-sans font-bold tracking-widest text-[#7b7486] uppercase select-none">
              COURSE SYLLABUS & LECTURE BRIEFS
            </h3>
            <span className="text-xs font-sans text-[#6b38d4] font-semibold">
              {resources.length} Courses Enrolled
            </span>
          </div>

          <div className="space-y-3">
            {resources.length === 0 ? (
              <div className="text-center py-12 bg-white/50 rounded-2xl border border-dashed border-slate-200">
                <span className="material-symbols-outlined text-4xl text-[#7b7486] mb-2">library_books</span>
                <p className="text-sm font-bold text-[#191c1e]">No Syllabus Units Registered</p>
                <p className="text-xs text-[#7b7486] mt-1">Click "Add Syllabus Unit" to dynamically populate your courses.</p>
              </div>
            ) : (
              resources.map((subject) => {
                const isExpanded = expandedSubject === subject.id;
                return (
                  <div 
                    key={subject.id}
                    className="acrylic-card rounded-2xl overflow-hidden transition-all duration-300 border border-slate-100"
                  >
                    <button
                      onClick={() => setExpandedSubject(isExpanded ? null : subject.id)}
                      className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[#6b38d4]/5 transition-colors cursor-pointer"
                    >
                      <div>
                        <span className="text-[10px] text-[#6b38d4] font-sans font-bold uppercase tracking-wider">
                          {subject.subjectCode} &bull; {subject.credits} Credits &bull; {subject.department}
                        </span>
                        <h4 className="font-display font-bold text-base text-[#191c1e] mt-0.5">
                          {subject.subjectName}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleDeleteResource(subject.id, e)}
                          className="text-slate-400 hover:text-red-600 p-1 transition-colors cursor-pointer"
                          title="Delete course"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                        <span className="material-symbols-outlined text-[#7b7486]">
                          {isExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5 pt-2 border-t border-[#6b38d4]/5 bg-white/40 divide-y divide-[#cbc3d7]/20">
                        {subject.syllabus && subject.syllabus.map((uni, uIdx) => (
                          <div key={uIdx} className="py-3.5 space-y-1">
                            <span className="text-[10px] font-sans font-bold text-[#00687a] bg-[#00687a]/15 px-2 py-0.5 rounded uppercase">
                              {uni.unit} &bull; {uni.title}
                            </span>
                            <p className="text-xs text-[#494454] leading-relaxed pt-1.5 pl-0.5">
                              {uni.topic}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* --- MODAL 1: ADD TIMETABLE SLOT --- */}
      {showAddSlotModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-display font-bold text-lg text-[#191c1e]">Add Timetable Slot</h3>
              <button onClick={() => setShowAddSlotModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleAddSlot} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Day of Week</label>
                  <select
                    value={slotForm.day}
                    onChange={e => setSlotForm({ ...slotForm, day: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                  >
                    {days.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Time Range</label>
                  <input
                    type="text"
                    value={slotForm.time_slot}
                    onChange={e => setSlotForm({ ...slotForm, time_slot: e.target.value })}
                    placeholder="e.g. 10:00 AM - 11:00 AM"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Subject Code</label>
                  <input
                    type="text"
                    value={slotForm.subject_code}
                    onChange={e => setSlotForm({ ...slotForm, subject_code: e.target.value.toUpperCase() })}
                    placeholder="e.g. CS501"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Subject Name</label>
                  <input
                    type="text"
                    value={slotForm.subject_name}
                    onChange={e => setSlotForm({ ...slotForm, subject_name: e.target.value })}
                    placeholder="e.g. Computer Networks"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Year</label>
                  <select
                    value={slotForm.year}
                    onChange={e => setSlotForm({ ...slotForm, year: parseInt(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  >
                    {[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Section</label>
                  <select
                    value={slotForm.section}
                    onChange={e => setSlotForm({ ...slotForm, section: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  >
                    {['A', 'B', 'C', 'D'].map(s => <option key={s} value={s}>Sec {s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Room / Hall</label>
                  <input
                    type="text"
                    value={slotForm.room}
                    onChange={e => setSlotForm({ ...slotForm, room: e.target.value })}
                    placeholder="Room 301"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Lecturer / Faculty Name</label>
                <input
                  type="text"
                  value={slotForm.lecturer_name}
                  onChange={e => setSlotForm({ ...slotForm, lecturer_name: e.target.value })}
                  placeholder="e.g. Dr. Ramesh Kumar"
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddSlotModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#6b38d4] text-white rounded-lg hover:bg-[#8455ef] font-bold shadow-sm"
                >
                  Save Timetable Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: ADD SYLLABUS UNIT --- */}
      {showAddResourceModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-display font-bold text-lg text-[#191c1e]">Register Course Syllabus</h3>
              <button onClick={() => setShowAddResourceModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleAddResource} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Subject Code</label>
                  <input
                    type="text"
                    value={resourceForm.subject_code}
                    onChange={e => setResourceForm({ ...resourceForm, subject_code: e.target.value.toUpperCase() })}
                    placeholder="e.g. CS503"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Subject Name</label>
                  <input
                    type="text"
                    value={resourceForm.subject_name}
                    onChange={e => setResourceForm({ ...resourceForm, subject_name: e.target.value })}
                    placeholder="e.g. Operating Systems"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Credits</label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={resourceForm.credits}
                    onChange={e => setResourceForm({ ...resourceForm, credits: parseInt(e.target.value) || 4 })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Year</label>
                  <select
                    value={resourceForm.year}
                    onChange={e => setResourceForm({ ...resourceForm, year: parseInt(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  >
                    {[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Unit Number</label>
                  <input
                    type="text"
                    value={resourceForm.unit}
                    onChange={e => setResourceForm({ ...resourceForm, unit: e.target.value })}
                    placeholder="Unit I"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Unit Title</label>
                <input
                  type="text"
                  value={resourceForm.title}
                  onChange={e => setResourceForm({ ...resourceForm, title: e.target.value })}
                  placeholder="e.g. Memory Management and Virtual Storage"
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Topics & Syllabus Content</label>
                <textarea
                  rows={3}
                  value={resourceForm.topic}
                  onChange={e => setResourceForm({ ...resourceForm, topic: e.target.value })}
                  placeholder="List key sub-topics, algorithms, or lab components covered in this module..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddResourceModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#00687a] text-white rounded-lg hover:bg-[#005260] font-bold shadow-sm"
                >
                  Save Syllabus
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
