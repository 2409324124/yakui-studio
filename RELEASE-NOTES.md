# Yakui Studio 0.3.0

CLI execution tools for agents and people, with a shared retro browser music editor.

- Durable shared project, selection API, revision conflicts and persistent undo/redo.
- CLI project read/apply/import/export commands and installable music skills.
- Codex and OpenCode candidate generation; Claude interface reserved for a later feature.
- User-controlled model configuration; no provider model hardcoded as a release default.
- SMF0/1 MIDI import/export, tempo and meter changes, retained controller metadata.
- Existing playhead, pause/resume and focused clip editing preserved.
- No npm runtime dependencies; Python/transcription models installed only on explicit request.

Requires Node.js 20+. Editing, playback and MIDI do not require an agent account. MIDI chip playback is an approximation, not a complete General MIDI sound bank; controller events are preserved but not all are audible. Claude live integration, native DAW formats and a terminal arrangement UI are outside this release.
