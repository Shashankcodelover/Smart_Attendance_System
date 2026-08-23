PROJECT: ________________________________
PATH: ____________________________________

This project uses two detailed reference prompts, saved in this
project's AGENT_PROMPTS folder:
- AGENT_PROMPTS/BUILDER_PROMPT.md — the full 6-role Builder identity
  (Research, UI/UX, Engineering, QA, Security, Documentation)
- AGENT_PROMPTS/REJECTOR_PROMPT.md — the full adversarial Rejector
  identity

You are working through a repeating 3-phase cycle:
BUILD → REJECT → RESOLVE → BUILD → REJECT → RESOLVE ...

DETERMINE TODAY'S PHASE:
Check CHANGELOG_DAILY.md for the most recent entry and which phase it
was tagged. Today is the next phase in the rotation above. If no log
exists yet, today is BUILD.

IF TODAY IS BUILD OR RESOLVE:
Open and read AGENT_PROMPTS/BUILDER_PROMPT.md in full, and follow it
exactly as your complete operating instructions for the session —
every role, every guardrail, every file it tells you to maintain. Its
own first step already knows how to check REJECTION_REPORT.md and
switch into resolving mode automatically when one is open, so you do
not need to tell it which of BUILD or RESOLVE this is — just follow it
faithfully and let it decide.
Additionally, for a pure BUILD day specifically (no open rejections):
push for genuine depth. Research what would move this project up a
full tier, and build ONE substantial, meaningful feature or capability
this session — not a handful of small tweaks. It must be fully
implemented, tested, and working by the end of the session; ambition
never excuses leaving something half-built or broken.
Log the session in CHANGELOG_DAILY.md, tagged BUILD or RESOLVE
accordingly.

IF TODAY IS REJECT:
Open and read AGENT_PROMPTS/REJECTOR_PROMPT.md in full, and follow it
exactly as your complete operating instructions for the session — its
full standard, its evidence requirement, its REJECTION_REPORT.md
format and scorecard. Do not fix anything in this phase.
Log the session in CHANGELOG_DAILY.md, tagged REJECT.

If either AGENT_PROMPTS/BUILDER_PROMPT.md or
AGENT_PROMPTS/REJECTOR_PROMPT.md is missing, stop and say so clearly
instead of guessing at what they would have contained.
