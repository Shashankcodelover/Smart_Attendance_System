import test from 'node:test';
import assert from 'node:assert/strict';
import { teacherSuite } from '../src/services/teacherSuite.ts';

test('TeacherSuite: 01-05. Timetable ingest, rotating QR, roster, clash detect, and live headcount radar', () => {
    const timetable = `
Day,Code,Name,Email,Room,Start,End
MONDAY,CS1,OS,prof@sjce.edu,H1,09:00,10:00
    `.trim();
    const t = teacherSuite.bulkIngestTimetable(timetable);
    assert.equal(t.totalParsed, 1);

    const qr = teacherSuite.generateRotatingAntiProxyQR('sess_101');
    assert.ok(qr.token.includes('.'));
    assert.ok(qr.challengeShape);

    const roster = `
USN,Name,Email,Semester,Department
4JC21CS001,Preetham,p@sjce.edu,5,CSE
    `.trim();
    const r = teacherSuite.bulkIngestStudentRoster(roster);
    assert.equal(r.totalIngested, 1);

    const clashes = teacherSuite.detectFacultyScheduleClashes([
        { lecturer: 'Prof A', room: 'H1', day: 'MON', startMins: 540, endMins: 600 },
        { lecturer: 'Prof B', room: 'H1', day: 'MON', startMins: 570, endMins: 630 },
    ]);
    assert.equal(clashes.hasClashes, true);
    assert.equal(clashes.clashCount, 1);

    const radar = teacherSuite.generateLiveHeadcountRadar(60, 52);
    assert.equal(radar.presencePercentage, 86.7);
    assert.equal(radar.occupancyStatus, 'FULL_CAPACITY');
});

test('TeacherSuite: 06-10. Statutory warnings, condonation review, acoustic beacons, substitute delegation, and overrides', () => {
    const report = teacherSuite.generateStatutoryShortageReport([
        { usn: '4JC21CS001', name: 'Preetham', attendancePct: 68.0 },
        { usn: '4JC21CS002', name: 'Aditya', attendancePct: 88.0 },
    ]);
    assert.equal(report.shortageCount, 1);
    assert.equal(report.notices[0].statutoryDeficit, 7.0);

    const condoned = teacherSuite.reviewCondonationClaim('claim_1', '4JC21CS001', 40, 28, 3);
    assert.equal(condoned.recalculatedAttendancePct, 77.5);
    assert.equal(condoned.isClearedAfterCondonation, true);

    const beacon = teacherSuite.generateUltrasonicAudioBeacon('sess_1', 19200);
    assert.equal(beacon.acousticFrequencyHz, 19200);
    assert.ok(beacon.ultrasonicToken.length > 0);

    const sub = teacherSuite.reassignSubstituteLecturer('sess_1', 'prof@sjce.edu', 'sub@sjce.edu', 'Medical Leave');
    assert.equal(sub.status, 'ACTIVE_DELEGATED_PERMISSIONS');

    const override = teacherSuite.batchOverrideAttendance('prof@sjce.edu', 'sess_1', [{ usn: '4JC21CS001', newStatus: 'PRESENT' }], 'Camera glitch');
    assert.equal(override.success, true);
    assert.equal(override.totalUpdated, 1);
});

test('TeacherSuite: 11-15. Section mergers, punctuality, NAAC reports, geofencing ray-cast, and proxy ring detector', () => {
    const merged = teacherSuite.mergeMultiSectionAttendance(['STU_1', 'STU_2'], ['STU_2', 'STU_3']);
    assert.equal(merged.combinedTotalHeadcount, 3);

    const punc = teacherSuite.analyzeClassPunctuality([0, 2, 4, 12, 1]);
    assert.equal(punc.onTimePercentage, 80.0);
    assert.equal(punc.latePercentage, 20.0);

    const naac = teacherSuite.generateAccreditationAuditReport('CSE', '2025-2026', 82.5, 120);
    assert.equal(naac.statutoryComplianceStatus, 'FULLY_COMPLIANT');

    // Square classroom geofence: (0,0) to (10,10)
    const classroomPolygon = [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 10 },
        { latitude: 10, longitude: 10 },
        { latitude: 10, longitude: 0 },
    ];
    const insidePoint = { latitude: 5, longitude: 5 };
    const outsidePoint = { latitude: 15, longitude: 15 };

    const inGeo = teacherSuite.validateGeofencePolygon(insidePoint, classroomPolygon);
    assert.equal(inGeo.isInsideClassroomBoundary, true);

    const outGeo = teacherSuite.validateGeofencePolygon(outsidePoint, classroomPolygon);
    assert.equal(outGeo.isInsideClassroomBoundary, false);

    // Proxy ring detection: 4 students from same IP
    const checkins = [
        { usn: 'S1', ipAddress: '192.168.1.100', deviceModel: 'iPhone', timestamp: 100 },
        { usn: 'S2', ipAddress: '192.168.1.100', deviceModel: 'Pixel', timestamp: 101 },
        { usn: 'S3', ipAddress: '192.168.1.100', deviceModel: 'Galaxy', timestamp: 102 },
        { usn: 'S4', ipAddress: '192.168.1.100', deviceModel: 'OnePlus', timestamp: 103 },
    ];
    const ring = teacherSuite.detectProxyRingsAndAnomalies(checkins);
    assert.equal(ring.isAnomalyDetected, true);
    assert.equal(ring.riskScore, 'HIGH_PROXY_RING_RISK');
    assert.equal(ring.suspiciousIPClustersCount, 1);
});
