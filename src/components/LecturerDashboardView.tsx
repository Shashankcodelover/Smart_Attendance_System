import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Session, Student } from '../types';

interface LecturerDashboardViewProps {
  sessions: Session[];
  attendanceRecords: any[];
  onActivate: (sessionId: string) => void;
  onCreateSession: (data: {
    department: string;
    course: string;
    year: number;
    section: string;
    subjectCode: string;
    subjectName: string;
    timeline: string;
    date?: string;
  }) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onReopen: (sessionId: string) => Promise<void>;
  onViewHistory: (filter?: { course?: string; department?: string; year?: number; section?: string }) => void;
  onStartSession: () => void;
  pendingOfflineCount: number;
  lecturerName?: string;
  students: Student[];
  onUploadTimetable: (fileBase64: string, mimeType: string) => Promise<void>;
}

const ACADEMIC_TREE = [
  {
    degree: 'B.E. (Bachelor of Engineering)',
    departments: [
      {
        name: 'Computer Science (CSE)',
        years: [1, 2, 3, 4],
        sections: ['A', 'B', 'C', 'D']
      },
      {
        name: 'Electronics & Communication (ECE)',
        years: [1, 2, 3, 4],
        sections: ['A', 'B']
      },
      {
        name: 'Information Science (ISE)',
        years: [1, 2, 3, 4],
        sections: ['A', 'B']
      }
    ]
  },
  {
    degree: 'M.Tech (Master of Technology)',
    departments: [
      {
        name: 'Data Science (DS)',
        years: [1, 2],
        sections: ['A']
      },
      {
        name: 'Software Engineering (SE)',
        years: [1, 2],
        sections: ['A']
      }
    ]
  }
];

export default function LecturerDashboardView({
  sessions,
  attendanceRecords,
  onActivate,
  onCreateSession,
  onDeleteSession,
  onReopen,
  onViewHistory,
  onStartSession,
  pendingOfflineCount,
  lecturerName,
  students,
  onUploadTimetable,
}: LecturerDashboardViewProps) {
  const [notified, setNotified] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>('ALL');

  // Tracks expanded states for tree nodes (path keys)
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'B.E. (Bachelor of Engineering)': true, // expanded by default
    'B.E. (Bachelor of Engineering)/Computer Science (CSE)': true, // expanded by default
    'B.E. (Bachelor of Engineering)/Computer Science (CSE)/3': true // Year 3 expanded by default
  });

  const toggleNode = (nodePath: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodePath]: !prev[nodePath] }));
  };

  // Folder sub-tab selection state
  const [activeFolderTab, setActiveFolderTab] = useState<'broadcast' | 'history' | 'roster' | 'resources' | 'audits'>('broadcast');

  // Manual Override Audits trail state
  const [overrideAudits, setOverrideAudits] = useState<any[]>([]);
  const [loadingAudits, setLoadingAudits] = useState(false);

  useEffect(() => {
    async function fetchAudits() {
      if (activeFolderTab === 'audits') {
        setLoadingAudits(true);
        try {
          const res = await fetch('/api/override-audits');
          if (!res.ok) throw new Error('API failed');
          const data = await res.json();
          setOverrideAudits(data);
        } catch (err) {
          console.error('Failed to fetch override audits:', err);
          setOverrideAudits([]);
        } finally {
          setLoadingAudits(false);
        }
      }
    }
    fetchAudits();
  }, [activeFolderTab]);

  // Identify duplicate device fingerprints
  const flaggedFingerprints = useMemo(() => {
    const fpGroups: Record<string, string[]> = {};
    attendanceRecords.forEach((r: any) => {
      const fp = r.deviceFingerprint || r.device_fingerprint;
      const usn = r.studentUsn || r.student_usn;
      if (fp && fp !== 'lecturer_manual') {
        if (!fpGroups[fp]) {
          fpGroups[fp] = [];
        }
        if (!fpGroups[fp].includes(usn)) {
          fpGroups[fp].push(usn);
        }
      }
    });
    
    const duplicates: string[] = [];
    Object.keys(fpGroups).forEach(fp => {
      if (fpGroups[fp].length > 1) {
        duplicates.push(fp);
      }
    });
    return duplicates;
  }, [attendanceRecords]);

  // Drag and drop / file upload states
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Slot-based session creation states
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedTimeline, setSelectedTimeline] = useState('10:00 AM - 11:00 AM');

  // Form states for creating a new session within selected slot
  const [formSubjCode, setFormSubjCode] = useState('');
  const [formSubjName, setFormSubjName] = useState('');

  // Selected folder coordinates parsed from hierarchical path
  const folderInfo = useMemo(() => {
    if (selectedFolder === 'ALL') return null;
    const parts = selectedFolder.split('/');
    if (parts.length < 4) return null;
    return {
      degree: parts[0],
      department: parts[1],
      year: parseInt(parts[2]) || 3,
      section: parts[3] || 'A'
    };
  }, [selectedFolder]);

  // Prefill default Subject Code & Name based on year when folder/slot changes
  useEffect(() => {
    if (folderInfo) {
      const yr = folderInfo.year;
      const deptCode = folderInfo.department.includes('CSE') ? 'CS' : folderInfo.department.includes('ECE') ? 'EC' : 'IS';
      setFormSubjCode(`${deptCode}${yr}01`);
      setFormSubjName(
        yr === 1
          ? 'Problem Solving with C'
          : yr === 2
          ? 'Data Structures and Algorithms'
          : yr === 3
          ? 'Computer Architecture'
          : 'Neural Networks'
      );
    }
  }, [selectedFolder, selectedTimeline, folderInfo]);

  const handleNotifyParents = () => {
    setNotified(true);
    setTimeout(() => setNotified(false), 3000);
  };

  // Find session associated with the active selected Date & Timeline Slot inside this folder
  const slotSession = useMemo(() => {
    if (!folderInfo) return null;
    
    return sessions.find(s => {
      const matchCourse = s.course?.toLowerCase() === folderInfo.degree.split(' ')[0].toLowerCase();
      const matchDept = s.department?.toLowerCase().includes(folderInfo.department.toLowerCase()) || 
                        folderInfo.department.toLowerCase().includes(s.department?.toLowerCase() || '');
      const matchYear = s.year === folderInfo.year;
      const matchSection = s.section?.toLowerCase() === folderInfo.section.toLowerCase();
      const matchTimeline = s.timeline === selectedTimeline;
      const matchDate = s.createdAt && s.createdAt.startsWith(selectedDate);
      
      return matchCourse && matchDept && matchYear && matchSection && matchTimeline && matchDate;
    });
  }, [sessions, folderInfo, selectedDate, selectedTimeline]);

  // Past history of created sessions inside this folder
  const folderSessionHistory = useMemo(() => {
    if (!folderInfo) return [];
    return sessions.filter(s => {
      const matchCourse = s.course?.toLowerCase() === folderInfo.degree.split(' ')[0].toLowerCase();
      const matchDept = s.department?.toLowerCase().includes(folderInfo.department.toLowerCase()) || 
                        folderInfo.department.toLowerCase().includes(s.department?.toLowerCase() || '');
      const matchYear = s.year === folderInfo.year;
      const matchSection = s.section?.toLowerCase() === folderInfo.section.toLowerCase();
      return matchCourse && matchDept && matchYear && matchSection;
    });
  }, [sessions, folderInfo]);

  const filteredAudits = useMemo(() => {
    if (!folderInfo) return overrideAudits;
    const folderSessionIds = folderSessionHistory.map(s => s.id);
    return overrideAudits.filter(a => folderSessionIds.includes(a.session_id));
  }, [overrideAudits, folderSessionHistory, folderInfo]);

  // Cohort statistics
  const currentStats = useMemo(() => {
    if (!folderInfo) {
      const total = students.length;
      const sum = students.reduce((acc, s) => acc + s.attendanceRate, 0);
      const avg = total > 0 ? (sum / total).toFixed(1) : '85.4';
      return { 
         avg: `${avg}%`, 
         count: `${total} Students`, 
         codeName: 'Sri Jayachamarajendra (All)' 
      };
    } else {
      const matched = students.filter(s => 
        s.year === folderInfo.year && 
        s.section?.toLowerCase() === folderInfo.section.toLowerCase()
      );
      const total = matched.length;
      const sum = matched.reduce((acc, s) => acc + s.attendanceRate, 0);
      const avg = total > 0 ? (sum / total).toFixed(1) : '100.0';
      return { 
         avg: `${avg}%`, 
         count: `${total} Students`, 
         codeName: `${folderInfo.department} Yr ${folderInfo.year} - Sec ${folderInfo.section}` 
      };
    }
  }, [students, folderInfo]);

  const criticalList = useMemo(() => {
    const lowRoster = students.filter(s => s.attendanceRate < 75);
    if (!folderInfo) return lowRoster;
    return lowRoster.filter(s => 
      s.year === folderInfo.year && 
      s.section?.toLowerCase() === folderInfo.section.toLowerCase()
    );
  }, [students, folderInfo]);

  // File Upload Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileProcess = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const resultStr = reader.result as string;
          const commaIdx = resultStr.indexOf(',');
          const base64 = commaIdx !== -1 ? resultStr.substring(commaIdx + 1) : resultStr;
          
          await onUploadTimetable(base64, file.type);
          setUploadSuccess(true);
          setTimeout(() => setUploadSuccess(false), 5000);
        } catch (err: any) {
          setUploadError(err?.message || 'Failed to process AI timetable');
        } finally {
          setUploading(false);
        }
      };
      reader.onerror = () => {
        setUploadError('Failed to read file contents');
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploadError(err?.message || 'Error uploading file');
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileProcess(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileProcess(files[0]);
    }
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Create session for slot
  const handleCreateSlotSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSubjCode || !formSubjName || !folderInfo) return;

    try {
      await onCreateSession({
        department: folderInfo.department,
        course: folderInfo.degree.split(' ')[0], // e.g., "B.E." or "M.Tech"
        year: folderInfo.year,
        section: folderInfo.section,
        subjectCode: formSubjCode.trim(),
        subjectName: formSubjName.trim(),
        timeline: selectedTimeline,
        date: selectedDate
      });
      // Clear inputs
      setFormSubjCode('');
      setFormSubjName('');
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  // Helper to render tree nodes
  const renderTree = () => {
    return (
      <div className="space-y-2.5 font-sans">
        <button
          type="button"
          onClick={() => setSelectedFolder('ALL')}
          className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
            selectedFolder === 'ALL'
              ? 'bg-[#6b38d4]/10 text-[#6b38d4]'
              : 'text-slate-655 hover:bg-slate-50'
          }`}
        >
          <span className="material-symbols-outlined text-sm">grid_view</span>
          All Semesters (Root)
        </button>

        <div className="border-t border-slate-100 my-2"></div>

        {ACADEMIC_TREE.map(degreeNode => {
          const degPath = degreeNode.degree;
          const isDegExpanded = !!expandedNodes[degPath];
          
          return (
            <div key={degPath} className="space-y-1">
              <div 
                onClick={() => toggleNode(degPath)}
                className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-extrabold text-slate-800 select-none"
              >
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-slate-400 text-sm">
                    {isDegExpanded ? 'keyboard_arrow_down' : 'keyboard_arrow_right'}
                  </span>
                  <span className="material-symbols-outlined text-indigo-500 text-sm">school</span>
                  <span>{degreeNode.degree.split(' ')[0]}</span>
                </div>
              </div>

              {isDegExpanded && (
                <div className="pl-3 border-l border-slate-100 ml-3.5 space-y-1">
                  {degreeNode.departments.map(deptNode => {
                    const deptPath = `${degPath}/${deptNode.name}`;
                    const isDeptExpanded = !!expandedNodes[deptPath];

                    return (
                      <div key={deptPath} className="space-y-1">
                        <div 
                          onClick={() => toggleNode(deptPath)}
                          className="flex items-center justify-between px-2 py-1 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-bold text-slate-700 select-none"
                        >
                          <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-slate-400 text-xs">
                              {isDeptExpanded ? 'keyboard_arrow_down' : 'keyboard_arrow_right'}
                            </span>
                            <span className="material-symbols-outlined text-teal-600 text-sm">account_tree</span>
                            <span>{deptNode.name.split(' ')[0]}</span>
                          </div>
                        </div>

                        {isDeptExpanded && (
                          <div className="pl-3 border-l border-slate-100 ml-3 space-y-1">
                            {deptNode.years.map(yr => {
                              const yrPath = `${deptPath}/${yr}`;
                              const isYrExpanded = !!expandedNodes[yrPath];

                              return (
                                <div key={yrPath} className="space-y-1">
                                  <div 
                                    onClick={() => toggleNode(yrPath)}
                                    className="flex items-center justify-between px-2 py-0.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-semibold text-slate-600 select-none"
                                  >
                                    <div className="flex items-center gap-1">
                                      <span className="material-symbols-outlined text-slate-400 text-[10px]">
                                        {isYrExpanded ? 'keyboard_arrow_down' : 'keyboard_arrow_right'}
                                      </span>
                                      <span className="material-symbols-outlined text-amber-500 text-sm">calendar_today</span>
                                      <span>Year {yr}</span>
                                    </div>
                                  </div>

                                  {isYrExpanded && (
                                    <div className="pl-3 ml-2.5 space-y-0.5">
                                      {deptNode.sections.map(sec => {
                                        const secPath = `${yrPath}/${sec}`;
                                        const isSelected = selectedFolder === secPath;

                                        return (
                                          <button
                                            key={secPath}
                                            type="button"
                                            onClick={() => {
                                              setSelectedFolder(secPath);
                                              setActiveFolderTab('broadcast');
                                            }}
                                            className={`w-full text-left px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                                              isSelected
                                                ? 'bg-[#6b38d4]/10 text-[#6b38d4] font-bold shadow-sm'
                                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                            }`}
                                          >
                                            <span className={`material-symbols-outlined text-xs ${isSelected ? 'text-[#6b38d4]' : 'text-gray-400'}`}>
                                              {isSelected ? 'folder_open' : 'folder'}
                                            </span>
                                            <span>Sec {sec}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      
      {/* LEFT COLUMN: ACADEMIC TREE EXPLORER SIDEBAR */}
      <aside className="lg:col-span-3 bg-white border border-[#cbc3d7]/35 rounded-3xl p-5 shadow-sm space-y-4 text-left min-h-[500px]">
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
          <span className="material-symbols-outlined text-[#6b38d4]">account_tree</span>
          <div>
            <h3 className="font-display font-extrabold text-slate-800 text-sm font-sans">
              Academic Explorer
            </h3>
            <p className="text-[9px] text-[#7b7486] leading-none mt-0.5 font-bold uppercase tracking-wider">
              Degree / Dept / Year / Sec
            </p>
          </div>
        </div>

        {/* Hierarchical tree explorer */}
        {renderTree()}
      </aside>

      {/* RIGHT COLUMN: WORKSPACE PANEL */}
      <main className="lg:col-span-9 space-y-6">
        
        {/* Dashboard Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2 animate-fade-in text-left">
          <div>
            <h2 className="text-2xl md:text-3xl font-display font-black text-[#191c1e] tracking-tight font-sans">
              Lecturer Console
            </h2>
            <p className="text-xs md:text-sm text-[#494454] mt-0.5 font-sans leading-none">
              Welcome back, {lecturerName || 'Dr. Aradhya'}. Directing SJCE Computer Science academic portals.
            </p>
          </div>
          
          {pendingOfflineCount > 0 && (
            <div className="flex items-center gap-2 self-start px-3 py-1.5 rounded-full bg-[#ffdad6] text-[#ba1a1a] text-xs font-sans font-bold border border-[#ba1a1a]/15">
              <span className="material-symbols-outlined text-sm">wifi_off</span>
              Local Buffer: {pendingOfflineCount} Students Cached
            </div>
          )}
        </div>

        {/* ==================== ROOT VIEW (ALL SEMESTERS) ==================== */}
        {selectedFolder === 'ALL' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Timetable & AI tools */}
          <div className="lg:col-span-8 space-y-6 text-left">
            {/* Timetable prompt draft helper banner */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-[10px] font-bold text-indigo-700 font-sans uppercase">
                  <span className="material-symbols-outlined text-xs">school</span> New Lecturer / Roster Setup
                </span>
                <h3 className="text-lg font-display font-extrabold text-slate-900 leading-snug font-sans">
                  Set up your academic folder structure
                </h3>
                <p className="text-xs text-slate-655 max-w-xl leading-relaxed">
                  Upload your class timetable PDF/image. The Alpine AI assistant will automatically parse and initialize academic section folders for Year 1-4.
                </p>
              </div>
              <button
                onClick={triggerFileInput}
                className="px-5 py-3 bg-[#6b38d4] hover:bg-[#8455ef] text-white rounded-xl text-xs font-sans font-bold shadow-md transition-all shrink-0 cursor-pointer flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">upload_file</span> Initialize via Timetable
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="acrylic-card p-5 rounded-2xl relative overflow-hidden bg-white border border-[#cbc3d7]/30 pr-16 shadow-sm">
                <p className="text-[10px] font-sans font-black tracking-widest text-[#7b7486] uppercase mb-1">
                  Folder Average Metric
                </p>
                <h4 className="text-2xl font-display font-black text-[#191c1e] font-sans">
                  {currentStats.avg}
                </h4>
                <p className="text-xs text-[#00687a] font-sans flex items-center gap-1 mt-1.5 font-medium">
                  <span className="material-symbols-outlined text-[16px]">verified_user</span> 
                  Cryptographically certified match rate
                </p>
                <div className="absolute right-4 bottom-4 text-gray-200 pointer-events-none select-none">
                  <span className="material-symbols-outlined text-[48px]">trending_up</span>
                </div>
              </div>

              <div className="acrylic-card p-5 rounded-2xl relative overflow-hidden bg-white border border-[#cbc3d7]/30 pr-16 shadow-sm">
                <p className="text-[10px] font-sans font-black tracking-widest text-[#7b7486] uppercase mb-1">
                  Active Enrolled Capacity
                </p>
                <h4 className="text-2xl font-display font-black text-[#191c1e] font-sans">
                  {currentStats.count}
                </h4>
                <p className="text-xs text-[#494454] font-sans mt-1.5 font-medium">
                  SJCE Roster Database Synced
                </p>
                <div className="absolute right-4 bottom-4 text-gray-200 pointer-events-none select-none">
                  <span className="material-symbols-outlined text-[48px]">groups</span>
                </div>
              </div>
            </div>

            {/* Roster overview */}
            <section className="acrylic-card rounded-2xl p-5 md:p-6 border border-[#cbc3d7]/30 bg-white shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#6b38d4]">menu_book</span>
                  <div>
                    <h3 className="text-md sm:text-lg font-display font-extrabold text-[#191c1e] font-sans">
                      Registrar Lecture Sessions Listing
                    </h3>
                    <p className="text-[10px] text-gray-400 font-sans leading-none mt-0.5">
                      Select an academic section folder above to manage slot sessions, view student rosters, notes, and overrides.
                    </p>
                  </div>
                </div>
              </div>
              <div className="text-center py-12 text-sm text-[#494454]/60 italic bg-gray-50/50 rounded-2xl border border-dashed border-gray-250">
                <span className="material-symbols-outlined text-4xl text-gray-300 block mb-2">folder_open</span>
                No folder selected. Please click on one of the "Academic Section Folders" above (e.g. Year 3 - Sec B) to manage the attendance gate.
              </div>
            </section>
          </div>

          {/* Right Column: Timetable Scheduler & Shortages */}
          <div className="lg:col-span-4 space-y-6 text-left">
            {/* AI Timetable PDF Uploader Section */}
            <section className="bg-indigo-50/30 border border-indigo-100 rounded-2xl p-5 md:p-6 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#6b38d4]">upload_file</span>
                <div>
                  <h3 className="text-sm font-display font-black text-indigo-950 leading-none font-sans">
                    AI Timetable Scheduler
                  </h3>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                    Auto-generate course slot session folders
                  </p>
                </div>
              </div>

              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={triggerFileInput}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                  isDragging 
                    ? 'border-[#6b38d4] bg-[#6b38d4]/10' 
                    : 'border-indigo-250 bg-white hover:bg-indigo-50/20'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  accept="application/pdf,image/*" 
                  className="hidden" 
                />
                
                {uploading ? (
                  <div className="space-y-2 py-2">
                    <span className="material-symbols-outlined text-2xl text-[#6b38d4] animate-spin">
                      sync
                    </span>
                    <p className="text-xs font-sans font-bold text-[#6b38d4] animate-pulse">
                      Alpine reading timetable...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 py-2">
                    <span className="material-symbols-outlined text-3xl text-indigo-400">
                      cloud_upload
                    </span>
                    <p className="text-xs font-semibold text-gray-700">
                      Drag timetable PDF/image or click
                    </p>
                    <p className="text-[9px] text-gray-400">
                      Supports PDF, PNG, JPG up to 10MB
                    </p>
                  </div>
                )}
              </div>

              {uploadError && (
                <p className="text-[10px] text-[#ba1a1a] font-sans font-bold text-center">
                  ⚠️ {uploadError}
                </p>
              )}
              
              {uploadSuccess && (
                <p className="text-[10px] text-emerald-700 font-sans font-bold text-center flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-xs">check_circle</span>
                  Session folders initialized successfully!
                </p>
              )}
            </section>

            {/* Low attendance list warning widget */}
            <section className="bg-red-50/50 border border-red-150 rounded-2xl p-5 md:p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-[#ba1a1a]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  warning
                </span>
                <div>
                  <h3 className="text-sm md:text-md font-display font-black text-[#ba1a1a] leading-none font-sans">
                    Shortage Warnings (All cohort)
                  </h3>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                    Below 75% required regulation bounds.
                  </p>
                </div>
              </div>

              <div className="space-y-3 mb-4 max-h-[220px] overflow-y-auto pr-1">
                {criticalList.length === 0 ? (
                  <div className="text-center py-4 text-xs text-gray-500 bg-white rounded-xl border border-dashed border-gray-150">
                    Excellent! Zero shortage incidents.
                  </div>
                ) : (
                  criticalList.slice(0, 5).map((st) => (
                    <div 
                      key={st.usn} 
                      className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-100"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#ba1a1a]/10 text-[#ba1a1a] flex items-center justify-center text-xs font-bold uppercase select-none">
                          {st.name.substring(0, 2)}
                        </div>
                        <div>
                          <p className="font-display font-bold text-[#191c1e] text-xs font-sans">{st.name}</p>
                          <p className="text-[9px] text-gray-400 font-mono">{st.usn} &bull; Year {st.year} &bull; Sec {st.section}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[#ba1a1a] font-mono font-black text-xs">{st.attendanceRate}%</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ==================== FOLDER WORKSPACE VIEW (THE DIFFERENT WORLD) ==================== */}
      {selectedFolder !== 'ALL' && folderInfo && (
        <div className="space-y-6 animate-fade-in text-left">
          {/* Folder Workspace Sub-Header */}
          <div className="bg-white border border-[#cbc3d7]/30 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-50 text-[#6b38d4] rounded-2xl flex items-center justify-center border border-indigo-150 shadow-sm shrink-0">
                <span className="material-symbols-outlined text-[32px]">folder_open</span>
              </div>
              <div>
                <h3 className="font-display font-black text-slate-800 text-lg sm:text-xl font-sans">
                  Computer Science (CSE) &bull; Year {folderInfo.year} &bull; Section {folderInfo.section}
                </h3>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  Academic cohort workspace folder &bull; Estimated: {currentStats.count} &bull; Class Avg: {currentStats.avg}
                </p>
              </div>
            </div>

            {/* Folder Tab Switches */}
            <div className="flex gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 self-start md:self-auto overflow-x-auto max-w-full">
              {[
                { id: 'broadcast', label: 'Broadcast Gate', icon: 'sensors' },
                { id: 'history', label: 'History & Grid', icon: 'table_view' },
                { id: 'roster', label: 'Roster Directory', icon: 'groups' },
                { id: 'resources', label: 'Syllabus & Notes', icon: 'menu_book' },
                { id: 'audits', label: 'Override Audits', icon: 'history_edu' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveFolderTab(t.id as any)}
                  className={`px-3.5 py-2 rounded-xl font-sans font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                    activeFolderTab === t.id
                      ? 'bg-white text-[#6b38d4] shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Workspace Column (Main Tab Content) */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Tab 1: Broadcast Gate / Live Session Slot Controller */}
              {activeFolderTab === 'broadcast' && (
                <section className="bg-white border border-[#cbc3d7]/30 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[#6b38d4]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        sensors
                      </span>
                      <div>
                        <h4 className="font-display font-extrabold text-[#191c1e] text-md font-sans">
                          Class Slot Broadcaster
                        </h4>
                        <p className="text-[10px] text-gray-500 font-sans mt-0.5">
                          Select a date and timeframe to spawn or broadcast attendance gates
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Slot selection controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-55 p-4 rounded-2xl border border-slate-150">
                    <div>
                      <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Select Lecture Date
                      </label>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full p-3 rounded-xl border border-slate-200 bg-white font-sans text-xs outline-none focus:ring-1 focus:ring-[#6b38d4]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-sans font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Select Timeline Slot
                      </label>
                      <select
                        value={selectedTimeline}
                        onChange={(e) => setSelectedTimeline(e.target.value)}
                        className="w-full p-3 rounded-xl border border-slate-200 bg-white font-sans text-xs outline-none focus:ring-1 focus:ring-[#6b38d4]"
                      >
                        <option value="09:00 AM - 10:00 AM">Period 1: 09:00 AM - 10:00 AM</option>
                        <option value="10:00 AM - 11:00 AM">Period 2: 10:00 AM - 11:00 AM</option>
                        <option value="11:30 AM - 12:30 PM">Period 3: 11:30 AM - 12:30 PM</option>
                        <option value="12:30 PM - 01:30 PM">Period 4: 12:30 PM - 01:30 PM</option>
                        <option value="02:00 PM - 03:00 PM">Period 5: 02:00 PM - 03:00 PM</option>
                        <option value="03:00 PM - 04:00 PM">Period 6: 03:00 PM - 04:00 PM</option>
                      </select>
                    </div>
                  </div>

                  {/* Slot Session conditional state rendering */}
                  {!slotSession ? (
                    <div className="bg-slate-50/50 rounded-2xl p-6 border border-dashed border-slate-250 space-y-4">
                      <div className="space-y-1">
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[8.5px] font-extrabold font-sans uppercase rounded border border-amber-100">
                          Empty Slot
                        </span>
                        <h5 className="font-display font-extrabold text-slate-800 text-sm font-sans pt-1">
                          No Session Spawned
                        </h5>
                        <p className="text-xs text-slate-500 leading-normal max-w-md">
                          Attendance logging is locked for this time window. Create a session to pre-generate visual verification parameters.
                        </p>
                      </div>

                      {/* Modal-like inline creation form */}
                      <form onSubmit={handleCreateSlotSession} className="bg-white p-4 rounded-xl border border-slate-150 space-y-3.5 max-w-md">
                        <span className="text-[9px] font-sans font-bold text-[#6b38d4] uppercase tracking-wider block">
                          Configure Session Details
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-1">
                            <label className="block text-[8px] font-sans font-bold text-slate-400 uppercase tracking-widest mb-1">
                              Subject Code
                            </label>
                            <input
                              type="text"
                              value={formSubjCode}
                              onChange={(e) => setFormSubjCode(e.target.value.toUpperCase())}
                              className="w-full p-2 border border-slate-200 rounded-lg text-xs font-mono"
                              placeholder="CS501"
                              required
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[8px] font-sans font-bold text-slate-400 uppercase tracking-widest mb-1">
                              Subject Name
                            </label>
                            <input
                              type="text"
                              value={formSubjName}
                              onChange={(e) => setFormSubjName(e.target.value)}
                              className="w-full p-2 border border-slate-200 rounded-lg text-xs font-sans"
                              placeholder="e.g. Computer Architecture"
                              required
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="w-full py-2.5 bg-[#6b38d4] hover:bg-[#8455ef] text-white rounded-lg font-sans font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-sm">add_circle</span>
                          Create Session
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Active Status Badge Banner */}
                      <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-[#6b38d4] text-xs flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm animate-pulse">radio_button_checked</span>
                          <span className="font-semibold">Session is configured in draft state.</span>
                        </div>
                        <span className="font-mono text-[10px] font-extrabold bg-[#6b38d4]/10 px-2 py-0.5 rounded">
                          {slotSession.status}
                        </span>
                      </div>

                      {/* Three preview blocks: QR, OTP, Symbol */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-150/50 text-left">
                        {/* Block 1: QR Code Preview */}
                        <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col items-center justify-center text-center">
                          <span className="text-[8px] font-sans font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-semibold">
                            Generated QR Code
                          </span>
                          <img
                            alt="Roster QR Preview"
                            className="w-20 h-20 object-cover opacity-60 border border-slate-100 rounded"
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=6b38d4&margin=6&data=${encodeURIComponent(
                              `${window.location.origin}/student-dashboard?check-in=true&sessionId=${slotSession.id}&otp=${slotSession.otp}&option=${slotSession.verificationOption}`
                            )}`}
                          />
                          <span className="text-[7.5px] font-sans text-amber-600 font-bold mt-1 bg-amber-50 px-1 rounded uppercase">
                            Inactive until start
                          </span>
                        </div>

                        {/* Block 2: OTP Verification Code */}
                        <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col items-center justify-center text-center">
                          <span className="text-[8px] font-sans font-bold text-slate-400 uppercase tracking-wider mb-2 font-semibold">
                            Verification OTP
                          </span>
                          <div className="flex gap-1 justify-center">
                            {slotSession.otp ? (
                              slotSession.otp.split('').map((digit, index) => (
                                <span
                                  key={index}
                                  className="text-lg font-display font-black text-[#6b38d4] bg-[#6b38d4]/5 px-2 py-0.5 rounded border border-[#6b38d4]/10"
                                >
                                  {digit}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-450 italic">None</span>
                            )}
                          </div>
                          <span className="text-[7.5px] font-sans text-slate-400 mt-2">
                            Auto-rotates in live session
                          </span>
                        </div>

                        {/* Block 3: Challenge shape */}
                        <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col items-center justify-center text-center">
                          <span className="text-[8px] font-sans font-bold text-slate-400 uppercase tracking-wider mb-2 font-semibold">
                            Verification Shape
                          </span>
                          <div className="flex items-center gap-1.5 justify-center">
                            {slotSession.verificationOption === 'BLUE_CIRCLE' ? (
                              <>
                                <span className="text-md">🔵</span>
                                <span className="font-display font-bold text-xs text-[#004e5c]">Blue Circle</span>
                              </>
                            ) : slotSession.verificationOption === 'RED_SQUARE' ? (
                              <>
                                <span className="text-md">🟥</span>
                                <span className="font-display font-bold text-xs text-[#ba1a1a]">Red Square</span>
                              </>
                            ) : slotSession.verificationOption === 'GREEN_TRIANGLE' ? (
                              <>
                                <span className="text-md">🔺</span>
                                <span className="font-display font-bold text-xs text-emerald-700">Green Triangle</span>
                              </>
                            ) : slotSession.verificationOption === 'YELLOW_STAR' ? (
                              <>
                                <span className="text-md">⭐</span>
                                <span className="font-display font-bold text-xs text-amber-600">Yellow Star</span>
                              </>
                            ) : (
                              <span className="text-xs text-slate-450 italic">None</span>
                            )}
                          </div>
                          <span className="text-[7.5px] font-sans text-slate-400 mt-2">
                            Anti-proxy visual challenge
                          </span>
                        </div>
                      </div>

                      {/* Main action buttons: Activate vs Delete */}
                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        {slotSession.status === 'ACTIVE' ? (
                          <button
                            type="button"
                            onClick={onStartSession}
                            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-sans font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">tap_and_play</span>
                            View Active Broadcast Canvas
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onActivate(slotSession.id)}
                            className="flex-1 py-3 bg-[#6b38d4] hover:bg-[#8455ef] text-white rounded-xl font-sans font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">play_circle</span>
                            Activate Broadcasting
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onDeleteSession(slotSession.id)}
                          className="py-3 px-6 border border-[#ba1a1a]/30 text-[#ba1a1a] hover:bg-[#ba1a1a]/5 rounded-xl font-sans font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                          Cancel Section (Delete)
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Tab 2: History & Spreadsheet logs */}
              {activeFolderTab === 'history' && (
                <section className="bg-white border border-[#cbc3d7]/30 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[#6b38d4]">
                        history
                      </span>
                      <div>
                        <h4 className="font-display font-extrabold text-[#191c1e] text-md font-sans">
                          Past Attendance Registers
                        </h4>
                        <p className="text-[10px] text-gray-500 font-sans mt-0.5">
                          View past roster columns or open the interactive excel override spreadsheet
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onViewHistory({
                        course: folderInfo?.degree.split(' ')[0],
                        department: folderInfo?.department,
                        year: folderInfo?.year,
                        section: folderInfo?.section
                      })}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-sans font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-xs">table_view</span>
                      Open Excel Override Grid
                    </button>
                  </div>

                  <div className="space-y-3">
                    {folderSessionHistory.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-400 italic">
                        No past attendance slots recorded in this folder yet.
                      </div>
                    ) : (
                      folderSessionHistory.map(s => (
                        <div key={s.id} className="flex justify-between items-center p-3.5 bg-slate-50 rounded-xl border border-slate-150">
                          <div>
                            <span className="text-xs font-bold text-slate-800 block">
                              {s.subjectCode} - {s.subjectName}
                            </span>
                            <span className="text-[10px] text-slate-500 font-sans block mt-0.5">
                              {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'Date'} &bull; {s.timeline}
                            </span>
                          </div>
                          <div className="text-right flex items-center gap-3">
                            <div>
                              <span className="text-xs font-bold text-[#6b38d4] block">
                                {s.markedCount} / {s.expectedCount} Marked
                              </span>
                              <span className="text-[8.5px] uppercase font-bold text-slate-400 block">
                                Capacity Quotient
                              </span>
                            </div>
                            {s.status === 'INACTIVE' && (
                              <button
                                type="button"
                                onClick={() => onReopen(s.id)}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-sans font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
                              >
                                <span className="material-symbols-outlined text-xs">replay</span>
                                Reopen Gate
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              )}

              {/* Tab 3: Roster Directory Table */}
              {activeFolderTab === 'roster' && (
                <section className="bg-white border border-[#cbc3d7]/30 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[#6b38d4]">groups</span>
                      <div>
                        <h4 className="font-display font-extrabold text-[#191c1e] text-md font-sans">
                          Cohort Student Directory
                        </h4>
                        <p className="text-[10px] text-gray-500 font-sans mt-0.5">
                          Complete roster directory for CSE Year {folderInfo.year} - Section {folderInfo.section}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="file"
                        id="rosterCsvFileInput"
                        accept=".csv"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const text = await file.text();
                          try {
                            const res = await fetch('/api/students/import-csv', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ csvText: text })
                            });
                            const data = await res.json();
                            if (data.success) {
                              alert(`Successfully imported ${data.count} student candidates!`);
                              window.location.reload();
                            } else {
                              alert(`Failed to import roster: ${data.error}`);
                            }
                          } catch (err: any) {
                            alert(`Error uploading CSV: ${err.message}`);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById('rosterCsvFileInput')?.click()}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-[#6b38d4] rounded-xl text-[11px] font-sans font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-xs">upload</span>
                        Import CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => window.open('/api/students/export-csv')}
                        className="px-3 py-1.5 bg-[#eceef0] hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-sans font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-xs">download</span>
                        Export CSV
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-150">
                    <table className="w-full text-left font-sans text-xs">
                      <thead className="bg-slate-50 border-b border-slate-150">
                        <tr>
                          <th className="px-4 py-2.5 font-bold text-slate-500 uppercase text-[9px]">Student Candidate</th>
                          <th className="px-4 py-2.5 font-bold text-slate-500 uppercase text-[9px]">USN Code</th>
                          <th className="px-4 py-2.5 font-bold text-slate-500 uppercase text-[9px] text-center">Attendance Quotient</th>
                          <th className="px-4 py-2.5 font-bold text-slate-500 uppercase text-[9px] text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {students
                          .filter(s => s.year === folderInfo.year && s.section === folderInfo.section)
                          .map((st) => {
                            const status = st.attendanceRate >= 85 ? 'Optimal' : st.attendanceRate >= 75 ? 'Moderate' : 'Shortage';
                            const badgeColor = status === 'Optimal' ? 'bg-[#6b38d4]/10 text-[#6b38d4]' : status === 'Moderate' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700';
                            
                            const hasDuplicateFp = attendanceRecords.some((r: any) => {
                              const usn = r.studentUsn || r.student_usn;
                              const fp = r.deviceFingerprint || r.device_fingerprint;
                              return usn === st.usn && fp && flaggedFingerprints.includes(fp);
                            });

                            return (
                              <tr key={st.usn} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-3 flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-md bg-violet-100 text-[#6b38d4] font-display font-bold flex items-center justify-center text-[10px]">
                                    {st.name.substring(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <span className="font-semibold text-slate-800 block">{st.name}</span>
                                    {hasDuplicateFp && (
                                      <span className="inline-flex items-center gap-1 text-[8.5px] font-sans font-bold text-red-650 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded mt-0.5 animate-pulse">
                                        <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                                        Duplicate Fingerprint Detected
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-mono text-[10px] text-slate-500">{st.usn}</td>
                                <td className="px-4 py-3 font-mono text-center font-bold text-slate-800">{st.attendanceRate}%</td>
                                <td className="px-4 py-3 text-right">
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${badgeColor}`}>
                                    {status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Tab 4: Resources (Syllabus & Notes) */}
              {activeFolderTab === 'resources' && (
                <section className="bg-white border border-[#cbc3d7]/30 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                      <span className="material-symbols-outlined text-[#6b38d4]">menu_book</span>
                      <div>
                        <h4 className="font-display font-extrabold text-[#191c1e] text-md font-sans">
                          Syllabus & Lecture Notes
                        </h4>
                        <p className="text-[10px] text-gray-500 font-sans mt-0.5">
                          Academic syllabus guidelines and study materials for this cohort
                        </p>
                      </div>
                    </div>

                    {/* Mock Syllabus content */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-2">
                      <span className="text-[9px] font-sans font-extrabold text-indigo-700 uppercase tracking-wider block">
                        Course Syllabus Details
                      </span>
                      <h5 className="text-xs font-bold text-slate-800">
                        CSE {formSubjCode} - {formSubjName}
                      </h5>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        This course covers the fundamentals of processing architectures, memory management hierarchies, and device matrix protocols. Students will learn assembly registers, cache mapping constraints, and synchronous handshake logic.
                      </p>
                      <div className="grid grid-cols-2 gap-3 pt-2 text-[10px] text-slate-600 font-semibold">
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-indigo-500">menu</span>
                          <span>Module 1-5 complete</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-indigo-500">assignment</span>
                          <span>3 Credits Grade</span>
                        </div>
                      </div>
                    </div>

                    {/* Mock Notes listing */}
                    <div className="space-y-3">
                      <span className="text-[9px] font-sans font-extrabold text-[#6b38d4] uppercase tracking-wider block">
                        Lecture Material & PDF Notes
                      </span>
                      
                      {[
                        { title: 'Unit 1: Introduction to Register Design.pdf', size: '2.4 MB', type: 'PDF' },
                        { title: 'Unit 2: Cache Mapping and Memory Hierarchy.ppt', size: '5.8 MB', type: 'PPT' },
                        { title: 'Unit 3: I/O Interface and Secure Handshake.pdf', size: '1.9 MB', type: 'PDF' }
                      ].map((doc, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3 bg-white border border-slate-200 rounded-xl hover:border-[#6b38d4] transition-all">
                          <div className="flex items-center gap-2.5">
                            <span className="material-symbols-outlined text-slate-400">description</span>
                            <span className="text-xs font-bold text-slate-700">{doc.title}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-slate-400 font-mono">{doc.size}</span>
                            <span className="px-2 py-0.5 bg-indigo-55 text-indigo-700 font-bold text-[8.5px] rounded uppercase font-sans">
                              {doc.type}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {activeFolderTab === 'audits' && (
                <section className="bg-white border border-[#cbc3d7]/30 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <span className="material-symbols-outlined text-[#6b38d4]">history_edu</span>
                    <div>
                      <h4 className="font-display font-extrabold text-[#191c1e] text-md font-sans">
                        Manual Override Audit Trail
                      </h4>
                      <p className="text-[10px] text-gray-500 font-sans mt-0.5">
                        University accredited logs recording manually overridden student presence
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-150">
                    <table className="w-full text-left font-sans text-xs">
                      <thead className="bg-slate-50 border-b border-slate-150">
                        <tr>
                          <th className="px-4 py-2.5 font-bold text-slate-500 uppercase text-[9px]">Student USN</th>
                          <th className="px-4 py-2.5 font-bold text-slate-500 uppercase text-[9px]">Overridden By</th>
                          <th className="px-4 py-2.5 font-bold text-slate-500 uppercase text-[9px]">Timestamp</th>
                          <th className="px-4 py-2.5 font-bold text-slate-500 uppercase text-[9px] text-right">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loadingAudits ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">
                              Loading audit trail logs...
                            </td>
                          </tr>
                        ) : filteredAudits.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">
                              No manual overrides logged for this section.
                            </td>
                          </tr>
                        ) : (
                          filteredAudits.map((a: any, index: number) => (
                            <tr key={a.id || index} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 font-mono font-bold text-[#6b38d4]">{a.studentUsn || a.student_usn}</td>
                              <td className="px-4 py-3 text-slate-700 font-medium">{a.overriddenBy || a.overridden_by}</td>
                              <td className="px-4 py-3 text-slate-500 font-sans">{new Date(a.timestamp).toLocaleString()}</td>
                              <td className="px-4 py-3 text-slate-800 text-right font-medium">{a.reason}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>

            {/* Right Workspace Column (Cohort summary shortage alerts) */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Shortage warning box */}
              <section className="bg-red-50/50 border border-red-150 rounded-2xl p-5 md:p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-[#ba1a1a]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    warning
                  </span>
                  <div>
                    <h3 className="text-sm md:text-md font-display font-black text-[#ba1a1a] leading-none font-sans">
                      Section Warnings
                    </h3>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                      Below 75% required regulation bounds.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 mb-4 max-h-[220px] overflow-y-auto pr-1">
                  {criticalList.length === 0 ? (
                    <div className="text-center py-4 text-xs text-gray-500 bg-white rounded-xl border border-dashed border-gray-150">
                      Excellent! Zero shortage incidents inside this section.
                    </div>
                  ) : (
                    criticalList.map((st) => (
                      <div 
                        key={st.usn} 
                        className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-100 hover:border-red-200"
                      >
                        <div className="flex items-center gap-2.5 text-left">
                          <div className="w-8 h-8 rounded-lg bg-[#ba1a1a]/10 text-[#ba1a1a] flex items-center justify-center text-xs font-bold uppercase select-none">
                            {st.name.substring(0, 2)}
                          </div>
                          <div>
                            <p className="font-display font-bold text-[#191c1e] text-xs font-sans">{st.name}</p>
                            <p className="text-[9px] text-gray-400 font-mono">{st.usn} &bull; CSE</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[#ba1a1a] font-mono font-black text-xs">{st.attendanceRate}%</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <button 
                  onClick={handleNotifyParents}
                  className={`w-full py-2.5 rounded-lg text-xs font-sans font-extrabold uppercase border tracking-wider transition-all cursor-pointer ${
                    notified
                      ? 'bg-green-600 text-white border-transparent'
                      : 'text-[#ba1a1a] border-red-200 hover:bg-red-500/10'
                  }`}
                >
                  {notified ? '✓ Guard Alerts Spawned' : 'Generate SMS Alerts'}
                </button>
              </section>

              {/* Quick info specs */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm text-xs space-y-3 text-left">
                <h4 className="font-display font-bold text-slate-900 text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#6b38d4]">lock</span>
                  Secured Handshake Specs
                </h4>
                <ul className="space-y-2 text-slate-600 list-disc list-inside leading-relaxed font-sans">
                  <li>Visual projection code matches USN identities automatically.</li>
                  <li>QR code contains secure 120-second validity signature.</li>
                  <li>Deactivating gate locks spreadsheet columns permanently.</li>
                </ul>
              </div>

            </div>

          </div>
        </div>
      )}
      </main>
    </div>
  );
}
