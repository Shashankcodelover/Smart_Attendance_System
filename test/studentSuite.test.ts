import test from 'node:test';
import assert from 'node:assert/strict';
import { studentSuite } from '../src/services/studentSuite.ts';

test('StudentSuite: 01. calculateRecoveryTrajectory predicts safe bunks and recovery count', () => {
    const res = studentSuite.calculateRecoveryTrajectory(40, 36, 75);
    assert.equal(res.currentPercentage, 90.0);
    assert.equal(res.safeBunksAvailable, 8);
    assert.equal(res.isEligible, true);
});

test('StudentSuite: 02. generateHallTicketPassport issues verified passport when all courses cleared', () => {
    const courses = [
        { subjectCode: 'CS1', subjectName: 'OS', totalHeld: 40, attended: 35 },
        { subjectCode: 'CS2', subjectName: 'DBMS', totalHeld: 40, attended: 32 },
    ];
    const passport = studentSuite.generateHallTicketPassport('4JC21CS001', 'Preetham', courses);
    assert.equal(passport.isEligibleForAllExams, true);
    assert.equal(passport.passportStatus, 'HALL_TICKET_ISSUED_VERIFIED');
    assert.ok(passport.digitalClearanceBadgeQR.includes('HT-PASS'));
});

test('StudentSuite: 03. issuePeerVoucher creates peer voucher for review', () => {
    const v = studentSuite.issuePeerVoucher('4JC21CS001', '4JC21CS002', 'sess_1', 'Phone battery died');
    assert.equal(v.claimantUsn, '4JC21CS001');
    assert.equal(v.status, 'PENDING_FACULTY_REVIEW');
});

test('StudentSuite: 04. validateBleBeaconProof checks proximity accurately', () => {
    const near = studentSuite.validateBleBeaconProof('beacon_1', -68, 'Hall-101');
    assert.equal(near.isProximityVerified, true);
    assert.equal(near.signalStrength, 'MODERATE');

    const far = studentSuite.validateBleBeaconProof('beacon_1', -95, 'Hall-101');
    assert.equal(far.isProximityVerified, false);
});

test('StudentSuite: 05. getUpcomingLecturesTimeline filters timeline', () => {
    const sched = [
        { subject: 'Math', room: '101', startTime: '09:00', endTime: '10:00' },
        { subject: 'Physics', room: '102', startTime: '10:00', endTime: '11:00' },
    ];
    const res = studentSuite.getUpcomingLecturesTimeline(sched, '09:30');
    assert.equal(res.upcomingClasses.length, 2);
    assert.equal(res.upcomingClasses[0].isOngoing, true);
});

test('StudentSuite: 06-10. OD claims, heatmaps, absence forecaster, goals, and device swap', () => {
    const od = studentSuite.submitODExemption('4JC21CS001', 'CS1', '2026-08-14', 'Hackathon', 'https://proof.pdf');
    assert.equal(od.status, 'SUBMITTED_TO_HOD');

    const heat = studentSuite.generateAttendanceHeatmap([
        { date: '2026-08-01', status: 'PRESENT' },
        { date: '2026-08-02', status: 'ABSENT' },
    ]);
    assert.equal(heat.densityPercentage, 50.0);

    const forecast = studentSuite.forecastAbsenceImpact(40, 31, 2);
    assert.equal(forecast.willDropBelow75, true);

    const goal = studentSuite.setPersonalTargetGoal(40, 32, 85);
    assert.equal(goal.isGoalAchieved, false);
    assert.equal(goal.additionalClassesNeededForGoal, 14);

    const swap = studentSuite.requestDeviceRebind('4JC21CS001', 'old_phone', 'new_iphone', 'Upgraded phone');
    assert.equal(swap.status, 'PENDING_ADMIN_SECURITY_APPROVAL');
});

test('StudentSuite: 11-15. Electives, grievances, grace periods, GPA multiplier, and certificates', () => {
    const electives = studentSuite.aggregateElectiveAttendance(
        [{ subjectCode: 'CORE', subjectName: 'Core', totalHeld: 20, attended: 18 }],
        [{ subjectCode: 'ELEC', subjectName: 'Elective', totalHeld: 20, attended: 16 }]
    );
    assert.equal(electives.overallAggregatePercentage, 85.0);
    assert.equal(electives.isAllClear, true);

    const grv = studentSuite.submitAttendanceGrievance('4JC21CS001', 'CS1', '2026-08-10', 'Was present in lab');
    assert.equal(grv.status, 'OPEN_UNDER_FACULTY_INVESTIGATION');

    const grace = studentSuite.calculateGracePeriodAllowance('09:00', '09:07', 10);
    assert.equal(grace.isAcceptedWithinGrace, true);
    assert.equal(grace.penaltyStatus, 'FULL_ATTENDANCE_CREDIT');

    const gpa = studentSuite.calculatePresenceGPACorrelation(92, 8.5);
    assert.equal(gpa.projectedGPAWithAttendanceLeverage, 8.9);

    const cert = studentSuite.exportAttendanceCertificate('4JC21CS001', 'Preetham', 5, 88.5);
    assert.equal(cert.isEligibleForPromotions, true);
    assert.ok(cert.certificateId.startsWith('CERT-VTU-'));
});
