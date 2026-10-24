# Yakui Studio — editing approach

## Product

A local music workbench for revising procedurally generated scores. The score is editable data; playback synthesizes audio when needed. A coding agent proposes a revision to an explicit selection, and the user auditions and applies it. Terminal companion assets and music are reused, while this workspace stays independent of TU22 and published Yakui packages.

## Mature workflow references

- LMMS, Creating a Track: https://docs.lmms.io/user-manual/production/creating-a-track
  Separate whole-song instrument blocks from detailed piano roll; move notes vertically for pitch and resize their edges for duration.
- Ardour, Region Editor Pane: https://manual.ardour.org/working-with-regions/region-editor/
  Region properties, editor toolbar, note grid, and velocity are distinct controls. Loop/solo audition and grid snapping belong beside the editor.

These are workflow references, not copied software or a claim of compatibility with either application's project files.

## Visual thesis

Windows 2000 studio utility: steel gray raised controls, navy active title, inset dark editing surfaces, small violet/green musical regions, readable text and square edges. No marketing hero, modern dashboard cards, ornamental gradients or animations.

Content plan: transport and project controls first; track arrangement above piano roll; selected-object properties and AI proposal beside editing. Status along the bottom. The Yakui avatar is contextual, never the main editing surface.

Interaction thesis: continuous playhead for time; direct block/note manipulation with snapping; selection makes the inspector and proposal scope explicit. Animation is operational only.

## Essential invariants

- Existing 95 BPM / 24 bar / 1209 note score remains a read-only example source.
- Clip notes use local beat positions; arrangement clips use global beat positions.
- Changes are reversible; proposal application rejects a stale project revision.
- AI scope is selection-specific. Applying notes cannot silently replace unrelated tracks or the whole song.
- Offline manual editing and audition require no model account.
- Model proposals use local Codex login, and require the user's Generate action. They are not deterministic transforms labelled as AI.
- Browser and server serve only on loopback. Runtime jobs are not served as static public assets.
- Playback produces sound in memory; audio files are created only through explicit export.

## Current boundaries

This is a local Web music editor linked to a local coding agent. It does not replace Codex's original TUI, embed the old tmux companion, publish npm, or modify game code. It edits event-score JSON and its own clip-project JSON. Native DAW projects, live recording, VST instruments and a general source-code editor are outside this implementation.
