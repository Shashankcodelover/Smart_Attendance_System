# EXPLAINER: Smart Offline-First Attendance System

## 1. System Architecture Overview

The **Smart Offline-First Attendance System** addresses classroom roll-call bottlenecks and spotty campus network connections.

### Core Workflow:
1. **Session Activation**: A lecturer starts a session from the Lecturer Portal. The server generates a unique OTP, verification shape, and HMAC-signed token, loading it into an in-memory active sessions cache.
2. **Dynamic QR & OTP Scan**: The lecturer displays the rotating QR / OTP code. Students open the web app on their phone (no store install required).
3. **Dual Verification Pipeline**:
   - **Online Check-in**: Verifies HMAC token, OTP code, shape match, roster membership, duplicate check, and device fingerprint proxy detection before saving.
   - **Offline Queue**: If network drops, attendance receipts are securely buffered in browser local storage and reconciled automatically via background sync when connectivity resumes (`/api/attendance/sync-offline`).
4. **Automated Export & Reporting**: Every DB transaction automatically synchronizes formatted CSV spreadsheets structured into `exports/<Degree>/<Dept>/Year <N>/Section_<X>_Attendance.csv`.

---

## 2. Real Tech Stack & Design Rationale

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend Framework** | **React 19 + TypeScript** | Component-driven UI architecture supporting real-time status updates, QR scanner overlay, and interactive tour guides. |
| **Styling System** | **Tailwind CSS v4 + Motion** | Delivers modern acrylic glassmorphism aesthetic with zero runtime CSS overhead and responsive mobile-first views. |
| **Build & Bundler** | **Vite 6 (Multi-Page Input)** | Provides high-speed dev server HMR and optimized production code splitting for `index.html`, `lecturer.html`, and `student.html`. |
| **Backend & Caching** | **Express 4 + In-Memory Map Cache** | Express handles REST endpoints, while an active session memory cache enables instant sub-millisecond attendance verification. |
| **Data Engine** | **JSON Storage + CSV Sync (`db.ts`)** | Zero-dependency disk persistence using JSON structure with automatic Excel/CSV export generation upon every update. |
| **QR & Scanning** | **jsQR Library** | Real-time browser-based video stream QR code decoding without sending raw video feeds off-device. |
| **AI Integration** | **@google/genai (Gemini 2.4)** | Enables AI chat assistant, timetable image/PDF parsing, and automated section scheduling. |

---

## 3. Implemented Security & Quality Features

1. **HMAC-SHA256 Signed QR Tokens**: Prevents QR token spoofing by validating server-signed token timestamps and nonces.
2. **Device Fingerprint Guard**: Flags multiple attendance submissions originating from the same device fingerprint to detect proxy attendance attempts.
3. **In-Memory Session Cache**: Dramatically improves verification lookup performance for high-concurrency check-in windows.
4. **CSV Export Pipeline**: Automatically updates degree, department, year, and section spreadsheets on disk whenever attendance changes.
5. **Automated Unit Testing**: Built-in `npm test` suite validating database queries, session updates, and student roster handling.
