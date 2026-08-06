# 📱 Smart Offline-First Web-Based Attendance System

> **A highly resilient, privacy-first attendance tracking system built for environments with unreliable internet connectivity.** Developed for JSS Science and Technology University (SJCE).

---

## 🎯 The Basis of the Project (Problem & Solution)
**The Problem:** Traditional digital attendance systems (like biometric scanners or live-web portals) fail completely when the campus Wi-Fi drops or mobile networks are weak. They also often rely on invasive tracking like GPS.
**The Solution:** This project introduces an **Offline-First Architecture**. By using the QR code as a data carrier and shifting validation to the student's device using local client-side timestamps, students can mark their attendance with zero internet. The system securely caches the data in `localStorage` and automatically synchronizes it with the PostgreSQL database the moment connectivity is restored.

---

## ✨ Key Features & "The Unique Factor"
* 📡 **True Offline Mode:** The QR scanner and submission forms are permanently enabled. Network drops do not block the UI.
* ⏱️ **Time-Shift Synchronization:** Prevents proxy attendance. The server validates the *exact millisecond* the student scanned the QR code locally, not the time the data finally reached the server.
* 🛡️ **Privacy-First & Ethical:** No GPS tracking, no facial recognition, and no app installation required.
* 🔒 **Strict Identity Validation:** Client-side Regex validation ensures only valid USN formats (e.g., `01JST24UCS100`) can interact with the system.
* 👨‍🏫 **Admin Override:** Lecturers retain ultimate authority with a "Manual Override" feature for hardware failures (e.g., a student's phone is dead).

---

## 🏗️ System Architecture & Tech Stack

This project utilizes the **PERN Stack** (PostgreSQL, Express, React/Vanilla JS, Node.js) configured for edge-case resilience.

* **Frontend (Student/Lecturer Portals):** HTML5, CSS3 (Custom Animations), Vanilla JavaScript.
* **Backend:** Node.js with Express.js.
* **Database:** PostgreSQL (Relational DBMS) managed via Prisma ORM.
* **Key Libraries:** `html5-qrcode` (Local Camera Processing), `cors` (Cross-Origin Resource Sharing).
* **Tunneling:** `ngrok` (Provides secure HTTPS for mobile camera access).

---

## 🔄 Core Workflows

### 1. The Lecturer Workflow (Admin)
1. **Initiate:** Lecturer logs into the dashboard and clicks "Create Session". The server generates a unique UUID (`session_id`) and a 4-digit verification code.
2. **Activate:** Lecturer clicks "Activate". A strict 30-second active window (`startTime` and `endTime`) is recorded in the database. The QR code is displayed on the projector.
3. **Monitor:** As students scan and submit, the Real-Time Grid updates.
4. **Override (Edge Case):** If a student's phone is dead, the lecturer uses the **Manual Override Input** to directly add the student's USN to the database.

### 2. The Student Workflow (End-User)
1. **Access:** Student opens the portal on their phone (UI is cached by the browser).
2. **Scan (No Internet Required):** Student scans the projector. The JS locally validates the QR token format.
3. **Authenticate:** Student inputs their USN (auto-formatted Google-style OTP blocks).
4. **Submit & Store:** - *If Online:* Data is sent to the server and a Green Success Checkmark appears.
   - *If Offline:* Payload (including the exact `clientTimestamp`) is saved to `localStorage`.
5. **Auto-Sync:** Once the student walks into a Wi-Fi zone, the background `online` event listener silently pushes the saved data to the server.

---

## 📂 Project Structure & Modules

```text
📦 smart-attendance
 ┣ 📂 attendance-Backend
 ┃ ┣ 📂 controllers
 ┃ ┃ ┣ 📜 session.controller.js    # Manages 30s timers & QR generation
 ┃ ┃ ┗ 📜 attendance.controller.js # Validates timestamps & handles Manual Overrides
 ┃ ┣ 📂 models
 ┃ ┃ ┗ 📜 schema.prisma            # PostgreSQL tables (Students, ClassSessions)
 ┃ ┣ 📂 routes
 ┃ ┃ ┗ 📜 attendance.routes.js     # API Endpoints (/mark, /manual-override)
 ┃ ┗ 📜 server.js                  # Express setup, CORS configuration
 ┣ 📂 attendance-FrontEnd
 ┃ ┣ 📂 student
 ┃ ┃ ┣ 📜 Student.html             # Camera UI and OTP Inputs
 ┃ ┃ ┣ 📜 student.css              # Success animations
 ┃ ┃ ┗ 📜 student.js               # LocalStorage logic & Regex validation
 ┃ ┗ 📂 lecturer
 ┃ ┃ ┣ 📜 Lecturer.html            # Dashboard and Override inputs
 ┃ ┃ ┗ 📜 lecturer.js              # Real-time list updates