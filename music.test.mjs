import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { candidatesToProject, runMusic, musicDataDir } from './music/index.mjs';
import { flattenProject, validateProject } from './core.mjs';
const fixture = () => ({schema:'stem-notes-v1',method:'basic_pitch_0.4.0_onnx_cpu',source_label:'guitar',start_seconds:10,duration_seconds:3,
  corrections:[],notes:[{id:'n0000',start_seconds:10.25,end_seconds:12.25,midi:60,confidence:.71,role:'lead',status:'candidate',pitch_cents:[{time_seconds:11,cents:12}]},
    {id:'n0001',start_seconds:10.5,end_seconds:11,midi:67,confidence:.45,role:'unassigned',role_candidates:['lead','answer'],status:'candidate'}]});
const sink = {write(){}};
test('imports real stem schema, keeps polyphony, seconds, confidence, review history and bends',()=>{
  const source=fixture(), before=structuredClone(source);
  const project=candidatesToProject(source,{bpm:120,beatOrigin:10});
  validateProject(project);
  const score=flattenProject(project);
  assert.deepEqual(source,before);
  assert.deepEqual(project.sourceMetadata.transcription,source);
  assert.deepEqual(score.events.map(n=>[n.start,n.duration,n.midi,n.voice]),[[.5,4,60,'lead'],[1,1,67,'guitar']]);
  assert.equal(score.events[0].candidate.confidence,.71);
  assert.equal(score.events[0].velocity,1);
  assert.deepEqual(score.events[0].candidate.pitch_cents,source.notes[0].pitch_cents);
  assert.equal(score.events[0].start_seconds,10.25);
  assert.equal(project.bars,2);
});
test('uses seconds after corrections instead of stale beat candidates',()=>{
  const source=fixture();source.notes[0].start_beat=999;source.notes[0].quantized_start_beat=999;
  assert.equal(flattenProject(candidatesToProject(source,{bpm:60})).events[0].start,10.25);
});
test('rejects analysis, invalid times, out-of-range BPM and oversized timelines',()=>{
  assert.throws(()=>candidatesToProject({half_beat_candidates:[]},{bpm:120}),/stem-notes-v1/);
  assert.throws(()=>candidatesToProject(fixture(),{bpm:NaN}),/bpm/);
  assert.throws(()=>candidatesToProject(fixture(),{bpm:120,beatOrigin:11}),/Invalid candidate/);
  const data=fixture();data.notes[0].end_seconds=10;
  assert.throws(()=>candidatesToProject(data,{bpm:120}),/Invalid candidate/);
  data.notes=[];data.duration_seconds=100000;
  assert.throws(()=>candidatesToProject(data,{bpm:120}),/1024/);
});
test('CLI imports actual JSON into valid editable project',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'yakui music '));
  try {
    const input=path.join(dir,'source candidates.json'),out=path.join(dir,'result','project.json');
    await writeFile(input,JSON.stringify(fixture()));
    assert.equal(await runMusic(['import',input,'--bpm','120','--beat-origin','10','--out',out],{stdout:sink,stderr:sink}),0);
    const p=JSON.parse(await readFile(out,'utf8'));validateProject(p);assert.equal(p.tracks.length,2);
    assert.equal(await runMusic(['import',input,'--out',out],{stdout:sink,stderr:sink}),1);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('delegation executes bundled review with real Python and retains its exit code',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'yakui-review-'));
  try {
    const input=path.join(dir,'candidates.json'),edits=path.join(dir,'edits.json'),out=path.join(dir,'reviewed.json');
    await writeFile(input,JSON.stringify(fixture()));
    await writeFile(edits,JSON.stringify([{id:'n0000',action:'update',midi:61,reason:'auditioned correction'}]));
    assert.equal(await runMusic(['review',input,'--out',out,'--edits',edits,'--python','python3']),0);
    assert.equal(JSON.parse(await readFile(out,'utf8')).notes[0].midi,61);
    assert.equal(await runMusic(['review','--not-a-real-option','--python','python3']),2);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('invalid setup/profile never installs; data override is respected',async()=>{
  assert.equal(musicDataDir({YAKUI_DATA_DIR:'/tmp/yakui-test-data'}),'/tmp/yakui-test-data');
  assert.equal(await runMusic(['setup','--profile','unknown'],{stdout:sink,stderr:sink}),1);
  assert.equal(await runMusic(['transcribe','--method','fake'],{stdout:sink,stderr:sink}),1);
});

test('workbench render adapter preserves timing and mixer selection with explicit preset mapping',async()=>{
  const {projectToRenderScore}=await import('./music/index.mjs');
  const p=candidatesToProject(fixture(),{bpm:120,beatOrigin:10});
  p.tracks[0].solo=true;p.tracks[0].gain=1.4;p.tracks[0].pan=-.3;
  let score=projectToRenderScore(p);
  assert.equal(score.events.length,1);
  assert.equal(score.events[0].start,.5);
  assert.equal(score.events[0].duration,4);
  assert.equal(score.events[0].pan,-.3);
  assert.equal(score.events[0].velocity*score.voices.lead.gain,1.4);
  p.tracks[0].mute=true;
  assert.equal(projectToRenderScore(p).events.length,0);
  p.tracks[0].solo=false;
  score=projectToRenderScore(p);
  assert.equal(score.events[0].voice,'lead');
  assert.equal(score.renderMapping.tracks[1].voice,'guitar');
  assert.equal(score.renderMapping.tracks[1].preset,'lead');
});

test('setup rejects unsupported Python before creating venv or invoking pip',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'yakui-python-check-'));
  try {
    const fake=path.join(dir,'python'),log=path.join(dir,'calls');
    await writeFile(fake,`#!${process.execPath}\nimport { appendFileSync, writeSync } from 'node:fs';\nappendFileSync(process.env.YAKUI_TEST_LOG,JSON.stringify(process.argv.slice(2))+'\\n');\nwriteSync(1,'[3,13,0]\\n');\n`,{mode:0o755});
    let message='';
    const code=await runMusic(['setup','--profile','transcribe','--python',fake],{env:{...process.env,YAKUI_DATA_DIR:path.join(dir,'data'),YAKUI_TEST_LOG:log},stderr:{write(s){message+=s;}},stdout:sink});
    assert.equal(code,1);assert.match(message,/3.10–3.12.*3.13.0.*--python/s);
    const calls=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(calls.length,1);assert.equal(calls[0][0],'-c');
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('render delegation converts project and cleans temporary JSON even on failure',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'yakui-render-check-'));
  try {
    const fake=path.join(dir,'python'),captured=path.join(dir,'captured.json'),input=path.join(dir,'project.json');
    await writeFile(input,JSON.stringify(candidatesToProject(fixture(),{bpm:120,beatOrigin:10})));
    await writeFile(fake,`#!${process.execPath}\nimport {readFileSync,writeFileSync} from 'node:fs';\nconst file=process.argv[3];\nwriteFileSync(process.env.YAKUI_TEST_CAPTURE,JSON.stringify({file,score:JSON.parse(readFileSync(file,'utf8'))}));\nprocess.exit(7);\n`,{mode:0o755});
    let message='';
    assert.equal(await runMusic(['render',input,'--out',path.join(dir,'output'),'--python',fake],{env:{...process.env,YAKUI_TEST_CAPTURE:captured},stdout:{write(s){message+=s;}},stderr:sink}),7);
    const result=JSON.parse(await readFile(captured,'utf8'));
    assert.equal(result.score.events.length,2);
    assert.equal(result.score.events[1].voice,'lead');
    assert.match(message,/not an exact workbench timbre/);
    await assert.rejects(readFile(result.file),{code:'ENOENT'});
  } finally {await rm(dir,{recursive:true,force:true});}
});
