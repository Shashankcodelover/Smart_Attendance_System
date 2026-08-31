import React, { useState, useMemo, useEffect } from 'react';
import { Session, Student, AttendanceRecord } from '../types';

interface ManualSpreadsheetViewProps {
  sessions: Session[];
  students: Student[];
  attendanceRecords: AttendanceRecord[];
  onToggleAttendance: (sessionId: string, studentUsn: string, present: boolean) => Promise<void>;
  onBack: () => void;
  defaultFilter?: {
    course?: string;
    department?: string;
    year?: number;
    section?: string;
  };
}

export default function ManualSpreadsheetView({
  sessions,
  students,
  attendanceRecords,
  onToggleAttendance,
  onBack,
  defaultFilter,
}: ManualSpreadsheetViewProps) {
  // Sort sessions: active first, then most recent
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1;
      if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [sessions]);

  // Dropdown filter states
  const [filterCourse, setFilterCourse] = useState<string>(() => {
    if (defaultFilter?.course) return defaultFilter.course;
    return 'ALL';
  });
  
  const [filterDept, setFilterDept] = useState<string>(() => {
    if (defaultFilter?.department) {
      const dept = defaultFilter.department.toLowerCase();
      if (dept.includes('cse') || dept.includes('computer')) return 'CSE';
      if (dept.includes('ece') || dept.includes('electronics')) return 'ECE';
      if (dept.includes('ise') || dept.includes('information')) return 'ISE';
      if (dept.includes('ds') || dept.includes('data')) return 'DS';
      if (dept.includes('se') || dept.includes('software')) return 'SE';
    }
    return 'ALL';
  });

  const [filterYear, setFilterYear] = useState<string>(() => {
    if (defaultFilter?.year) return String(defaultFilter.year);
    return 'ALL';
  });

  const [filterSection, setFilterSection] = useState<string>(() => {
    if (defaultFilter?.section) return defaultFilter.section.toUpperCase();
    return 'ALL';
  });

  // Filtered sessions based on active header dropdown values
  const filteredSessionsList = useMemo(() => {
    return sortedSessions.filter(s => {
      const matchCourse = filterCourse === 'ALL' || s.course?.toLowerCase().startsWith(filterCourse.toLowerCase());
      
      let matchDept = true;
      if (filterDept !== 'ALL') {
        const deptLower = s.department?.toLowerCase() || '';
        if (filterDept === 'CSE') matchDept = deptLower.includes('computer') || deptLower.includes('cse');
        else if (filterDept === 'ECE') matchDept = deptLower.includes('electronics') || deptLower.includes('ece');
        else if (filterDept === 'ISE') matchDept = deptLower.includes('information') || deptLower.includes('ise');
        else if (filterDept === 'DS') matchDept = deptLower.includes('data') || deptLower.includes('ds');
        else if (filterDept === 'SE') matchDept = deptLower.includes('software') || deptLower.includes('se');
      }

      const matchYear = filterYear === 'ALL' || String(s.year) === filterYear;
      const matchSection = filterSection === 'ALL' || s.section?.toLowerCase() === filterSection.toLowerCase();
      return matchCourse && matchDept && matchYear && matchSection;
    });
  }, [sortedSessions, filterCourse, filterDept, filterYear, filterSection]);

  const [selectedSessionId, setSelectedSessionId] = useState<string>('');

  // Auto routing of active selected session ID
  useEffect(() => {
    if (filteredSessionsList.length > 0) {
      const exists = filteredSessionsList.some(s => s.id === selectedSessionId);
      if (!exists) {
        setSelectedSessionId(filteredSessionsList[0].id);
      }
    } else {
      setSelectedSessionId('');
    }
  }, [filteredSessionsList, selectedSessionId]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [updatingUsns, setUpdatingUsns] = useState<Record<string, boolean>>({});

  // Find the selected session details
  const selectedSession = useMemo(() => {
    return sessions.find(s => s.id === selectedSessionId) || null;
  }, [sessions, selectedSessionId]);

  // Filter students based on selected session's year and section, or fallback to filter criteria
  const filteredStudents = useMemo(() => {
    if (selectedSession) {
      return students.filter(
        student =>
          student.year === selectedSession.year &&
          student.section?.toLowerCase() === selectedSession.section?.toLowerCase()
      );
    }
    
    // Roster fallback if no session matches
    return students.filter(student => {
      let matchDept = true;
      if (filterDept !== 'ALL') {
        const branchLower = student.courseCode?.toLowerCase() || '';
        if (filterDept === 'CSE') matchDept = branchLower.includes('cse') || branchLower.includes('cs');
        else if (filterDept === 'ECE') matchDept = branchLower.includes('ece') || branchLower.includes('ec');
        else if (filterDept === 'ISE') matchDept = branchLower.includes('ise') || branchLower.includes('is');
      }

      const matchYear = filterYear === 'ALL' || String(student.year) === filterYear;
      const matchSection = filterSection === 'ALL' || student.section?.toLowerCase() === filterSection.toLowerCase();
      return matchDept && matchYear && matchSection;
    });
  }, [students, selectedSession, filterDept, filterYear, filterSection]);

  // Map of present student USNs for the selected session
  const presentStudentsMap = useMemo(() => {
    const map = new Set<string>();
    attendanceRecords.forEach(rec => {
      if (rec.sessionId === selectedSessionId) {
        map.add(rec.studentUsn.toUpperCase());
      }
    });
    return map;
  }, [attendanceRecords, selectedSessionId]);

  // Search filtered students
  const searchedStudents = useMemo(() => {
    return filteredStudents.filter(
      s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.usn.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [filteredStudents, searchQuery]);

  // Stats calculation
  const totalStudentsCount = filteredStudents.length;
  const presentCount = filteredStudents.filter(s =>
    presentStudentsMap.has(s.usn.toUpperCase())
  ).length;
  const absentCount = totalStudentsCount - presentCount;
  const presentPercentage =
    totalStudentsCount > 0
      ? Math.round((presentCount / totalStudentsCount) * 100)
      : 0;

  // Toggle single attendance row
  const handleToggle = async (studentUsn: string, currentPresent: boolean) => {
    if (!selectedSessionId) return;
    const usnUpper = studentUsn.toUpperCase();
    setUpdatingUsns(prev => ({ ...prev, [usnUpper]: true }));
    try {
      await onToggleAttendance(selectedSessionId, studentUsn, !currentPresent);
    } catch (err) {
      console.error('Failed to toggle attendance:', err);
    } finally {
      setUpdatingUsns(prev => ({ ...prev, [usnUpper]: false }));
    }
  };

  // Mark all present or absent
  const handleMarkAll = async (present: boolean) => {
    if (!selectedSessionId || filteredStudents.length === 0) return;
    const promises = filteredStudents.map(student => {
      const isCurrentlyPresent = presentStudentsMap.has(student.usn.toUpperCase());
      if (isCurrentlyPresent !== present) {
        return onToggleAttendance(selectedSessionId, student.usn, present);
      }
      return Promise.resolve();
    });

    try {
      await Promise.all(promises);
    } catch (err) {
      console.error('Failed to set batch attendance:', err);
    }
  };

  // Export active section/roster data as CSV
  const handleExportCsv = () => {
    const csvHeaders = ['USN', 'Name', 'Course Code', 'Year', 'Section', 'Overall Attendance Rate (%)'];
    
    // Sort and gather all matched sessions for the columns
    const matchSessions = [...filteredSessionsList].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    matchSessions.forEach(s => {
      const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleDateString().replace(/\//g, '-') : 'Date';
      csvHeaders.push(`${s.subjectCode}_${dateStr}_${s.timeline.replace(/[\s:-]+/g, '_')}`);
    });

    // Generate rows for all filtered students (matching the filter selections)
    const rows = filteredStudents.map(student => {
      const studentUsnUpper = student.usn.toUpperCase();
      let presentCount = 0;
      
      const sessionStatuses = matchSessions.map(s => {
        const isPresent = attendanceRecords.some(
          r => r.sessionId === s.id && r.studentUsn.toUpperCase() === studentUsnUpper
        );
        if (isPresent) presentCount++;
        return isPresent ? 'P' : 'A';
      });

      const rate = matchSessions.length > 0
        ? Math.round((presentCount / matchSessions.length) * 100)
        : student.attendanceRate || 100;

      return [
        student.usn,
        student.name,
        student.courseCode,
        String(student.year),
        student.section,
        `${rate}%`,
        ...sessionStatuses
      ];
    });

    const csvContent = [
      csvHeaders.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const courseName = filterCourse === 'ALL' ? 'ALL' : filterCourse.replace(/\s+/g, '_');
    const deptName = filterDept === 'ALL' ? 'ALL' : filterDept;
    const yrName = filterYear === 'ALL' ? 'ALL' : `Year_${filterYear}`;
    const secName = filterSection === 'ALL' ? 'ALL' : `Section_${filterSection}`;
    
    link.href = url;
    link.setAttribute('download', `${courseName}_${deptName}_${yrName}_${secName}_Attendance.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header section with back navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <button
            onClick={onBack}
            className="group flex items-center gap-1.5 text-xs font-sans font-bold text-[#6b38d4] hover:text-[#8455ef] transition-colors cursor-pointer mb-2"
          >
            <span className="material-symbols-outlined text-sm transition-transform group-hover:-translate-x-0.5">
              arrow_back
            </span>
            Back to Lecturer Dashboard
          </button>
          <h2 className="text-2xl md:text-3xl font-display font-black text-[#191c1e] tracking-tight">
            Excel Attendance Grid Override
          </h2>
          <p className="text-xs text-[#494454] font-sans">
            Directly adjust student check-ins. Updates are immediately reflected in the database.
          </p>
        </div>

        {/* Dropdown Filters row */}
        <div className="flex flex-wrap gap-2.5 items-end">
          {/* Degree Filter */}
          <div className="flex flex-col text-left">
            <label className="text-[8px] font-sans font-black tracking-widest text-[#7b7486] uppercase mb-1">Degree</label>
            <select
              value={filterCourse}
              onChange={e => setFilterCourse(e.target.value)}
              className="bg-white border border-[#cbc3d7]/50 rounded-xl px-2 py-1.5 text-xs font-sans text-gray-900 focus:outline-none cursor-pointer appearance-none pr-6 relative shadow-sm"
            >
              <option value="ALL">All Degrees</option>
              <option value="B.E.">B.E.</option>
              <option value="M.Tech">M.Tech</option>
            </select>
          </div>

          {/* Department Filter */}
          <div className="flex flex-col text-left">
            <label className="text-[8px] font-sans font-black tracking-widest text-[#7b7486] uppercase mb-1">Department</label>
            <select
              value={filterDept}
              onChange={e => setFilterDept(e.target.value)}
              className="bg-white border border-[#cbc3d7]/50 rounded-xl px-2 py-1.5 text-xs font-sans text-gray-900 focus:outline-none cursor-pointer appearance-none pr-6 relative shadow-sm"
            >
              <option value="ALL">All Depts</option>
              <option value="CSE">CSE</option>
              <option value="ECE">ECE</option>
              <option value="ISE">ISE</option>
              <option value="DS">Data Science</option>
              <option value="SE">Software Eng</option>
            </select>
          </div>

          {/* Year Filter */}
          <div className="flex flex-col text-left">
            <label className="text-[8px] font-sans font-black tracking-widest text-[#7b7486] uppercase mb-1">Year</label>
            <select
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
              className="bg-white border border-[#cbc3d7]/50 rounded-xl px-2 py-1.5 text-xs font-sans text-gray-900 focus:outline-none cursor-pointer appearance-none pr-6 relative shadow-sm"
            >
              <option value="ALL">All Years</option>
              <option value="1">1st Year</option>
              <option value="2">2nd Year</option>
              <option value="3">3rd Year</option>
              <option value="4">4th Year</option>
            </select>
          </div>

          {/* Section Filter */}
          <div className="flex flex-col text-left">
            <label className="text-[8px] font-sans font-black tracking-widest text-[#7b7486] uppercase mb-1">Section</label>
            <select
              value={filterSection}
              onChange={e => setFilterSection(e.target.value)}
              className="bg-white border border-[#cbc3d7]/50 rounded-xl px-2 py-1.5 text-xs font-sans text-gray-900 focus:outline-none cursor-pointer appearance-none pr-6 relative shadow-sm"
            >
              <option value="ALL">All Secs</option>
              <option value="A">Section A</option>
              <option value="B">Section B</option>
              <option value="C">Section C</option>
              <option value="D">Section D</option>
            </select>
          </div>

          {/* Session Selector */}
          <div className="flex flex-col text-left relative min-w-[200px]">
            <label className="text-[8px] font-sans font-black tracking-widest text-[#7b7486] uppercase mb-1">
              Select Session Slot
            </label>
            <select
              value={selectedSessionId}
              onChange={e => setSelectedSessionId(e.target.value)}
              className="bg-white border border-[#cbc3d7]/50 rounded-xl px-3 py-1.5 pr-8 text-xs font-sans text-gray-900 focus:outline-none cursor-pointer appearance-none shadow-sm"
            >
              {filteredSessionsList.length === 0 ? (
                <option value="">No sessions match filters</option>
              ) : (
                filteredSessionsList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.status === 'ACTIVE' ? '🟢 LIVE - ' : ''}
                    {s.subjectCode} ({s.year === 1 ? '1st' : s.year === 2 ? '2nd' : s.year === 3 ? '3rd' : '4th'} Yr Sec {s.section}) - {s.timeline}
                  </option>
                ))
              )}
            </select>
            <div className="absolute right-2.5 bottom-2 text-gray-400 pointer-events-none">
              <span className="material-symbols-outlined text-xs">unfold_more</span>
            </div>
          </div>
        </div>
      </div>

      {selectedSession ? (
        <>
          {/* Quick Metrics & Batch Actions Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Metric: Present count */}
            <div className="bg-emerald-50/50 border border-emerald-150 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-sans font-black text-emerald-800 tracking-wider uppercase block">
                  Present Candidates
                </span>
                <span className="text-2xl font-display font-black text-emerald-900">
                  {presentCount} <span className="text-xs font-medium text-emerald-700">/ {totalStudentsCount}</span>
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-xl">how_to_reg</span>
              </div>
            </div>

            {/* Metric: Absent count */}
            <div className="bg-rose-50/50 border border-rose-150 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-sans font-black text-rose-800 tracking-wider uppercase block">
                  Absent Candidates
                </span>
                <span className="text-2xl font-display font-black text-rose-900">
                  {absentCount} <span className="text-xs font-medium text-rose-700">/ {totalStudentsCount}</span>
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-100/70 text-rose-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-xl">person_off</span>
              </div>
            </div>

            {/* Metric: Attendance quotient */}
            <div className="bg-indigo-50/50 border border-indigo-150 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-sans font-black text-indigo-800 tracking-wider uppercase block">
                  Attendance Quotient
                </span>
                <span className="text-2xl font-display font-black text-indigo-900">
                  {presentPercentage}%
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-100/70 text-indigo-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-xl">analytics</span>
              </div>
            </div>

            {/* Batch controls block */}
            <div className="bg-white border border-[#cbc3d7]/35 rounded-2xl p-4 flex flex-col justify-center gap-2">
              <span className="text-[9px] font-sans font-black text-slate-500 tracking-wider uppercase block text-center mb-1">
                Batch Commands Override
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleMarkAll(true)}
                  disabled={filteredStudents.length === 0}
                  className="flex-1 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[10px] font-sans font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer text-center"
                >
                  ✓ All Present
                </button>
                <button
                  onClick={() => handleMarkAll(false)}
                  disabled={filteredStudents.length === 0}
                  className="flex-1 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-[10px] font-sans font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer text-center"
                >
                  ✗ All Absent
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Spreadsheet Excel Grid */}
          <div className="bg-white border border-[#cbc3d7]/40 rounded-2xl p-5 shadow-sm space-y-4">
            
            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#6b38d4]">border_outer</span>
                  <h3 className="text-sm font-display font-black text-[#191c1e] uppercase tracking-wide">
                    Roster Worksheet Grid ({searchedStudents.length} Students Matching)
                  </h3>
                </div>
                
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-sans font-black uppercase tracking-wider transition-colors shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xs">download</span>
                  Export Section CSV
                </button>
              </div>

              {/* Search box with icon */}
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search by Name or USN..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-8 pr-3 text-xs font-sans outline-none focus:ring-1 focus:ring-[#6b38d4]/30 text-gray-900"
                />
                <span className="absolute left-2.5 top-2.5 material-symbols-outlined text-gray-400 text-sm">
                  search
                </span>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <span className="material-symbols-outlined text-xs">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Excel Table Layout wrapper */}
            <div className="overflow-x-auto border border-gray-100 rounded-xl">
              <table className="w-full text-left font-sans text-xs border-collapse">
                {/* Excel column names top index */}
                <thead>
                  <tr className="bg-slate-100/80 border-b border-gray-200 text-gray-500 font-mono text-[9px] uppercase tracking-wider select-none text-center">
                    <th className="p-1.5 border-r border-gray-200 w-10"></th>
                    <th className="p-1.5 border-r border-gray-200 text-left pl-3">A</th>
                    <th className="p-1.5 border-r border-gray-200 text-left pl-3">B</th>
                    <th className="p-1.5 border-r border-gray-200 text-left pl-3">C</th>
                    <th className="p-1.5 border-r border-gray-200 text-left pl-3">D</th>
                    <th className="p-1.5 border-r border-gray-200 text-left pl-3">E</th>
                    <th className="p-1.5">F</th>
                  </tr>
                  
                  {/* Table headers */}
                  <tr className="bg-gray-50/70 border-b border-gray-200 text-slate-800 font-black uppercase text-[10px] tracking-wider">
                    {/* Row Index Indicator column */}
                    <th className="p-3 border-r border-gray-200 text-center text-gray-400 font-mono w-10">#</th>
                    <th className="p-3 border-r border-gray-200">Candidate Name</th>
                    <th className="p-3 border-r border-gray-200">USN Identifier</th>
                    <th className="p-3 border-r border-gray-200">Course / Branch</th>
                    <th className="p-3 border-r border-gray-200">Year</th>
                    <th className="p-3 border-r border-gray-200">Section</th>
                    <th className="p-3 text-center">Attendance Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-150">
                  {searchedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-xs text-gray-400 italic bg-gray-50/20">
                        No students match the active year/section folder filter. Please verify current timetable roster setup.
                      </td>
                    </tr>
                  ) : (
                    searchedStudents.map((student, idx) => {
                      const isPresent = presentStudentsMap.has(student.usn.toUpperCase());
                      const isUpdating = updatingUsns[student.usn.toUpperCase()];

                      return (
                        <tr
                          key={student.usn}
                          className={`hover:bg-indigo-50/20 transition-colors ${
                            isPresent ? 'bg-emerald-50/5' : 'bg-rose-50/5'
                          }`}
                        >
                          {/* Row Index Indicator */}
                          <td className="p-2 border-r border-gray-150 text-center font-mono text-[10px] text-gray-450 bg-slate-50/30">
                            {idx + 1}
                          </td>

                          {/* Candidate Name */}
                          <td className="p-3 border-r border-gray-150 font-semibold text-gray-950">
                            <div className="flex items-center gap-2">
                              {student.avatarUrl ? (
                                <img
                                  src={student.avatarUrl}
                                  alt={student.name}
                                  className="w-6 h-6 rounded-full object-cover border border-gray-200"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-slate-100 text-[#6b38d4] font-display font-bold flex items-center justify-center text-[10px] border border-gray-200">
                                  {student.name.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              <span>{student.name}</span>
                            </div>
                          </td>

                          {/* USN Identifier */}
                          <td className="p-3 border-r border-gray-150 font-mono text-xs text-gray-600">
                            {student.usn}
                          </td>

                          {/* Course */}
                          <td className="p-3 border-r border-gray-150 text-gray-600">
                            {student.courseCode}
                          </td>

                          {/* Year */}
                          <td className="p-3 border-r border-gray-150 font-medium text-gray-655 text-center sm:text-left">
                            {student.year}
                          </td>

                          {/* Section */}
                          <td className="p-3 border-r border-gray-150 font-medium text-gray-655 text-center sm:text-left">
                            {student.section}
                          </td>

                          {/* Attendance Status Toggle */}
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleToggle(student.usn, isPresent)}
                              disabled={isUpdating}
                              className={`px-3.5 py-1.5 rounded-lg text-[10px] font-sans font-black uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-sm border ${
                                isUpdating
                                  ? 'bg-gray-100 text-gray-400 border-gray-200 animate-pulse'
                                  : isPresent
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent'
                                  : 'bg-white hover:bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {isUpdating ? (
                                <>
                                  <span className="material-symbols-outlined text-[12px] animate-spin">sync</span>
                                  Syncing
                                </>
                              ) : isPresent ? (
                                <>
                                  <span className="material-symbols-outlined text-[14px] font-black animate-[ping_0.5s_cubic-bezier(0,0,0.2,1)_1]">check_circle</span>
                                  Present
                                </>
                              ) : (
                                <>
                                  <span className="material-symbols-outlined text-[12px]">close</span>
                                  Absent
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Instruction Tip */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-500 flex items-start gap-2 leading-relaxed">
              <span className="material-symbols-outlined text-slate-400 text-sm mt-0.5">info</span>
              <p>
                <strong>Lecturer Override:</strong> Checking the toggle switches a student record instantly between <em>Present</em> (using cryptographically verified credentials) and <em>Absent</em> (removing the entry). Toggling a student as Present will log them under manual verification matching the active session gate.
              </p>
            </div>

          </div>
        </>
      ) : (
        <div className="text-center py-12 bg-white border border-[#cbc3d7]/35 rounded-2xl shadow-sm space-y-3">
          <span className="material-symbols-outlined text-4xl text-[#cbc3d7]">table_view</span>
          <p className="text-sm font-medium text-gray-500">No session is selected or loaded.</p>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Please make sure you have generated sessions using the timetable parsing system or created them manually.
          </p>
        </div>
      )}
    </div>
  );
}
