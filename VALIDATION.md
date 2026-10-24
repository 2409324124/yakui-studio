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
