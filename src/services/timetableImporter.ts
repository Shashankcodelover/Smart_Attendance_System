/**
 * Timetable & Roster Auto-Ingestion Engine — Smart Attendance IR-11 / Enterprise
 * 
 * 1. Timetable CSV/ICS Parser: Ingests weekly university schedules and auto-provisions lecture sessions.
 * 2. Student Roster Bulk Importer: Parses CSV rosters (USN, Name, Email, Semester, Branch).
 * 3. Schedule Conflict Detector: Identifies double-booked classrooms or overlapping professor hours.
 */

export interface TimetableEntry {
    dayOfWeek: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY';
    subjectCode: string;
    subjectName: string;
    lecturerEmail: string;
    classroom: string;
    startTime: string; // "09:00"
    endTime: string;   // "10:00"
}

export interface StudentRosterEntry {
    usn: string;
    name: string;
    email: string;
    semester: number;
    department: string;
}

export class TimetableImporter {
    /**
     * Parses CSV timetable text into structured entries.
     * Format: Day,SubjectCode,SubjectName,LecturerEmail,Classroom,StartTime,EndTime
     */
    parseTimetableCsv(csvContent: string): TimetableEntry[] {
        const lines = csvContent.split(/\r\n|\r|\n/).map(l => l.trim()).filter(l => l.length > 0);
        const entries: TimetableEntry[] = [];

        // Skip header if present
        const startIndex = lines[0].toLowerCase().includes('subject') ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
            const parts = lines[i].split(',').map(p => p.trim());
            if (parts.length >= 7) {
                const day = parts[0].toUpperCase() as TimetableEntry['dayOfWeek'];
                entries.push({
                    dayOfWeek: day,
                    subjectCode: parts[1].toUpperCase(),
                    subjectName: parts[2],
                    lecturerEmail: parts[3].toLowerCase(),
                    classroom: parts[4],
                    startTime: parts[5],
                    endTime: parts[6],
                });
            }
        }

        return entries;
    }

    /**
     * Parses Student Roster CSV into structured student entries.
     * Format: USN,Name,Email,Semester,Department
     */
    parseStudentRosterCsv(csvContent: string): StudentRosterEntry[] {
        const lines = csvContent.split(/\r\n|\r|\n/).map(l => l.trim()).filter(l => l.length > 0);
        const roster: StudentRosterEntry[] = [];

        const startIndex = lines[0].toLowerCase().includes('usn') ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
            const parts = lines[i].split(',').map(p => p.trim());
            if (parts.length >= 5) {
                roster.push({
                    usn: parts[0].toUpperCase(),
                    name: parts[1],
                    email: parts[2].toLowerCase(),
                    semester: parseInt(parts[3], 10) || 1,
                    department: parts[4],
                });
            }
        }

        return roster;
    }

    /**
     * Detects overlapping schedule conflicts in the timetable.
     */
    detectScheduleConflicts(entries: TimetableEntry[]) {
        const conflicts: Array<{ entryA: TimetableEntry; entryB: TimetableEntry; reason: string }> = [];

        for (let i = 0; i < entries.length; i++) {
            for (let j = i + 1; j < entries.length; j++) {
                const a = entries[i];
                const b = entries[j];

                if (a.dayOfWeek === b.dayOfWeek) {
                    const aStart = this.timeToMinutes(a.startTime);
                    const aEnd = this.timeToMinutes(a.endTime);
                    const bStart = this.timeToMinutes(b.startTime);
                    const bEnd = this.timeToMinutes(b.endTime);

                    const overlaps = (aStart < bEnd && aEnd > bStart);

                    if (overlaps) {
                        if (a.classroom === b.classroom) {
                            conflicts.push({ entryA: a, entryB: b, reason: `Classroom ${a.classroom} double-booked` });
                        } else if (a.lecturerEmail === b.lecturerEmail) {
                            conflicts.push({ entryA: a, entryB: b, reason: `Lecturer ${a.lecturerEmail} scheduled in two rooms simultaneously` });
                        }
                    }
                }
            }
        }

        return {
            hasConflicts: conflicts.length > 0,
            conflictCount: conflicts.length,
            conflicts,
        };
    }

    private timeToMinutes(timeStr: string): number {
        const [h, m] = timeStr.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    }
}

export const timetableImporter = new TimetableImporter();
