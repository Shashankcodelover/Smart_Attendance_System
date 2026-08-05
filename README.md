# 📱 Smart Offline-First Attendance System

A resilient, privacy-first, web-based attendance gateway built to solve classroom roll-call overhead and internet dropout failures. By utilizing dynamic QR codes, browser local queue storage, device fingerprinting, and automatic background reconciliation, it preserves instructional time and prevents proxy attendance fraud.

---

## 🚀 Architecture & Tech Stack

- **Frontend Framework:** React 19 (`react`, `react-dom`) with TypeScript ~5.8
- **Styling & Design:** Tailwind CSS v4 (`@tailwindcss/vite`) with custom acrylic glassmorphism UI & Google Fonts (Outfit / Inter)
- **Build System:** Vite 6 with multi-page entry points (`index.html`, `lecturer.html`, `student.html`)
- **Backend Server:** Node.js Express 4 (`server.ts`) bundled with `esbuild`
- **Database Engine:** SQLite database engine (`db.ts` / `Better-SQLite3`) with automated CSV export generation (`exports/`)
- **Containerization:** Production Dockerfile & Docker Compose configuration on Port `3000`
- **Security Guardrails:** Device fingerprint proxy detection, HMAC-SHA256 signed rotating QR tokens, and anti-fraud filters
- **AI Capabilities:** Gemini AI assistant (`/api/ai/chat`) for conversational queries, timetable PDF parsing, and automated section scheduling
- **Test Suite:** Native Node.js test runner suite (`tests/server.test.ts`) executed via `npm test`

---

## 📦 Project Structure

```text
smart-attendance/
├── index.html                  # Landing & auth portal entry
├── lecturer.html               # Lecturer management portal entry
├── student.html                # Student check-in portal entry
├── server.ts                   # Express backend server with active session cache
├── db.ts                       # Better-SQLite3 database initialization & storage
├── controllers/
│   ├── aiController.ts         # Gemini AI chat assistant & timetable parser
│   ├── sessionController.ts    # Session creation, rotation, and lifecycle manager
│   └── attendanceController.ts # HMAC QR check-in & offline reconciliation controller
├── Dockerfile                  # Multi-stage production Docker build recipe
├── docker-compose.yml          # Container compose service configuration
├── SETUP.md                    # Setup guide, .env reference & file inventory breakdown
├── README.md                   # Primary project summary & quick start guide
└── tests/
    └── server.test.ts          # Unit test suite for DB operations & API logic
```

---

## ⚡ Quick Start

### Method 1: Docker Compose (Recommended — Instant Setup)

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Build & launch containers
docker-compose up -d --build
```

- 🌐 **Home Portal**: `http://localhost:3000`
- 🎓 **Student Check-In**: `http://localhost:3000/student`
- 👨‍🏫 **Lecturer Dashboard**: `http://localhost:3000/lecturer`

### Method 2: Local Development & Automated Tests

```bash
# 1. Install dependencies
npm install

# 2. Run unit tests
npm test

# 3. Run dev server
npm run dev

# 4. Build production bundle
npm run build
```

---

## 📚 Complete Documentation & File Inventory

For a comprehensive guide on environment variables, setup instructions, and a file-by-file inventory of all roles in the project, please see:
📖 **[SETUP.md](SETUP.md)**

---

## 📜 License & Security Standards
Licensed under the **MIT License**. Built in compliance with **GDPR** and **FERPA** privacy guidelines.
