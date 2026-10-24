# Yakui Studio local workbench — shared contract

Root: this folder. Vanilla browser ES modules; Node server, no build dependency. User requests usable Win2000 music workstation: manual instrument sections and notes, procedural score import, selection-scoped AI proposals. Existing art/score untouched.

## Project model v1
{version:1,id,title,bpm,meter:[4,4],bars:24,revision:0,tracks:[{id,name,voice,color,mute:false,solo:false,gain:0.7,pan:0,wave:'pulse',duty:0.25}],clips:[{id,trackId,name,start:0,length:16,notes:[{id,start:0,duration:0.5,midi:60,velocity:0.8}]}]}
All times beats. Clip note times LOCAL to clip; no negative start, duration positive, start+duration <= clip.length. Revisions monotonically change per edit including undo/redo.

## core.mjs API
export importScore(score), validateProject(project) throws, flattenProject(project) -> event score with track settings; export createStore(project) -> {get project(), commit(label,fn),undo(),redo(), get canUndo(), get canRedo(),subscribe(fn)}. commit mutates clone via fn then validates, increments revision. export helpers splitClip(project,clipId,localBeat), duplicateClip(project,clipId), moveClip(project,clipId,start), applyProposal(project,selection,proposal). selection {clipId,noteIds:[],start,end,revision} local beats. Empty noteIds = all notes whose starts in [start,end). proposal {summary,notes:[{start,duration,midi,velocity}]} replaces selected notes only; validate bounds & revision. export getSelection(project,clipId,noteIds=[],start=0,end=clip.length) -> selection with revision and notes. ids helper export uid().

## audio.mjs API
export class Player { constructor({onPosition,onState}); async play(project,{start=0,end=bars*4,loop=false}={}); stop(); get playing(); async previewNote(track,midi,duration=.3,velocity=.8); } WebAudio lazy gesture, scheduling lookahead, pulses/triangle/noise drums, gain pan mute solo. export async renderWav(project,{start,end}={}) -> Blob. Same synth for live/offline. No audio files until explicit export.

## server.mjs API
node server.mjs --port 5240 (localhost only), serve this folder. GET /api/status -> {codex:boolean, ...}. POST /api/ai {project,selection,instruction} -> {id}; GET /api/ai/:id -> {id,status:'running'|'done'|'error'|'cancelled',proposal?,error?,log?}; DELETE /api/ai/:id cancels owned process. Real codex exec read-only, schema output, finite bounded validation using core; no fake model response. Only localhost same-origin requests, reject cross-origin POST. Prompt selected content only + immediate musical context; no external files/secret reads. Save server job results under .runtime ignored. stale revision checked on frontend apply. May expose POST /api/projects for explicit save, but browser JSON import/export + localStorage sufficient first version.

## frontend files
index.html style.css app.mjs. Import core.mjs audio.mjs. Score example data/example-score.json. Avatar assets/yakui.png. Actual working clip arranger (select, drag move, split, duplicate, delete, add), piano roll (add, move, resize, multiselect, delete, velocity and numeric inspector), tracks mute solo gain wave, tempo, transport loop and seek, undo redo, save/load JSON, original event score import/export, WAV export, selected-only real AI proposal diff audition/apply/discard. No decorative dead buttons. Win2000 menu/toolbars, navy titlebar, gray bevel chrome, dark slate editor, restrained green/plum regions, legible CJK, compact 3panes with collapsible inspector on narrower screens. Preserve user's art proportions. Default load example. Keyboard shortcuts not while typing. Use accessible labels/data ids for tests. No global app debug backdoor needed.
