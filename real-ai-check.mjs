import {readFile,writeFile} from 'node:fs/promises';
import {importScore,getSelection,applyProposal} from './core.mjs';
const project=importScore(JSON.parse(await readFile(new URL('./data/example-score.json',import.meta.url))));
const track=project.tracks.find(t=>t.voice==='lead'),clip=project.clips.find(c=>c.trackId===track.id);
const selection=getSelection(project,clip.id,clip.notes.slice(0,4).map(n=>n.id));
const base='http://127.0.0.1:5240';
const status=await fetch(base+'/api/status').then(r=>r.json());console.log(status);
const res=await fetch(base+'/api/ai',{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({project,selection,instruction:'保留这四个音符的音高和起点，将每个时值缩短为原来的 80%，力度调整成强弱交替 0.85、0.55，形成短促芯片乐句。只修改选中音符。'})});
const started=await res.json();if(!res.ok)throw Error(JSON.stringify(started));console.log('job',started.id);
let job;
for(let i=0;i<200;i++){job=await fetch(base+'/api/ai/'+started.id).then(r=>r.json());if(job.status!=='running')break;await new Promise(r=>setTimeout(r,1000));}
if(job.status!=='done')throw Error(JSON.stringify(job));
const before=JSON.stringify(project.clips.filter(c=>c.id!==clip.id));const next=structuredClone(project);applyProposal(next,selection,job.proposal);
if(before!==JSON.stringify(next.clips.filter(c=>c.id!==clip.id)))throw Error('unrelated clips changed');
await writeFile(new URL('./evidence/real-ai.json',import.meta.url),JSON.stringify({verifiedAt:new Date().toISOString(),selection,proposal:job.proposal,unrelatedClipsPreserved:true},null,2));console.log(JSON.stringify(job,null,2));
