# QA Test Report: Smart Attendance System
**Date & Timestamp:** 2026-09-25T12:16:50.974Z  
**Testing Methodology:** Real Chrome Browser Automation & Visual Inspection (Naive First-Time User Simulation)  
**Target Platform:** SJCE Smart Attendance Zero-Trust System (Frontend + SQLite Express WAL Engine)  
**Inspector Role:** Dedicated Autonomous QA Tester  

---

## Phase 1 — Roles Discovered
1. **Lecturer / Faculty Staff** (`dr.ramesh@sjce.edu` / `faculty@sjce.edu`)
   - Entry Point: Gateway Hub -> Lecturer Staff Site / "Demo Faculty" Fast-Track / Credentials Modal
   - Scope: Session activation, Dynamic QR Gate projection, PIN rotation, Roster management, Live telemetry, Attendance audit.
2. **Student Cohort** (`4JC21CS001` / `4SJ21CS005`)
   - Entry Point: Gateway Hub -> Student Portal Site / "Demo Student" Fast-Track / USN login
   - Scope: Classroom check-in, QR parameter decoding, OTP PIN entry, Challenge shape selection, Offline buffer sync, Receipt history.
3. **Admin / Registrar Bureau** (`admin@sjce.edu` / `registrar@sjce.edu`)
   - Entry Point: Gateway Hub -> Admin Registrar Office / "Registrar" Fast-Track
   - Scope: Student enrollment, Departmental roster directory, NAAC/NBA compliance exports, Session override & audit logs.

---

## Phase 2 & 3 — Numbered Test Plan & Live Execution Log

### Group A: Portal Gateway & Authentication
- **TC01**: Gateway Hub initial visual load — **PASS** (Hero banner and title rendered with full styling)
- **TC02**: Connection health badges display — **PASS** (Found SQLite Server Active & Dynamic Handshake badges)
- **TC03**: Fast-Track Demo Bar renders all 3 persona triggers — **PASS** (All 3 buttons present in evaluator bar)
- **TC06**: Gateway sign-in modal triggers on role card click — **PASS** (Modal renders cleanly over blurred backdrop)
- **TC08**: Auth Modal input placeholders present — **PASS** (Found placeholders: e.g. admin@sjce.edu, ••••)
- **TC09**: Modal close / "Go Back" button cleanly restores gateway — **PASS** (Modal closed, background returned to full opacity)
- **TC04**: Clicking "Demo Faculty" authenticates and routes to console — **PASS** (Successfully reached Faculty Command Deck)
- **TC05**: Token persistence in localStorage — **PASS** (Valid 3-segment JWT stored)

### Group B: Lecturer Console & Academic Explorer
- **TC11**: Faculty header renders personalized greeting — **PASS** (Verified "Welcome back, Dr. Ramesh Kumar")
- **TC12**: Academic Explorer tree hierarchy renders — **PASS** (Found B.E. -> Computer -> Year 3 -> Sec A-D hierarchy)
- **TC15**: Folder metrics & active capacity stat cards render — **PASS** (Folder average metric (88.0%) and capacity rendered cleanly)
- **TC16**: Shortage Warnings alert card renders — **PASS** (Shortage warnings card rendered with regulatory bounds note)
- **TC18**: Bottom navigation bar renders all 4 primary destinations — **PASS** (Dashboard, Live Gate, Alpine, and Profile tabs present)
- **TC20**: Alpine AI Assistant floating copilot button is present — **PASS** (Floating action copilot button rendered in viewport)

### Group C: Class Selection & Live Attendance Gate
