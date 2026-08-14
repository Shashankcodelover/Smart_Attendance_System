import test from 'node:test';
import assert from 'node:assert/strict';
import { timetableImporter } from '../src/services/timetableImporter.ts';

test('TimetableImporter parses CSV timetable and student roster cleanly', () => {
    const csvTimetable = `
Day,SubjectCode,SubjectName,LecturerEmail,Classroom,StartTime,EndTime
MONDAY,21CS51,Management & Entrepreneurship,prof.sharma@sjce.edu,Hall-101,09:00,10:00
MONDAY,21CS52,Computer Networks,prof.patil@sjce.edu,Hall-102,10:00,11:00
TUESDAY,21CS53,Database Management Systems,prof.sharma@sjce.edu,Hall-101,09:00,10:00
    `.trim();

    const entries = timetableImporter.parseTimetableCsv(csvTimetable);
    assert.equal(entries.length, 3);
    assert.equal(entries[0].subjectCode, '21CS51');
    assert.equal(entries[0].classroom, 'Hall-101');
    assert.equal(entries[1].dayOfWeek, 'MONDAY');

    const conflicts = timetableImporter.detectScheduleConflicts(entries);
    assert.equal(conflicts.hasConflicts, false);
    assert.equal(conflicts.conflictCount, 0);
});

test('TimetableImporter detects classroom double-booking and lecturer overlap conflicts', () => {
    const conflictingCsv = `
Day,SubjectCode,SubjectName,LecturerEmail,Classroom,StartTime,EndTime
MONDAY,21CS51,Management,prof.sharma@sjce.edu,Hall-101,09:00,10:30
MONDAY,21CS52,Networks,prof.patil@sjce.edu,Hall-101,10:00,11:00
    `.trim();

    const entries = timetableImporter.parseTimetableCsv(conflictingCsv);
    const conflicts = timetableImporter.detectScheduleConflicts(entries);
    assert.equal(conflicts.hasConflicts, true);
    assert.equal(conflicts.conflictCount, 1);
    assert.ok(conflicts.conflicts[0].reason.includes('double-booked'));
});

test('TimetableImporter parses student roster CSV with USN formatting', () => {
    const rosterCsv = `
USN,Name,Email,Semester,Department
4JC21CS001,Preetham J,preetham@sjce.edu,5,CSE
4JC21CS002,Aditya Roy,aditya@sjce.edu,5,CSE
    `.trim();

    const students = timetableImporter.parseStudentRosterCsv(rosterCsv);
    assert.equal(students.length, 2);
    assert.equal(students[0].usn, '4JC21CS001');
    assert.equal(students[1].name, 'Aditya Roy');
    assert.equal(students[0].semester, 5);
});
