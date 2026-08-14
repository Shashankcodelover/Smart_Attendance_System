import test from 'node:test';
import assert from 'node:assert/strict';
import { bunkCalculator } from '../src/services/bunkCalculator.ts';

test('BunkCalculator computes safe bunk buffer correctly for high attendance', () => {
    // 36 attended out of 40 lectures = 90%
    // At 75% threshold, student can safely bunk 8 lectures:
    // (36) / (40 + 8) = 36 / 48 = 75%
    const report = bunkCalculator.calculateSubjectTrajectory({
        subjectCode: '21CS51',
        subjectName: 'Management',
        totalLecturesHeld: 40,
        lecturesAttended: 36,
        targetThresholdPercentage: 75,
    });

    assert.equal(report.currentPercentage, 90.0);
    assert.equal(report.isCurrentlyEligible, true);
    assert.equal(report.safeBunksAvailable, 8);
    assert.equal(report.consecutiveRecoveryLecturesNeeded, 0);
    assert.equal(report.riskCategory, 'SAFE_ELIGIBLE');
});

test('BunkCalculator calculates exact consecutive recovery lectures for attendance deficit', () => {
    // 18 attended out of 30 lectures = 60% (Shortage)
    // To reach 75%: (18 + y)/(30 + y) = 0.75 => 18 + y = 22.5 + 0.75y => 0.25y = 4.5 => y = 18 lectures
    const report = bunkCalculator.calculateSubjectTrajectory({
        subjectCode: '21CS52',
        subjectName: 'Networks',
        totalLecturesHeld: 30,
        lecturesAttended: 18,
        targetThresholdPercentage: 75,
    });

    assert.equal(report.currentPercentage, 60.0);
    assert.equal(report.isCurrentlyEligible, false);
    assert.equal(report.safeBunksAvailable, 0);
    assert.equal(report.consecutiveRecoveryLecturesNeeded, 18);
    assert.equal(report.riskCategory, 'CRITICAL_CONDONATION');
});

test('BunkCalculator evaluates full semester courses and flags detained subjects', () => {
    const semester = [
        { subjectCode: 'CS1', subjectName: 'Sub 1', totalLecturesHeld: 40, lecturesAttended: 35 }, // 87.5% -> Pass
        { subjectCode: 'CS2', subjectName: 'Sub 2', totalLecturesHeld: 40, lecturesAttended: 28 }, // 70.0% -> Fail
    ];

    const result = bunkCalculator.evaluateFullSemester(semester, 75);
    assert.equal(result.totalSubjects, 2);
    assert.equal(result.eligibleSubjectsCount, 1);
    assert.equal(result.shortageSubjectsCount, 1);
    assert.equal(result.isAllClearForHallTicket, false);
    assert.deepEqual(result.detainedSubjectCodes, ['CS2']);
});
