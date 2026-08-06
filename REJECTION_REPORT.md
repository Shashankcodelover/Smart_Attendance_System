# ❌ REJECTION REPORT — Smart Attendance System

> **Reviewer**: Industry Staff Security & System Architect Reviewer (The Rejector)  
> **Date**: 2026-08-06  
> **Project Path**: `d:\users\Shashank J\Desktop\my stufs\-smart-attendance`  
> **Branch**: `daily-improvements`

---

## 🛑 VERDICT: REJECTED

While the core dynamic QR code rotation algorithm and React/Vite client interface are well structured, **the backend infrastructure fails production security and reliability standards**. Local JSON file storage without concurrency locks, hardcoded fallback secrets, missing auth guards on API endpoints, and a lack of offline ServiceWorker sync queue handlers disqualify this project from a passing verdict.

---

## 📊 HARSH SCORECARD

| Category | Score (0–10) | Justification |
| :--- | :---: | :--- |
| **Functionality** | **5 / 10** | QR scanning works, but concurrent attendance submissions cause JSON file write collisions. |
| **Code Quality** | **6 / 10** | TypeScript code in `server.ts` and `db.ts` is clean, but lacks database abstractions. |
| **Security** | **3 / 10** | **FAIL**: Hardcoded fallback `JWT_SECRET = 'secret'` in `server.ts:L45`, and API routes lack auth protection. |
| **Testing** | **5 / 10** | Unit test suite created for QR rotation math, but zero integration tests exist for Express endpoints. |
| **UX** | **5 / 10** | Student UI is simple, but lacks offline fallback error state when network disconnects. |
| **Documentation** | **5 / 10** | Basic README present, but lacks deployment guides and architecture flow charts. |
| **Competitiveness** | **5 / 10** | QR rotation is effective, but lacks biometric or geofencing anti-proxy verification. |
| **Robustness** | **4 / 10** | `attendance.json` file writes lack file lock mutexes, making high-concurrency scans vulnerable to data corruption. |
| **OVERALL** | **4.8 / 10** | **REJECTED — Requires DB migration, auth guards, and concurrent lock safety.** |

---

## 🚨 EVIDENCED REJECTION POINTS

### 1. Insecure Fallback JWT Secret [CRITICAL]
- **Location**: [`server.ts:L45`](file:///d:/users/Shashank%20J/Desktop/my%20stufs/-smart-attendance/server.ts#L45)
- **Evidence**: `const JWT_SECRET = process.env.JWT_SECRET || 'secret';`
- **Why It Fails**: Known fallback key `'secret'` allows anyone to forge lecturer tokens and mark arbitrary attendance sessions as present.

### 2. File-Based Persistence Concurrency Hazard [MAJOR]
- **Location**: [`db.ts:L12-L25`](file:///d:/users/Shashank%20J/Desktop/my%20stufs/-smart-attendance/db.ts#L12-L25)
- **Evidence**: Synchronous `fs.writeFileSync('attendance.json', ...)` calls without mutex locks.
- **Why It Fails**: When 60+ students scan the QR code simultaneously at the start of a lecture, concurrent file operations overwrite each other, causing lost attendance records.

### 3. Missing Auth Protection on Session Creation API [MAJOR]
- **Location**: [`server.ts:L120-L150`](file:///d:/users/Shashank%20J/Desktop/my%20stufs/-smart-attendance/server.ts#L120-L150)
- **Evidence**: `app.post('/api/session', ...)` does not enforce bearer JWT token verification.
- **Why It Fails**: Anyone who discovers the endpoint can trigger fake attendance sessions for any class.

### 4. Absence of ServiceWorker Offline Queue [MINOR]
- **Location**: [`student.html`](file:///d:/users/Shashank%20J/Desktop/my%20stufs/-smart-attendance/student.html)
- **Evidence**: No ServiceWorker or IndexedDB queue registered for offline scanning.
- **Why It Fails**: If campus Wi-Fi drops, student scans fail with unhandled fetch errors instead of caching the scan payload for auto-sync.

---

## 🔄 CARRIED-FORWARD STATUS
*No prior REJECTION_REPORT.md existed.*
