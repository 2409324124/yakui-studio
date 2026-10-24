import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importScore,flattenProject,createStore,splitClip,duplicateClip,moveClip,getSelection,applyProposal,validateProject} from './core.mjs';
const original=JSON.parse(readFileSync(new URL('./data/example-score.json',import.meta.url)));
const fixture=()=>importScore({title:'Test',bpm:100,meter:[4,4],bars:2,sections:[{name:'A',bars:[1,1]},{name:'B',bars:[2,2]}],events:[{voice:'lead',start:3,duration:2,midi:60,velocity:1},{voice:'lead',start:0,duration:1,midi:64,velocity:.8}]});
test('original procedural score retains every event, timing and duty after region import/export',()=>{
 const p=importScore(original),flat=flattenProject(p);
 assert.equal(flat.events.length,original.events.length);
 const sort=es=>es.map(({voice,start,duration,midi=60,velocity=1,duty})=>({voice,start,duration,midi,velocity,duty})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const a=sort(flat.events),b=sort(original.events);
 assert.equal(a.length,b.length);
 // Defaults added by playback are allowed; every original explicit duty is preserved.
 for(const e of original.events){assert.ok(flat.events.some(n=>n.voice===e.voice && n.start===e.start && Math.abs(n.duration-e.duration)<1e-6 && n.midi===(e.midi??60) && (e.duty==null||e.duty===n.duty)));}
 assert.equal(flat.reference,original.reference);
});
test('cross-section notes are clipped locally and rejoined without lost duration',()=>{
 const p=fixture();assert.equal(p.clips.length,2);assert.equal(p.clips[0].notes[0].duration,1);assert.equal(p.clips[1].notes[0].start,0);
 const n=flattenProject(p).events.find(n=>n.midi===60);assert.equal(n.start,3);assert.equal(n.duration,2);
});
test('split crossing note survives roundtrip; moving right region prevents false tie',()=>{
 const p=importScore({bpm:100,bars:4,events:[{voice:'lead',start:2,duration:5,midi:60,velocity:1}]});const c=p.clips[0];
 const right=splitClip(p,c.id,4);validateProject(p);assert.equal(flattenProject(p).events[0].duration,5);
 p.bars=5;moveClip(p,right.id,5);assert.equal(flattenProject(p).events.length,2);
});
test('store rollback on invalid edit, monotonic undo/redo and stale AI rejection',()=>{
 const s=createStore(fixture()),id=s.project.clips[0].id,selection=getSelection(s.project,id);
 assert.throws(()=>s.commit('bad',p=>p.bpm=0));assert.equal(s.project.revision,0);assert.equal(s.canUndo,false);
 s.commit('tempo',p=>p.bpm=120);s.undo();assert.equal(s.project.bpm,100);assert.equal(s.project.revision,2);s.redo();assert.equal(s.project.revision,3);
 assert.throws(()=>s.commit('stale',p=>applyProposal(p,selection,{summary:'old',notes:[]})),/工程已修改/);
});
test('AI selected notes only, rejects escaped ranges and invalid values atomically',()=>{
 const s=createStore(fixture()),c=s.project.clips[0],target=c.notes.find(n=>n.midi===64),sel=getSelection(s.project,c.id,[target.id]);
 assert.throws(()=>s.commit('outside',p=>applyProposal(p,sel,{summary:'bad',notes:[{start:1,duration:1,midi:72,velocity:1}]})),/选区/);
 assert.equal(s.project.clips[0].notes.length,2);
 s.commit('AI',p=>applyProposal(p,sel,{summary:'changed',notes:[{start:0,duration:.5,midi:67,velocity:.7}]}));
 assert.equal(s.project.clips[0].notes.length,2);assert.ok(s.project.clips[0].notes.some(n=>n.midi===60));assert.ok(s.project.clips[0].notes.some(n=>n.midi===67));
 s.undo();assert.ok(s.project.clips[0].notes.some(n=>n.id===target.id));
});
test('duplicate extends song safely and gives independent IDs',()=>{
 const p=fixture(),last=p.clips.at(-1),dup=duplicateClip(p,last.id);validateProject(p);assert.equal(dup.start,8);assert.equal(p.bars,3);assert.notEqual(dup.notes[0].id,last.notes[0].id);assert.notEqual(dup.notes[0].sourceId,last.notes[0].sourceId);
});
test('malformed projects reject duplicate IDs and out of range notes',()=>{
 const p=fixture();p.clips[0].notes[0].duration=100;assert.throws(()=>validateProject(p),/范围/);
 const q=fixture();q.clips[1].notes[0].id=q.clips[0].notes[0].id;assert.throws(()=>validateProject(q),/ID/);
});
