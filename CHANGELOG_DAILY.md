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
- Modularize `/api/ai/chat` into a dedicated controller file.
- Add client-side unit/component tests for `StudentCheckingView` and `LecturerDashboardView`.
- Implement URL hash or pushState routing for portal sub-views.
