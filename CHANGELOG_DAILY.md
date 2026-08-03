# Daily Changelog — 2026-08-03

## 1. What Was Found Today
- **Monolithic Server File**: `server.ts` was over 1800 lines long, with `/api/ai/chat` taking up over 650 lines inline.
- **Input Validation Gaps**: `/api/attendance/check-in` lacked explicit payload validation for required parameters like `sessionId` and `studentUsn`.
- **Test Suite Coverage Gaps**: Unit tests covered basic CRUD operations but lacked checks for duplicate check-ins, device fingerprint proxy flags, and safe null-handling in DB sort operations.

## 2. What Was Changed & Improved
- **AI Route Modularization**: Extracted Gemini AI model invocation, system prompt, tool definitions, and offline regex fallback into `controllers/aiController.ts`. Delegated `/api/ai/chat` in `server.ts` to `handleAiChat`.
- **Payload Validation**: Added payload input checks in `server.ts` to validate `sessionId` and `studentUsn` formats before querying sessions.
- **Expanded Test Suite**: Added 2 new unit test cases in `tests/server.test.ts` for duplicate check-in rejection and duplicate device fingerprint flagging. Fixed DB sorting in `db.ts` to safely handle optional `created_at` timestamps. All 5 test cases pass cleanly (100% pass rate).
- **Documentation Updates**: Updated `README.md` to reflect `controllers/aiController.ts` in the project architecture diagram.

## 3. What Is Still Deferred
- **SQLite Database Engine Migration**: `db.ts` uses custom pattern matching over JSON files; migrating to SQLite (`better-sqlite3`) will further simplify complex queries.
- **Client Component Integration Testing**: React components (`StudentCheckingView`, `LecturerDashboardView`) can be unit tested with React Testing Library / Vitest in future cycles.

---

# Daily Changelog — 2026-08-02

## 1. What Was Found Today
- **Documentation Mismatch**: Existing `README.md` and `EXPLAINER.md` claimed PostgreSQL, Prisma, SQLite, and Vanilla JS with non-existent subdirectories (`attendance-Backend`, `attendance-FrontEnd`). The real stack is React 19 + TypeScript + Vite 6 + Tailwind 4 + Express 4 + JSON DB (`db.ts`).
- **Missing Test Suite**: No automated unit test script existed in `package.json`.
- **Security & Secret Smells**: `HMAC_SECRET` in `server.ts` was hardcoded without checking `process.env`.
- **Session Verification Overhead**: Active session database queries on every check-in benefit significantly from in-memory session caching.

## 2. What Was Changed & Improved
- **Active Session Memory Caching**: Refactored `server.ts` to utilize `activeSessionsCache` Map for fast session lookup and proxy detection during peak check-in traffic.
- **Environment Parameterization**: Parameterized `HMAC_SECRET` to fallback to `process.env.HMAC_SECRET`.
- **Device Fingerprint Guard**: Added duplicate device fingerprint detection to flag proxy attendance attempts.
- **Automated Unit Testing**: Created `tests/server.test.ts` using Node's native test runner (`npx tsx --test`) covering student upsert, session creation, activation, and querying. Added `"test": "tsx --test tests/server.test.ts"` to `package.json`.
- **Documentation Alignment**: Re-wrote `README.md` and `EXPLAINER.md` to accurately document the real React 19 + Vite 6 + Express + JSON DB architecture and test commands.

## 3. What Is Still Weak
- **`db.ts` SQLite Pattern Matching**: `db.ts` relies on custom string pattern matching for SQL queries. A real database (like SQLite with `better-sqlite3` or Prisma) would be cleaner long-term.
- **Monolithic Route Handlers**: `/api/ai/chat` in `server.ts` remains large (~650 lines) and could be modularized into separate controllers.
- **Client Route PushState**: In-app portal view transitions do not update browser URL history.

## 4. Next Session Priorities
- Add client-side unit/component tests for `StudentCheckingView` and `LecturerDashboardView`.
- Implement URL hash or pushState routing for portal sub-views.
