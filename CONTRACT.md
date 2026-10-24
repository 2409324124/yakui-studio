# Yakui Studio local workbench — 0.3 shared contract

Vanilla browser ES modules and Node service. Preserve the approved retro editor and transport. The CLI is an execution interface for agents and humans; visual editing stays in the browser. Claude Code is reserved for a future feature, not an enabled backend.

## Project model

Version 1 remains compatible: `{version,id,title,bpm,meter,bars,revision,tracks,clips}`. All positions are quarter-note beats; clip starts are absolute, note starts local. Optional `tempoMap:[{beat,bpm}]` and `meterMap:[{beat,meter}]` preserve imported changes. `bars` still describes project extent in base-meter bars for compatibility; displayed rulers use meterMap. Tempo-aware playback/export uses timeline.mjs. Track MIDI channel events and global conductor events are retained for re-export; the chip synthesizer does not execute all controller semantics.

## One project service

`createProjectService({directory,initialProject})` returns async read, replace, setSelection, apply, undo, redo, close. State `{project,selection,canUndo,canRedo}` lives in project-state.json with persisted history. Mutations require projectId, baseRevision and operationId. In-process serialized writes use atomic rename; an exclusive directory lock rejects another owner. Close drains writes and releases lock. Crash locks are not automatically stolen: confirm the recorded process has stopped before removing the stated lock file.

GET/PUT `/api/project`; GET/PUT `/api/selection`; POST `/api/project/operations`, `/undo`, `/redo`. All modifying HTTP calls require matching Origin and loopback Host. CLI `project` commands use the same routes. Browser commits queue through ProjectSync; external revisions are polled every 1.2 seconds and stop the old playback snapshot. Conflict leaves local changes recoverable; no blind overwrite.

Selection may be local `{clipId,noteIds,start,end,revision}` or generalized `{trackIds,clipIds,sectionIds,start,end}` with absolute ranges. Operations support renameProject, updateTrack, updateClip, updateNotes, replaceNotes and section CRUD. Bounds and selection scope validate atomically. Service revision increases on edit, undo and redo; selection-only changes do not alter project revision.

## Agent proposals

GET `/api/status` reports installed/planned providers, not authenticated availability. POST `/api/ai` accepts `{projectId,baseRevision,selection,instruction,provider,model?}`; canonical project is read by service. Legacy project snapshot input remains for compatibility. GET/DELETE `/api/ai/:id` reads/cancels owned jobs.

Codex and OpenCode adapters execute local CLIs with tools restricted for candidate generation. Claude builder/parser remain reserved and detection marks planned. No model ID is baked into defaults: omitted model uses the user's CLI configuration. Browser manual preferences stay in browser localStorage. Structured, bounded notes are validated before audition/application; applying a stale candidate is rejected. External agent skills instead use the shared project CLI for intentional edits.

## UI and interchange

Original pause/resume, persistent playhead, clip seek, region loop and Ctrl/Cmd+Enter focused edit remain. JSON and SMF0/1 MIDI import, JSON/event-score/MIDI/WAV export. MIDI Format2 and SMPTE reject explicitly. Vendored midi-file codec is MIT, with license in vendor/. No npm runtime dependencies or automatic heavy installs. Python/model/FFmpeg workflows remain explicit `music setup` operations.
