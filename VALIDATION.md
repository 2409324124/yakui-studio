# 0.3.0-local integration validation

2026-10-24, Linux x64, Node 24.18. Local-only; no push or npm publication.

- 46 focused automated checks passed: project persistence/restart, independent-process directory locking, optimistic conflicts, selection bounds, undo/redo and idempotency; MIDI0/1 parsing, overlaps, tempo/meter/controller preservation, malformed input, conductor-only track exclusion; provider protocols; existing transport and music tools.
- Real browser: space paused at beat 7.858 and resumed at 8.031 (not zero); clip selection sought beat16, Ctrl+Enter opened focused editing. Playhead remained visible.
- External CLI renamed shared project; browser showed the update and browser undo restored it. Browser clip rename appeared in the HTTP project at revision3. Tests used a separate disposable workspace, then restored original example.
- Browser file chooser imported an actual MIDI fixture with 4/4→3/4→6/8 and 120→90 BPM. Exported actual MIDI through project CLI. Fixed conductor metadata being shown as an empty instrument track. Pixel comparison/hashes were not used.
- Real Codex CLI generated and parsed a single-note candidate. Real OpenCode through the actual browser/server returned the requested one-note candidate for audition; original score remained unchanged. The successfully tested model is saved only in this browser, not hardcoded as a distribution default. Authentication may differ on other machines.
- Claude Code intentionally remains a planned interface per user scope, no live adaptation claim.
- Read-only gpt-6-sol visual review: retro style, visible playheads, legible arrangement/piano roll and no observed overlap. Screenshot cannot prove meter semantics; timeline tests cover them.
- Source and preview run from /srv/storage/projects/yakui-studio. Local preview uses port5250 and ignored .runtime/local-v03. Existing approved original server was not stopped.

## Previous 0.2 verification (historical)

# 0.2.0 integration validation

2026-10-24, Linux x64, Node 24.18 / Python 3.12.

- 30 automated checks passed: existing score/edit/transport/MIDI, local server restrictions, candidate provenance import, review delegation, renderer mapping, installer backups, and npm-style executable symlinks.
- Installed the actual npm tarball in a clean npm cache. `setup --skills-dir` installed both complete skills; the packaged server returned the homepage and `/api/status`.
- Fresh isolated Python environment: `music setup --profile basic`, then `--profile transcribe`, both succeeded. CPU Torch 2.6, Demucs 4.0.1, Basic Pitch 0.4 ONNX. TensorFlow/CoreML are deliberately not installed.
- Generated an original four-bar test arrangement: 149 events, 95 BPM, 10.105 seconds. Rendered 44.1kHz/16-bit stereo preview, loop, and three-pass seam audition. Peak -1.5dBFS.
- Actual Demucs htdemucs inference on a three-second synthesized excerpt produced drums/bass/other/vocals. Actual Basic Pitch ONNX inference on `other.wav` produced 25 candidate notes, imported successfully as a workbench project. A separate full-mixture candidate smoke produced 27 notes and rendered back through the Python adapter.
- This verifies tool execution and interchange, not transcription accuracy for arbitrary songs. No listening-based accuracy claim, platform-wide installation claim, or exact browser/Python waveform equivalence is made. Workbench-to-Python rendering uses documented role presets and records mappings.
- Existing UI manual QA was accepted by the user. This integration did not change the approved layout.

Native Windows/macOS dependency installs remain unverified. CPU setup supports Python 3.10–3.12 and requires external FFmpeg; models download on demand. No recordings or model weights are shipped in npm.
