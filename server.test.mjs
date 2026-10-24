import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStudioServer, buildPrompt, inspectRequest, validateProposal } from './server.mjs';

const project=()=>({version:1,id:'p',title:'Do not send this title /private/path',bpm:95,meter:[4,4],bars:4,revision:3,
 tracks:[{id:'t',name:'Lead',voice:'lead',color:'#886699',mute:false,solo:false,gain:.7,pan:0,wave:'pulse',duty:.25}],
 clips:[{id:'c',trackId:'t',name:'Intro',start:0,length:8,notes:[{id:'n1',start:0,duration:.5,midi:60,velocity:.8},{id:'n2',start:1,duration:.5,midi:64,velocity:.7}]}]});
const selection=()=>({clipId:'c',noteIds:['n1'],start:0,end:1,revision:3});
const proposal={summary:'将主音上移两度',notes:[{start:0,duration:.5,midi:62,velocity:.8}]};
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function fixture(opts={}){
 const root=await mkdtemp(join(tmpdir(),'yakui-server-test-'));await writeFile(join(root,'index.html'),'<html>fixture</html>');
 const app=createStudioServer({root,installed:true,...opts});
 await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
 const url=`http://127.0.0.1:${app.server.address().port}`;
 return {...app,url,root,request:(path,options={})=>fetch(url+path,{...options,headers:{Origin:url,...options.headers}}),async cleanup(){await app.close();await rm(root,{recursive:true,force:true});}};
}
function mockRunner(result=proposal,{exitCode=0,wait=5}={}){
 return spec=>{const child=new EventEmitter();child.stderr=new EventEmitter();child.exitCode=null;child.kill=()=>{child.exitCode=-1;queueMicrotask(()=>child.emit('close',-1));};
 setTimeout(async()=>{if(child.exitCode!==null)return;await writeFile(spec.outputFile,JSON.stringify(result));child.exitCode=exitCode;child.emit('close',exitCode);},wait);return child;};
}
async function submit(f){const r=await f.request('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:project(),selection:selection(),instruction:'升高两个半音'})});return {response:r,body:await r.json()};}

test('selection bounds and stale revisions reject invalid requests',()=>{
 assert.throws(()=>inspectRequest(project(),{...selection(),revision:2},'test'),/过期/);
 assert.throws(()=>inspectRequest(project(),{...selection(),noteIds:['missing']},'test'),/不存在/);
 assert.throws(()=>validateProposal({...proposal,notes:[{...proposal.notes[0],start:.8}]},selection()),/格式/);
 assert.throws(()=>validateProposal({...proposal,notes:[{...proposal.notes[0],midi:128}]},selection()),/格式/);
});
test('prompt includes only active local musical selection, not project metadata',()=>{
 const prompt=buildPrompt(project(),selection(),'shorten');
 assert.ok(prompt.includes('shorten'));assert.ok(prompt.includes('selectedNotes'));assert.ok(!prompt.includes('/private/path'));assert.ok(!prompt.includes('"id":"n1"'));
});
test('localhost server rejects foreign origins and hides private files',async()=>{
 const f=await fixture();try{
  assert.equal((await f.request('/')).status,200);
  assert.equal((await f.request('/.runtime/secrets')).status,404);
  assert.equal((await f.request('/server.mjs')).status,404);
  assert.equal((await f.request('/api/status',{headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(f.url+'/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  const status=await (await f.request('/api/status')).json();assert.equal(status.auth,'not_checked');
 }finally{await f.cleanup();}
});
test('mock process returns bounded proposal, releases job and never applies project',async()=>{
 let spec;const execute=s=>{spec=s;return mockRunner()(s);};const f=await fixture({execute});try{
  const {response,body}=await submit(f);assert.equal(response.status,202,JSON.stringify(body));
  let job;for(let i=0;i<100;i++){job=await(await f.request('/api/ai/'+body.id)).json();if(job.status!=='running')break;await delay(10);}
  assert.equal(job.status,'done',JSON.stringify(job));assert.equal(job.proposal.notes[0].midi,62);
  assert.ok(!spec.cwd.startsWith(f.root));assert.ok(spec.cwd.includes('yakui-studio-'));assert.ok(spec.args.includes('read-only'));assert.ok(spec.args.includes('--ignore-user-config'));assert.equal(project().clips[0].notes[0].midi,60);
 }finally{await f.cleanup();}
});
test('malformed model candidate cannot escape selected time range',async()=>{
 const f=await fixture({execute:mockRunner({...proposal,notes:[{start:6,duration:.5,midi:62,velocity:.8}]})});try{
  const {body}=await submit(f);let job;for(let i=0;i<100;i++){job=await(await f.request('/api/ai/'+body.id)).json();if(job.status!=='running')break;await delay(10);}
  assert.equal(job.status,'error');assert.equal(job.proposal,undefined);
 }finally{await f.cleanup();}
});
test('cancel owned request; concurrent jobs are rejected',async()=>{
 const f=await fixture({execute:mockRunner(proposal,{wait:200})});try{
  const {body}=await submit(f);const another=await submit(f);assert.equal(another.response.status,429);
  const cancelled=await(await f.request('/api/ai/'+body.id,{method:'DELETE'})).json();assert.equal(cancelled.status,'cancelled');
 }finally{await f.cleanup();}
});
test('harmonic context uses selected clip-local time, excludes distant/muted tracks, caps and prioritizes bass',()=>{
 const p=project();p.clips[0].start=4;
 p.tracks.push({id:'bass',voice:'bass',name:'Private track path must not appear',mute:false,solo:false}, {id:'drums',voice:'hat',mute:false,solo:false}, {id:'muted',voice:'power_l',mute:true,solo:false});
 p.clips.push(
  {id:'low',trackId:'bass',name:'Private clip',start:3,length:4,notes:[{id:'b',start:0,duration:2,midi:36,velocity:.6}]},
  {id:'far',trackId:'bass',start:12,length:4,notes:[{id:'far-note',start:0,duration:1,midi:99,velocity:1}]},
  {id:'noise',trackId:'drums',start:4,length:4,notes:Array.from({length:100},(_,i)=>({id:'d'+i,start:i/200,duration:.1,midi:42,velocity:.4}))},
  {id:'mutedclip',trackId:'muted',start:4,length:4,notes:[{id:'m',start:0,duration:.5,midi:101,velocity:1}]}
 );
 const prompt=buildPrompt(p,selection(),'keep harmony');
 const data=JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1));
 assert.equal(data.harmonicContext.length,64);
 assert.deepEqual(data.harmonicContext[0],{voice:'bass',start:-1,duration:2,midi:36,velocity:.6});
 assert.ok(!data.harmonicContext.some(n=>n.midi===99||n.midi===101));
 assert.ok(!prompt.includes('Private track'));assert.ok(!prompt.includes('Private clip'));
});
