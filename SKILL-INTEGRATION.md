# Bundled music skills

`skills/yakui-studio` guides the local workbench, candidate import and manual correction. `skills/procedural-chiptune` supplies the Python analysis, separation, transcription, review and synthesis scripts, portable project templates and focused references. Both directories belong in the npm package and must be copied together as siblings by `yakui-studio setup`.

Skill installation copies instructions and source resources; `yakui-studio music setup --profile basic|transcribe` separately installs runtime dependencies. The basic path needs no transcription models. The transcription profile adds Demucs, Basic Pitch ONNX and pYIN dependencies; models may download on first use. FFmpeg must be discoverable through PATH or FFMPEG.

The CLI routes analyze, separate, transcribe, review, init and render to the bundled Python scripts. `music import` converts note candidates into a Studio project; it does not establish their accuracy. Preserve candidate JSON and explicit correction evidence beside the editable project, including information the workbench representation cannot retain.

The distributed resources contain no reference recordings, model weights, private project paths, credentials or historical analysis outputs. Case notes retain only reusable methods and capability limits. The original template motifs are demonstration material, not a transcription of a reference song. Package acquisition/publication status should be stated in the main README rather than assumed by skills.

Validation: run the skill-creator quick validator for each directory; compile Python sources with bytecode outside the package; check local Markdown links resolve and verify init_track can create a self-contained project from the bundled assets. These checks establish packaging integrity, not transcription accuracy or platform-wide dependency compatibility.
