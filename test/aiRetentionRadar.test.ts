import test from 'node:test';
import assert from 'node:assert/strict';
import { aiRetentionRadar, AttendanceState } from '../src/services/aiRetentionRadar.ts';

test('AIRetentionRadar forecasts detention risk and computes empirical Markov transition matrix', () => {
    // Student with frequent absences: P -> A -> A -> P -> A -> A
    const history: AttendanceState[] = ['PRESENT', 'ABSENT', 'ABSENT', 'PRESENT', 'ABSENT', 'ABSENT', 'ABSENT'];

    const forecast = aiRetentionRadar.forecastStudentRetention(
        '4JC21CS001',
        'Preetham J',
        history,
        30, // 18 attended = 60%
        18,
        20  // 20 remaining classes
    );

    assert.equal(forecast.studentUsn, '4JC21CS001');
    assert.equal(forecast.currentPercentage, 60.0);
    assert.equal(typeof forecast.projectedSemesterPercentage, 'number');
    assert.equal(forecast.isDetentionRisk, true);
    assert.ok(forecast.recommendedIntervention.includes('Automated Mentor Alert'));
});

test('AIRetentionRadar recognizes stable high-attendance students', () => {
    const history: AttendanceState[] = ['PRESENT', 'PRESENT', 'PRESENT', 'EXEMPTED', 'PRESENT', 'PRESENT'];

    const forecast = aiRetentionRadar.forecastStudentRetention(
        '4JC21CS002',
        'Aditya Roy',
        history,
        30,
        28, // 93.3%
        20
    );

    assert.equal(forecast.isDetentionRisk, false);
    assert.equal(forecast.riskLevel, 'LOW_RETENTION_RISK');
    assert.ok(forecast.projectedSemesterPercentage > 85.0);
});
