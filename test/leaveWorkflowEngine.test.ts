import test from 'node:test';
import assert from 'node:assert/strict';
import { leaveWorkflowEngine } from '../src/services/leaveWorkflowEngine.ts';

test('LeaveWorkflowEngine manages leave claims and updates condoned attendance', () => {
    const claim = leaveWorkflowEngine.submitLeaveRequest({
        studentUsn: '4JC21CS001',
        studentName: 'Preetham J',
        subjectCode: '21CS51',
        date: '2026-08-14',
        reasonCategory: 'ON_DUTY_SPORTS',
        documentProofUrl: 'https://college.edu/proofs/sports_od.pdf',
    });

    assert.equal(claim.status, 'PENDING');
    assert.equal(claim.studentUsn, '4JC21CS001');

    // Lecturer approves OD leave
    const reviewed = leaveWorkflowEngine.reviewLeaveRequest(claim.id, 'APPROVED', 'Represented college in Inter-University Chess');
    assert.equal(reviewed?.status, 'APPROVED');

    // 28 / 40 attended = 70% (Shortage) -> +3 approved OD classes = 31 / 40 = 77.5% (Cleared!)
    const recalculation = leaveWorkflowEngine.computeCondonedAttendance(40, 28, 3);
    assert.equal(recalculation.rawPercentage, 70.0);
    assert.equal(recalculation.condonedPercentage, 77.5);
    assert.equal(recalculation.isClearedWithCondonation, true);
    assert.equal(recalculation.gainPercentage, 7.5);
});
