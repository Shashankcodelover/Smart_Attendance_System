/**
 * Medical & Condonation Workflow Engine — Smart Attendance IR-11 / Enterprise
 * 
 * 1. Leave / On-Duty Exemption Claim Ingestion: Medical sickness, sports OD, NSS/NCC camps.
 * 2. Multi-Tier Review Workflow: Lecturer Approval -> Department Head Condonation Approval.
 * 3. Attendance Credit Recalculation: Adjusts attended lecture count or exempts baseline totals.
 */

export interface LeaveRequest {
    id: string;
    studentUsn: string;
    studentName: string;
    subjectCode: string;
    date: string;
    reasonCategory: 'MEDICAL_ILLNESS' | 'ON_DUTY_SPORTS' | 'ACADEMIC_CONFERENCE' | 'FAMILY_EMERGENCY';
    documentProofUrl?: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reviewerComment?: string;
    createdAt: string;
}

export class LeaveWorkflowEngine {
    private requests: Map<string, LeaveRequest> = new Map();

    /**
     * Submits a new leave or on-duty exemption request.
     */
    submitLeaveRequest(params: Omit<LeaveRequest, 'id' | 'status' | 'createdAt'>): LeaveRequest {
        const id = `leave_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const request: LeaveRequest = {
            ...params,
            id,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
        };

        this.requests.set(id, request);
        return request;
    }

    /**
     * Approves or rejects a pending leave request.
     */
    reviewLeaveRequest(id: string, decision: 'APPROVED' | 'REJECTED', reviewerComment: string = ''): LeaveRequest | null {
        const req = this.requests.get(id);
        if (!req) return null;

        req.status = decision;
        req.reviewerComment = reviewerComment;
        return req;
    }

    /**
     * Recalculates subject attendance with approved medical condonation credits.
     */
    computeCondonedAttendance(
        totalLecturesHeld: number,
        rawAttended: number,
        approvedLeaveLectures: number
    ) {
        const effectiveAttended = Math.min(totalLecturesHeld, rawAttended + approvedLeaveLectures);
        const rawPct = totalLecturesHeld > 0 ? (rawAttended / totalLecturesHeld) * 100 : 100;
        const condonedPct = totalLecturesHeld > 0 ? (effectiveAttended / totalLecturesHeld) * 100 : 100;

        return {
            rawAttended,
            approvedLeaveLectures,
            effectiveAttended,
            totalLecturesHeld,
            rawPercentage: parseFloat(rawPct.toFixed(1)),
            condonedPercentage: parseFloat(condonedPct.toFixed(1)),
            isClearedWithCondonation: condonedPct >= 75.0,
            gainPercentage: parseFloat((condonedPct - rawPct).toFixed(1)),
        };
    }

    getRequestsForStudent(usn: string): LeaveRequest[] {
        return Array.from(this.requests.values()).filter(r => r.studentUsn === usn);
    }
}

export const leaveWorkflowEngine = new LeaveWorkflowEngine();
