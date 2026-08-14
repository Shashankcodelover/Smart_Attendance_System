/**
 * Student Attendance Deficit Radar & Mathematical Recovery Bunk Calculator — Smart Attendance IR-11 / Enterprise
 * 
 * Computes exact mathematical trajectories for university attendance:
 * 1. Safe Bunk Allowance: How many upcoming lectures a student can miss without dropping below 75% target.
 *    B_safe = floor( (Attended - Target * Total) / Target )
 * 2. Recovery Lectures Required: Minimum consecutive future lectures student must attend if below 75%.
 *    N_needed = ceil( (Target * Total - Attended) / (1 - Target) )
 * 3. Hall-Ticket Risk Level: 'SAFE_ELIGIBLE' (>=85%), 'ATTENTION_ZONE' (75-84%), 'DANGER_SHORTAGE' (<75%), 'CRITICAL_CONDONATION' (<65%).
 */

export interface AttendanceStats {
    subjectCode: string;
    subjectName: string;
    totalLecturesHeld: number;
    lecturesAttended: number;
    targetThresholdPercentage?: number; // Default 75
}

export interface BunkTrajectoryReport {
    subjectCode: string;
    subjectName: string;
    totalHeld: number;
    attended: number;
    currentPercentage: number;
    targetPercentage: number;
    isCurrentlyEligible: boolean;
    safeBunksAvailable: number;
    consecutiveRecoveryLecturesNeeded: number;
    riskCategory: 'SAFE_ELIGIBLE' | 'ATTENTION_ZONE' | 'DANGER_SHORTAGE' | 'CRITICAL_CONDONATION';
    adviceMessage: string;
}

export class BunkCalculator {
    /**
     * Calculates bunk trajectory and recovery metrics for a single subject.
     */
    calculateSubjectTrajectory(stats: AttendanceStats): BunkTrajectoryReport {
        const {
            subjectCode,
            subjectName,
            totalLecturesHeld,
            lecturesAttended,
            targetThresholdPercentage = 75,
        } = stats;

        const target = targetThresholdPercentage / 100.0;
        const total = Math.max(1, totalLecturesHeld);
        const attended = Math.min(total, Math.max(0, lecturesAttended));

        const currentPct = parseFloat(((attended / total) * 100).toFixed(1));
        const isEligible = currentPct >= targetThresholdPercentage;

        let safeBunks = 0;
        let recoveryNeeded = 0;

        if (isEligible) {
            // How many classes can be missed without dropping below target?
            // (attended) / (total + x) >= target => attended >= target * total + target * x => x <= (attended - target*total)/target
            safeBunks = Math.max(0, Math.floor((attended - (target * total)) / target));
        } else {
            // How many consecutive classes must be attended to reach target?
            // (attended + y) / (total + y) >= target => attended + y >= target * total + target * y => y(1 - target) >= target*total - attended
            recoveryNeeded = Math.max(0, Math.ceil(((target * total) - attended) / (1.0 - target)));
        }

        let riskCategory: BunkTrajectoryReport['riskCategory'] = 'SAFE_ELIGIBLE';
        let adviceMessage = '';

        if (currentPct >= 85) {
            riskCategory = 'SAFE_ELIGIBLE';
            adviceMessage = `You are well above the university 75% limit. You can safely miss up to ${safeBunks} lecture(s).`;
        } else if (currentPct >= 75) {
            riskCategory = 'ATTENTION_ZONE';
            adviceMessage = `You are on the margin (${currentPct}%). You can only miss ${safeBunks} lecture(s) before facing exam detention.`;
        } else if (currentPct >= 65) {
            riskCategory = 'DANGER_SHORTAGE';
            adviceMessage = `SHORTAGE WARNING: You need to attend the next ${recoveryNeeded} consecutive lecture(s) without absence to regain hall-ticket eligibility.`;
        } else {
            riskCategory = 'CRITICAL_CONDONATION';
            adviceMessage = `CRITICAL CONDONATION: Current attendance is ${currentPct}%. You require ${recoveryNeeded} consecutive classes + Principal medical condonation proof.`;
        }

        return {
            subjectCode,
            subjectName,
            totalHeld: total,
            attended,
            currentPercentage: currentPct,
            targetPercentage: targetThresholdPercentage,
            isCurrentlyEligible: isEligible,
            safeBunksAvailable: safeBunks,
            consecutiveRecoveryLecturesNeeded: recoveryNeeded,
            riskCategory,
            adviceMessage,
        };
    }

    /**
     * Evaluates full semester course load for a student.
     */
    evaluateFullSemester(subjects: AttendanceStats[], targetThresholdPercentage: number = 75) {
        const reports = subjects.map(s => this.calculateSubjectTrajectory({ ...s, targetThresholdPercentage }));
        const detainedSubjects = reports.filter(r => !r.isCurrentlyEligible);
        const overallAttended = subjects.reduce((sum, s) => sum + s.lecturesAttended, 0);
        const overallTotal = subjects.reduce((sum, s) => sum + s.totalLecturesHeld, 0);
        const aggregatePercentage = overallTotal > 0 ? parseFloat(((overallAttended / overallTotal) * 100).toFixed(1)) : 100;

        return {
            totalSubjects: subjects.length,
            eligibleSubjectsCount: subjects.length - detainedSubjects.length,
            shortageSubjectsCount: detainedSubjects.length,
            aggregatePercentage,
            isAllClearForHallTicket: detainedSubjects.length === 0,
            subjectReports: reports,
            detainedSubjectCodes: detainedSubjects.map(d => d.subjectCode),
        };
    }
}

export const bunkCalculator = new BunkCalculator();
