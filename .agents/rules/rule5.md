

==================================================
38. SESSION MEMORY & PERSISTENT LOGGING (MANDATORY)
==================================================

Every conversation session MUST be logged to the project's persistent memory file:

  logs/session_log.md  (relative to project root)

This file is the project's working memory. It survives across chat sessions.

==================================================
RULE: AT THE START OF EVERY NEW CONVERSATION
==================================================

Before responding to the first user message, you MUST:

1. READ the file:
   d:\Gursher\Affiliate\Deal Intelligence\logs\session_log.md

2. Load context from the most recent session entries:
   - What was being built or changed
   - What was left incomplete or pending
   - What decisions were made
   - What bugs or issues were open
   - What the user's current priorities are

3. If relevant context exists, briefly acknowledge it:
   "Resuming from last session: [1-line summary of where we left off]"

4. If the log doesn't exist yet, create it before proceeding.

==================================================
RULE: AT THE END OF EVERY REPLY (AFTER EVERY RESPONSE)
==================================================

After EVERY substantive response (not trivial one-liners), append a log entry
to logs/session_log.md in the following format:

---

## [DATE TIME IST] — Session Entry

**User Request:**
[Short summary of what the user asked for]

**Actions Taken:**
- [Bullet list of what was actually done — files created/modified, commands run, APIs called, decisions made]

**Key Decisions / Findings:**
- [Any important architectural, product, or technical decision made]
- [Any assumptions verified or disproved]

**Status:**
[COMPLETE | IN PROGRESS | BLOCKED | PENDING USER INPUT]

**Open Items / Next Steps:**
- [What remains to be done, if anything]
- [What the user should do next, if anything]

---

==================================================
IMPORTANT RULES FOR LOGGING
==================================================

- NEVER skip logging. Every reply that changes code, makes a decision, or
  provides a non-trivial answer MUST produce a log entry.

- Log entries must be APPENDED to the file, not overwritten.

- Keep log entries concise but complete. A new session should be able to
  reconstruct what happened from the log alone.

- If a task spans multiple replies, each reply gets its own log entry.
  Prefix multi-part entries with "[Part N of M]" in the User Request line.

- Timestamps must be in IST (Indian Standard Time, UTC+5:30).

- If the log file grows beyond 500 entries, create a new archive file:
  logs/session_log_archive_[YYYY-MM].md
  and start a fresh session_log.md with a reference to the archive.

==================================================
39. WHAT TO ALWAYS LOG
==================================================

Always log:

- Every file created, modified, or deleted (with path)
- Every shell command run and its outcome
- Every API endpoint added or changed
- Every database schema change
- Every significant product/architecture decision
- Every bug found and fix applied
- Every user-stated priority or direction change
- Every external research finding that influenced a decision
- Every incomplete task left for the next session

Never log:

- Trivial greetings or one-word replies
- Server start/stop unless something notable happened
- Repetitive unchanged status checks

==================================================
40. LOG FILE LOCATION & FORMAT
==================================================

PRIMARY LOG:
  d:\Gursher\Affiliate\Deal Intelligence\logs\session_log.md

FORMAT:
  Plain Markdown. Human-readable. No JSON. No YAML front-matter.
  Newest entries at the BOTTOM of the file.
  Each entry separated by a horizontal rule (---).

The log is part of the project source. It is the project's long-term memory.
Treat it as seriously as the codebase itself.
