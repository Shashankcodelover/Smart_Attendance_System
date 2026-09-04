# 🎓 SJCE Smart Attendance System — Visual Showcase & Architecture

[![Automated Tests](https://img.shields.io/badge/Tests-49%2F49%20Passing-brightgreen?style=for-the-badge&logo=vitest)](test/)
[![Security](https://img.shields.io/badge/Security-Zero--Trust%20HMAC-blueviolet?style=for-the-badge&logo=shield)](server.ts)
[![UI/UX](https://img.shields.io/badge/UI%2FUX-Tailwind%20v4%20%2B%20Lucide-indigo?style=for-the-badge&logo=tailwindcss)](src/)
[![AI Analytics](https://img.shields.io/badge/AI-Google%20Gemini-orange?style=for-the-badge&logo=googlegemini)](controllers/aiController.ts)

A high-performance, cryptographic, zero-trust attendance verification and student retention intelligence platform engineered for higher-education universities.

---

## 📸 Canonical UI Showcase

### 1. Landing Gateway Hub (`/`)
Central portal router with instantaneous role demos for Students, Faculty Staff, and Administrators.
![Landing Gateway](screenshots/smart_attendance_landing.png)

### 2. Faculty / Lecturer Terminal (`/lecturer`)
Comprehensive command deck for professors to monitor real-time class check-ins, manage multi-semester timetables, and evaluate attendance deficits.
![Lecturer Console](screenshots/smart_attendance_lecturer_dashboard.png)

### 3. Lecturer Guided Onboarding
Contextual tour guiding faculty through TOTP generation, timetable imports, and student shortage warnings.
![Lecturer Tour](screenshots/smart_attendance_lecturer_tour.png)

### 4. Student Portal (`/student`)
Clean mobile-optimized terminal for students showing real-time course breakdowns, attendance gauges, and active class check-in buttons.
![Student Dashboard](screenshots/smart_attendance_student_dashboard.png)

### 5. Anti-Proxy Mobile Scan Interface
Hardware-attested QR and TOTP verification locking out proxies, GPS mockers, and device spoofing.
![Student Portal View](screenshots/smart_attendance_student.png)

---

## 🏛️ System Architecture

- **Frontend**: React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + Material Symbols & Lucide.
- **Backend**: Node.js + Express + SQLite WAL Mode (local zero-config) / Neon Postgres (production).
- **Security Engine**:
  - Rotating 5s TOTP HMAC nonces.
  - Kalman-filtered GPS geofencing (150m classroom boundary).
  - WebAuthn passkeys & university NFC card cryptotags.
  - Multi-hop offline mesh syncing for zero-connectivity classrooms.
- **AI Intelligence**:
  - Google Gemini 1.5 Pro for timetable schedule parsing and student dropout risk modeling.
  - Markov transition retention radar for predictive academic intervention.

---

## 🧪 Automated Verification

Run the entire 49-suite regression test in ~2.0 seconds:
```bash
npm test
```
All 49 unit, integration, and security tests pass with 0 warnings.
