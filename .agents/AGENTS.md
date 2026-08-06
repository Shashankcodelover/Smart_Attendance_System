# SMART ATTENDANCE — DAILY OPERATING DIRECTIVES

## DAILY WORKFLOW — ONE COMPLETE DUAL-PASS CYCLE PER DAY

Every session follows a **SINGLE COMPLETE DUAL-PASS CYCLE** combining both the **BUILDER** and **REJECTOR** identities in sequence. This cycle runs **once per day at 07:00 PM** (or when the daily session is started).

---

### 🔄 THE COMPLETE DAILY CYCLE WORKFLOW

```text
                               ┌──────────────────────────────────────────┐
                               │  START DAILY SESSION (07:00 PM Trigger)  │
                               └────────────────────┬─────────────────────┘
                                                    │
                                                    ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
 │  PART 1: THE BUILD / RESOLVER PASS (BUILDER_PROMPT.md)                                           │
 ├──────────────────────────────────────────────────────────────────────────────────────────────────┤
 │  1. Go to `AGENT_PROMPTS/BUILDER_PROMPT.md` and adopt the Master Identity.                      │
 │  2. Read `REJECTION_REPORT.md` at root for open Critical/Major items to resolve.                │
 │  3. Read `docs/upcoming-features/` for upcoming features.                                        │
 │  4. Move through the 6 Roles in sequence:                                                       │
 │     • Role 1: Research & Competitive Intelligence                                                │
 │     • Role 2: UI/UX Design                                                                       │
 │     • Role 3: Software & Feature Engineering (Fix rejections + build feature increments)          │
 │     • Role 4: QA / Test Engineering (Run tests — 100% pass required)                            │
 │     • Role 5: Security Engineering                                                               │
 │     • Role 6: Documentation & Knowledge-Base Engineer (README, TASKS, ROADMAP, CHANGELOG)        │
 └──────────────────────────────────────────────────┬───────────────────────────────────────────────┘
                                                    │
                                                    ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
 │  PART 2: THE REJECTOR AUDIT PASS (REJECTOR_PROMPT.md)                                            │
 ├──────────────────────────────────────────────────────────────────────────────────────────────────┤
 │  1. Switch identity to THE REJECTOR by reading `AGENT_PROMPTS/REJECTOR_PROMPT.md`.              │
 │  2. Perform an independent, adversarial audit of the updated codebase and features.             │
 │  3. Score all 8 categories harshly (0–10).                                                        │
 │  4. Update `REJECTION_REPORT.md` at project root with updated verdict, scores, and open items.   │
 └──────────────────────────────────────────────────┬───────────────────────────────────────────────┘
                                                    │
                                                    ▼
                               ┌──────────────────────────────────────────┐
                               │   END DAILY CYCLE (Commit & Report)      │
                               └──────────────────────────────────────────┘
```

---

## 📌 PERMISSION & SIGN-OFF PROTOCOL

- **Local Execution (Autonomous)**: The agent has full authority to edit files, run tests, create documentation, and commit locally to branch `daily-improvements`.
- **User Permission Required**: The agent will explicitly ask for your sign-off before:
  1. Pushing to any remote GitHub repository (`git push`).
  2. Merging `daily-improvements` into `main`.
  3. Modifying production credentials or environment secrets.

---

## 📁 REFERENCE PROMPT LOCATIONS

- **Builder Prompt**: [`AGENT_PROMPTS/BUILDER_PROMPT.md`](file:///d:/users/Shashank%20J/Desktop/my%20stufs/-smart-attendance/AGENT_PROMPTS/BUILDER_PROMPT.md)
- **Rejector Prompt**: [`AGENT_PROMPTS/REJECTOR_PROMPT.md`](file:///d:/users/Shashank%20J/Desktop/my%20stufs/-smart-attendance/AGENT_PROMPTS/REJECTOR_PROMPT.md)
- **Rejection Report**: [`REJECTION_REPORT.md`](file:///d:/users/Shashank%20J/Desktop/my%20stufs/-smart-attendance/REJECTION_REPORT.md)
