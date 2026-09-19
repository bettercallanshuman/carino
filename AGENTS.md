<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Cariño Agent Operating Rules

**All AI coding agents MUST read [CODEBASE.md](file:///c:/Users/iaman/carino/CODEBASE.md) before investigating or modifying application code.**

[CODEBASE.md](file:///c:/Users/iaman/carino/CODEBASE.md) is the single canonical source of truth for repository architecture, system ownership, file-level responsibilities, protected files, known regressions, and validation protocols.

### Investigation Discipline
1. **Route First**: Classify the issue and consult Section 3 & 4 of `CODEBASE.md` to identify the owner file.
2. **Inspect Owner First**: Read only the targeted slice of the primary owner file before reading dependencies.
3. **Avoid Repository-Wide Searches**: Do NOT run broad greps for generic keywords (`player`, `favourite`, `audio`, `room`, `state`).
4. **Expand Scope Only When Justified**: Broaden exploration only if the documented owner delegates responsibility or contradicts reality. State the reason when expanding.
5. **Respect Protected Systems**: Never casually modify critical systems ([AudioEngine.tsx](file:///c:/Users/iaman/carino/components/player/AudioEngine.tsx), [playerStore.ts](file:///c:/Users/iaman/carino/stores/playerStore.ts), [roomSync.ts](file:///c:/Users/iaman/carino/lib/realtime/roomSync.ts), [lib/auth/server.ts](file:///c:/Users/iaman/carino/lib/auth/server.ts)) for UI/styling tasks.
6. **Minimal Surgical Changes**: Make only the smallest viable change required for the user's prompt. Do not refactor unrelated code.
7. **Validate After Changes**: Run the validation matrix commands specified in Section 10 of `CODEBASE.md`.
8. **Update Documentation**: When architecture or behavior changes, update `CODEBASE.md` accordingly.
