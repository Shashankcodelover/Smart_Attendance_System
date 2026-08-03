# 📱 Smart Offline-First Attendance System

A resilient, privacy-first, web-based attendance gateway built to solve classroom roll-call overhead and internet dropout failures. By utilizing dynamic QR codes, browser local queue storage, device fingerprinting, and automatic background reconciliation, it preserves instructional time and prevents proxy attendance fraud.

---

## 🚀 Architecture & Tech Stack

* **Frontend Framework:** React 19 (`react`, `react-dom`) with TypeScript ~5.8
* **Styling & Design:** Tailwind CSS v4 (`@tailwindcss/vite`) with custom acrylic glassmorphism UI & Google Fonts (Outfit / Inter)
* **Build System:** Vite 6 with multi-page entry points (`index.html`, `lecturer.html`, `student.html`)
* **Backend Server:** Node.js Express 4 (`server.ts`) bundled with `esbuild`
* **Database Engine:** JSON file database engine (`db.ts` / `attendance.json`) with automated Excel CSV export generation (`exports/`)
* **Performance Optimization:** In-Memory Active Session Caching Map for sub-millisecond check-in verification
* **Security Guardrails:** Device fingerprint proxy detection, HMAC-SHA256 signed rotating QR tokens, and parameterized secret defaults
* **AI Capabilities:** Gemini 2.4 AI assistant endpoint (`/api/ai/chat`) for conversational queries, timetable parsing, and automated section scheduling
* **Test Suite:** Native Node.js test runner suite (`tests/server.test.ts`) executed via `npm test`

---

## 📦 Project Structure

```text
smart-attendance/
├── index.html                  # Landing & auth portal entry
├── lecturer.html               # Lecturer management portal entry
├── student.html                # Student check-in portal entry
├── server.ts                   # Express backend server with active session cache & AI chat delegation
├── db.ts                       # JSON storage engine & Excel CSV export generator
├── attendance.json             # DB JSON data file
├── controllers/
│   └── aiController.ts         # Gemini AI chat assistant & offline regex fallback controller
├── vite.config.ts              # Vite 6 multi-page build configuration
├── package.json                # Dependencies & scripts
├── src/
│   ├── main.tsx                # Landing App entry
│   ├── lecturer-entry.tsx      # Lecturer App entry
│   ├── student-entry.tsx       # Student App entry
│   ├── components/             # React views (Dashboard, QR Scanner, TourGuide, etc.)
│   └── services/               # Firebase & rotation helper services
└── tests/
    └── server.test.ts          # Unit test suite for DB operations & API logic
```

---

## 🚦 Quick Start Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Type Check & Linting
```bash
npm run lint
```

### 3. Run Unit Tests
```bash
npm test
```

### 4. Development Server
Start the local server with hot reloading:
```bash
npm run dev
```
Open your browser at `http://localhost:3000`:
- **Landing Page:** `/`
- **Lecturer Portal:** `/lecturer`
- **Student Portal:** `/student`

### 5. Production Build
Build client bundles and backend server artifact:
```bash
npm run build
npm start
```
