# 📋 Smart Offline-First Attendance System — Setup & Standard File Inventory Guide

Welcome to the **Smart Offline-First Attendance & Verification System** repository! This document provides a complete setup walkthrough, environment variable reference, and a comprehensive inventory of all core files and their specific roles.

---

## 📋 Quick Setup Walkthrough

### Method 1: Using Docker (Recommended — Instant Setup)

The easiest way to run the Smart Attendance system is using Docker Compose:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Shashankcodelover/-smart-attendance.git
   cd -smart-attendance
   ```

2. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```

3. **Build & Start Containers**:
   ```bash
   docker-compose up -d --build
   ```

4. **Access the Application**:
   - 🌐 **Home Portal**: `http://localhost:3000`
   - 🎓 **Student Check-In Page**: `http://localhost:3000/student`
   - 👨‍🏫 **Lecturer Dashboard**: `http://localhost:3000/lecturer`

---

### Method 2: Manual Local Development Setup

If you prefer running Node.js directly on your local machine:

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server (Vite + Express)**:
   ```bash
   npm run dev
   ```

3. **Run Unit & DB Integration Tests**:
   ```bash
   npm test
   ```

4. **Build Production Bundle**:
   ```bash
   npm run build
   ```

---

## 🔑 Environment Variables Configuration (`.env`)

Copy `.env.example` to `.env` before running the system. Here is a breakdown of every variable and its role:

| Variable Name | Default Value | Purpose & Role |
| :--- | :--- | :--- |
| `PORT` | `3000` | Specifies the port number the Express + Vite server listens on. |
| `NODE_ENV` | `development` | Defines execution mode (`development` or `production`). |
| `GEMINI_API_KEY` | `"MY_GEMINI_API_KEY"` | Google Gemini AI key for parsing PDF timetables & AI attendance copilot. |
| `APP_URL` | `"http://localhost:3000"` | Base URL of the application for QR code generation and verification links. |

---

## 📁 Standard Repository File Inventory & Roles

This repository maintains a clean, modular structure. Below is the list of key project files and the specific role each file plays:

| File / Directory | Role & Purpose in Architecture |
| :--- | :--- |
| **`docker-compose.yml`** | Docker Compose configuration building and orchestrating the Smart Attendance container. |
| **`Dockerfile`** | Multi-stage Docker build recipe compiling React Vite UI & Express server into Node 20 runtime. |
| **`server.ts`** | Application entry point configuring Express API endpoints, static assets, and timetable scheduler. |
| **`db.ts`** | Better-SQLite3 database initialization script creating `students`, `sessions`, `timetables`, and `audits` tables. |
| **`controllers/sessionController.ts`** | Controller handling session creation, activation, rotation tokens, reopening, and deletion. |
| **`controllers/attendanceController.ts`** | Controller handling HMAC QR check-ins, offline batch sync, and manual overrides. |
| **`controllers/aiController.ts`** | AI controller integrating Google Gemini 2.5 Flash for timetable parsing and AI chat. |
| **`src/`** | Contains React 19 UI components (Student Check-In, Lecturer Management, QR Scanner). |
| **`index.html`** | Landing page HTML template. |
| **`student.html`** | Student portal HTML entry point. |
| **`lecturer.html`** | Lecturer portal HTML entry point. |
| **`tests/server.test.ts`** | Unit & DB integration test suite asserting student upserts, session rotation, and anti-proxy security. |
| **`CEO_EVALUATION_CHECKLIST.md`** | Comprehensive evaluation checklist tracking code quality, security, and feature readiness. |
| **`JIRA_TRACKER.md`** | Sprint task tracker documenting completed modules, bug fixes, and feature roadmap. |
| **`EXPLAINER.md`** | High-level system architecture document detailing HMAC signature validation and SQLite caching. |
| **`CHANGELOG_DAILY.md`** | Daily development log recording technical findings, refactoring progress, and build verification. |
| **`README.md`** | Primary project overview, feature highlights, tech stack reference, and quick-start links. |
| **`SETUP.md`** | Complete setup guide, `.env.example` environment variable reference, and file inventory breakdown. |
