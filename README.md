# 🛡️ Smart Attendance Platform (Enterprise Zero-Trust Edition)

[![Automated Tests](https://img.shields.io/badge/Tests-49%2F49%20Passing-brightgreen?style=for-the-badge&logo=vitest)](test/)
[![Security](https://img.shields.io/badge/Security-Zero--Trust%20HMAC-blueviolet?style=for-the-badge&logo=shield)](server.ts)
[![UI/UX](https://img.shields.io/badge/UI%2FUX-Tailwind%20v4%20%2B%20Lucide-indigo?style=for-the-badge&logo=tailwindcss)](src/)
[![AI Analytics](https://img.shields.io/badge/AI-Google%20Gemini-orange?style=for-the-badge&logo=googlegemini)](controllers/aiController.ts)

> **Zero-Trust Biometric, Cryptographic & Geofenced Presence Verification System**  
> Built for universities and enterprise institutions to eliminate proxy attendance, enforce dynamic rotation QR tokens, and deliver predictive dropout analytics using Google Gemini.

---

## 📸 Interface Showcase

| Portal | Preview | Highlights |
| :--- | :--- | :--- |
| **Landing Hub (`/`)** | [View Screenshot](docs/showcase/screenshots/smart_attendance_landing.png) | 1-Click instant demo for Students, Faculty, and Admin |
| **Faculty Deck (`/lecturer`)** | [View Screenshot](docs/showcase/screenshots/smart_attendance_lecturer_dashboard.png) | Real-time headcount, TOTP gates, AI timetable scheduler |
| **Student Portal (`/student`)** | [View Screenshot](docs/showcase/screenshots/smart_attendance_student_dashboard.png) | 100% attendance dial, subject breakdown, bunk buffers |

👉 See [Visual Showcase Documentation](docs/showcase/README.md) for full screenshots and architectural breakdown.

---

## 🌟 Key Enterprise Features

### 1. Zero-Trust Subnet & Geofence Shield
- Direct socket IP resolution preventing HTTP header forgery (`X-Forwarded-For` bypasses).
- Dynamic 5-second TOTP rotating QR code signatures with cryptographically signed nonces.
- GPS Haversine distance verification (150m classroom radius).

### 2. Hardware-Bound Anti-Proxy Device Registry
- Enforces device-to-student registration quotas (1 physical hardware device per student).
- Detects and blocks device collision attacks (multiple students attempting check-in from one phone).

### 3. Sliding-Window PIN Brute-Force Defense
- Bounded token-bucket rate limiter stopping credential-stuffing and automated PIN brute-forcing scripts.

### 4. Seamless Password Auto-Upgrade
- Auto-migrates legacy plaintext passwords to salted `bcrypt` hashes on the fly during login without disrupting users.

### 5. Google Gemini AI Predictive Academic Analytics
- Computes mathematical student attendance distributions across departments and sections.
- Predicts exam disqualification risk for students approaching or breaching the mandatory 75% attendance cutoff.

### 6. Crash-Proof Cloud Container Deployment
- Safe runtime in-memory secret handling, eliminating `EACCES` crashes on immutable read-only filesystems (AWS ECS, Docker, Kubernetes).

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run automated test suite (49/49 passing)
npm test

# 3. Build production bundle
npm run build

# 4. Start production server
node dist/server.cjs
```

Visit the dashboard at `http://localhost:3000`.
