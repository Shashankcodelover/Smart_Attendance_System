# 🛡️ Smart Attendance Platform (Enterprise Zero-Trust Edition)

> **Zero-Trust Biometric, Cryptographic & Geofenced Presence Verification System**  
> Built for universities and enterprise institutions to eliminate proxy attendance, enforce dynamic rotation QR tokens, and deliver predictive dropout analytics using Google Gemini.

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

# 2. Run automated test suite
npm test

# 3. Start development server
npm run dev
```

Visit the dashboard at `http://localhost:3000`.
