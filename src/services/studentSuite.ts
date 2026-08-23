/**
 * Student-Side Power Suite (15 Advanced Capabilities) — Smart Attendance IR-12 Enterprise
 * 
 * 01. Attendance Recovery Trajectory Predictor & Bunk Planner
 * 02. Dynamic Hall-Ticket Exam Eligibility Passport
 * 03. Peer Attendance Attestation / Voucher System
 * 04. Offline BLE Local Proximity Beacon Receiver
 * 05. Class Schedule Timetable Widget & Countdown
 * 06. Automated On-Duty (OD) / Sports Exemption Claim Submitter
 * 07. Subject-Wise Attendance Deficit Heatmap Generator
 * 08. Emergency Absence Early-Warning Forecaster
 * 09. Personal Academic Attendance Goal Tracker
 * 10. Device Hardware Fingerprint Re-binding Request
 * 11. Elective Course Attendance Aggregator
 * 12. Attendance Dispute & Miscount Grievance Ticket Submitter
 * 13. Late-Arrival Grace Period Calculator
 * 14. Cumulative Semester Presence GPA Multiplier
 * 15. End-of-Semester Attendance Certificate Exporter
 */

import crypto from 'crypto';

export interface StudentCourseStat {
    subjectCode: string;
    subjectName: string;
    totalHeld: number;
    attended: number;
    targetThreshold?: number; // default 75
}

export class StudentSuite {
    private grievances: Map<string, any> = new Map();
    private deviceSwapRequests: Map<string, any> = new Map();
    private peerVouchers: Map<string, any> = new Map();

    /**
     * 01. Attendance Recovery Trajectory Predictor & Bunk Planner
     */
    calculateRecoveryTrajectory(totalHeld: number, attended: number, targetPct: number = 75) {
        const target = targetPct / 100.0;
        const currentPct = totalHeld > 0 ? parseFloat(((attended / totalHeld) * 100).toFixed(1)) : 100;
        const isEligible = currentPct >= targetPct;

        let safeBunks = 0;
        let recoveryNeeded = 0;

        if (isEligible) {
            safeBunks = Math.max(0, Math.floor((attended - (target * totalHeld)) / target));
        } else {
            recoveryNeeded = Math.max(0, Math.ceil(((target * totalHeld) - attended) / (1.0 - target)));
        }

        return {
            currentPercentage: currentPct,
            targetPercentage: targetPct,
            isEligible,
            safeBunksAvailable: safeBunks,
            consecutiveRecoveryLecturesNeeded: recoveryNeeded,
            summaryMessage: isEligible
                ? `Safe buffer: You can skip up to ${safeBunks} lecture(s) without dropping below ${targetPct}%.`
                : `Shortage alert: You must attend the next ${recoveryNeeded} lecture(s) consecutively.`,
        };
    }

    /**
     * 02. Dynamic Hall-Ticket Exam Eligibility Passport
     */
    generateHallTicketPassport(usn: string, studentName: string, courses: StudentCourseStat[]) {
        const evaluated = courses.map(c => {
            const pct = c.totalHeld > 0 ? (c.attended / c.totalHeld) * 100 : 100;
            return {
                ...c,
                percentage: parseFloat(pct.toFixed(1)),
                isCleared: pct >= (c.targetThreshold || 75),
            };
        });

        const detained = evaluated.filter(e => !e.isCleared);
        const isAllClear = detained.length === 0;
        const clearanceToken = crypto.createHmac('sha256', 'hall_ticket_key')
            .update(`${usn}:${isAllClear}:${Date.now()}`)
            .digest('hex').substring(0, 16);

        return {
            usn,
            studentName,
            isEligibleForAllExams: isAllClear,
            totalSubjects: courses.length,
            clearedSubjectsCount: courses.length - detained.length,
            detainedCount: detained.length,
            detainedSubjects: detained.map(d => d.subjectCode),
            passportStatus: isAllClear ? 'HALL_TICKET_ISSUED_VERIFIED' : 'PROVISIONAL_HOLD_ATTENDANCE_SHORTAGE',
            digitalClearanceBadgeQR: `HT-PASS:${usn}:${clearanceToken}`,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * 03. Peer Attendance Attestation / Voucher
     */
    issuePeerVoucher(claimantUsn: string, peerWitnessUsn: string, sessionId: string, reason: string) {
        const voucherId = `vouch_${crypto.randomBytes(4).toString('hex')}`;
        const voucher = {
            voucherId,
            claimantUsn,
            peerWitnessUsn,
            sessionId,
            reason,
            status: 'PENDING_FACULTY_REVIEW',
            timestamp: new Date().toISOString(),
        };
        this.peerVouchers.set(voucherId, voucher);
        return voucher;
    }

    /**
     * 04. Offline BLE Proximity Beacon Validator
     */
    validateBleBeaconProof(beaconUuid: string, rssi: number, expectedRoom: string) {
        // RSSI >= -75 dBm is typical inside a 10m classroom
        const isWithinRange = rssi >= -80;
        return {
            beaconUuid,
            expectedRoom,
            rssi,
            isProximityVerified: isWithinRange,
            signalStrength: rssi >= -65 ? 'STRONG' : (rssi >= -80 ? 'MODERATE' : 'OUT_OF_RANGE'),
        };
    }

    /**
     * 05. Class Schedule Timetable Widget & Countdown
     */
    getUpcomingLecturesTimeline(schedule: Array<{ subject: string; room: string; startTime: string; endTime: string }>, currentHourMin: string) {
        const toMins = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        const nowMins = toMins(currentHourMin);
        const upcoming = schedule
            .filter(s => toMins(s.endTime) > nowMins)
            .map(s => {
                const startMins = toMins(s.startTime);
                const isOngoing = nowMins >= startMins && nowMins <= toMins(s.endTime);
                const minutesUntilStart = Math.max(0, startMins - nowMins);
                return {
                    ...s,
                    isOngoing,
                    minutesUntilStart,
                    statusText: isOngoing ? 'IN PROGRESS (CHECK-IN ACTIVE)' : `Starts in ${minutesUntilStart} mins`,
                };
            });

        return { currentHourMin, upcomingClasses: upcoming };
    }

    /**
     * 06. Automated On-Duty (OD) / Sports Exemption Claim Submitter
     */
    submitODExemption(usn: string, subjectCode: string, date: string, activityName: string, proofUrl: string) {
        return {
            claimId: `od_${Date.now()}`,
            usn,
            subjectCode,
            date,
            activityName,
            proofUrl,
            status: 'SUBMITTED_TO_HOD',
            expectedCredit: '+1 Class Condonation',
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * 07. Subject-Wise Attendance Deficit Heatmap Generator
     */
    generateAttendanceHeatmap(attendanceHistory: Array<{ date: string; status: 'PRESENT' | 'ABSENT' | 'EXEMPTED' }>) {
        const heatmap = attendanceHistory.map(h => ({
            date: h.date,
            status: h.status,
            colorIntensity: h.status === 'PRESENT' ? '#10b981' : (h.status === 'EXEMPTED' ? '#8b5cf6' : '#f43f5e'),
            weight: h.status === 'PRESENT' ? 1.0 : (h.status === 'EXEMPTED' ? 0.8 : 0.0),
        }));

        const presentCount = attendanceHistory.filter(h => h.status === 'PRESENT' || h.status === 'EXEMPTED').length;
        const total = attendanceHistory.length;

        return {
            totalSessions: total,
            presentSessions: presentCount,
            densityPercentage: total > 0 ? parseFloat(((presentCount / total) * 100).toFixed(1)) : 100,
            heatmap,
        };
    }

    /**
     * 08. Emergency Absence Early-Warning Forecaster
     */
    forecastAbsenceImpact(currentTotalHeld: number, currentAttended: number, upcomingMissCount: number = 2) {
        const currentPct = (currentAttended / currentTotalHeld) * 100;
        const newTotal = currentTotalHeld + upcomingMissCount;
        const projectedPct = (currentAttended / newTotal) * 100;
        const dropPct = parseFloat((currentPct - projectedPct).toFixed(1));

        return {
            currentPercentage: parseFloat(currentPct.toFixed(1)),
            projectedPercentage: parseFloat(projectedPct.toFixed(1)),
            dropPercentage: dropPct,
            willDropBelow75: projectedPct < 75.0,
            warningAlert: projectedPct < 75.0
                ? `CRITICAL WARNING: Missing ${upcomingMissCount} classes will drop attendance to ${projectedPct.toFixed(1)}% (BELOW 75% MANDATE).`
                : `SAFE: Missing ${upcomingMissCount} classes reduces attendance to ${projectedPct.toFixed(1)}% (remains above 75%).`,
        };
    }

    /**
     * 09. Personal Academic Attendance Goal Tracker
     */
    setPersonalTargetGoal(currentTotal: number, currentAttended: number, customGoalPct: number = 85) {
        const currentPct = (currentAttended / currentTotal) * 100;
        const target = customGoalPct / 100.0;
        const classesNeeded = Math.max(0, Math.ceil((target * currentTotal - currentAttended) / (1.0 - target)));

        return {
            customGoalPercentage: customGoalPct,
            currentPercentage: parseFloat(currentPct.toFixed(1)),
            isGoalAchieved: currentPct >= customGoalPct,
            additionalClassesNeededForGoal: classesNeeded,
        };
    }

    /**
     * 10. Device Hardware Fingerprint Re-binding Request
     */
    requestDeviceRebind(usn: string, oldDeviceId: string, newDeviceId: string, reason: string) {
        const requestId = `swap_${Date.now()}`;
        const request = {
            requestId,
            usn,
            oldDeviceId,
            newDeviceId,
            reason,
            status: 'PENDING_ADMIN_SECURITY_APPROVAL',
            timestamp: new Date().toISOString(),
        };
        this.deviceSwapRequests.set(requestId, request);
        return request;
    }

    /**
     * 11. Elective Course Attendance Aggregator
     */
    aggregateElectiveAttendance(coreCourses: StudentCourseStat[], electiveCourses: StudentCourseStat[]) {
        const all = [...coreCourses, ...electiveCourses];
        const totalHeld = all.reduce((sum, c) => sum + c.totalHeld, 0);
        const totalAttended = all.reduce((sum, c) => sum + c.attended, 0);
        const aggregatePct = totalHeld > 0 ? parseFloat(((totalAttended / totalHeld) * 100).toFixed(1)) : 100;

        return {
            coreCoursesCount: coreCourses.length,
            electiveCoursesCount: electiveCourses.length,
            overallAggregatePercentage: aggregatePct,
            isAllClear: all.every(c => (c.totalHeld > 0 ? (c.attended / c.totalHeld) * 100 : 100) >= 75),
        };
    }

    /**
     * 12. Attendance Dispute & Miscount Grievance Ticket Submitter
     */
    submitAttendanceGrievance(usn: string, subjectCode: string, lectureDate: string, description: string) {
        const ticketId = `GRV_${Date.now().toString(36).toUpperCase()}`;
        const grievance = {
            ticketId,
            usn,
            subjectCode,
            lectureDate,
            description,
            status: 'OPEN_UNDER_FACULTY_INVESTIGATION',
            createdAt: new Date().toISOString(),
        };
        this.grievances.set(ticketId, grievance);
        return grievance;
    }

    /**
     * 13. Late-Arrival Grace Period Calculator
     */
    calculateGracePeriodAllowance(scheduledStartTime: string, checkinTime: string, maxGraceMins: number = 10) {
        const toMins = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        const delta = toMins(checkinTime) - toMins(scheduledStartTime);
        const isWithinGrace = delta <= maxGraceMins && delta >= -15;

        return {
            minutesLate: Math.max(0, delta),
            maxGraceMinutes: maxGraceMins,
            isAcceptedWithinGrace: isWithinGrace,
            penaltyStatus: isWithinGrace ? 'FULL_ATTENDANCE_CREDIT' : 'MARKED_LATE_HALF_CREDIT',
        };
    }

    /**
     * 14. Cumulative Semester Presence GPA Multiplier
     */
    calculatePresenceGPACorrelation(attendancePct: number, currentGPA: number) {
        // Statistical institutional regression model: Attendance >= 90% correlates with +0.4 GPA gain
        let expectedGain = 0;
        if (attendancePct >= 90) expectedGain = 0.4;
        else if (attendancePct >= 80) expectedGain = 0.2;
        else if (attendancePct < 70) expectedGain = -0.5;

        return {
            attendancePercentage: attendancePct,
            currentGPA,
            projectedGPAWithAttendanceLeverage: parseFloat(Math.min(10.0, Math.max(0.0, currentGPA + expectedGain)).toFixed(2)),
            presenceLeverageIndex: expectedGain > 0 ? `+${expectedGain} GPA Boost` : `${expectedGain} GPA Penalty`,
        };
    }

    /**
     * 15. End-of-Semester Attendance Certificate Exporter
     */
    exportAttendanceCertificate(usn: string, studentName: string, semester: number, overallPct: number) {
        const certId = `CERT-VTU-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const signature = crypto.createHmac('sha256', 'cert_secret').update(`${certId}:${usn}:${overallPct}`).digest('hex');

        return {
            certificateId: certId,
            usn,
            studentName,
            semester,
            finalAttendancePercentage: overallPct,
            isEligibleForPromotions: overallPct >= 75.0,
            issuer: 'University Academic Examination Board',
            digitalSignature: signature,
            issueDate: new Date().toISOString().split('T')[0],
        };
    }
}

export const studentSuite = new StudentSuite();
