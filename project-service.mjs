import {mkdir, readFile, open, rename, unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateProject, totalBeats, applyProposal} from './core.mjs';
const clone = x => structuredClone(x);
const fail = (message,status=400) => {throw Object.assign(new Error(message),{status});};
const check = (ok,message) => {if(!ok)fail(message);};
const number = n => typeof n==='number'&&Number.isFinite(n);
const allowedPatch=(patch,keys)=>{check(patch&&typeof patch==='object'&&!Array.isArray(patch)&&Object.keys(patch).length>0,'Empty or invalid patch');check(Object.keys(patch).every(k=>keys.includes(k)),'Unsupported patch field');};
export function validateSelection(p,s) {
 if(s===null)return null;
 check(s&&typeof s==='object'&&!Array.isArray(s),'Invalid selection');
 const legacy=typeof s.clipId==='string',c=legacy?p.clips.find(c=>c.id===s.clipId):null;
 if(legacy)check(c,'Selected clip does not exist');
 const out=clone(s);out.revision=p.revision;
 for(const [key,items] of [['trackIds',p.tracks],['clipIds',p.clips],['sectionIds',p.sections??[]],['noteIds',c?.notes??[]]])if(s[key]!==undefined){check(Array.isArray(s[key])&&s[key].every(id=>typeof id==='string'&&items.some(x=>x.id===id)),`Invalid ${key}`);out[key]=[...new Set(s[key])];}
 const end=legacy?c.length:totalBeats(p);
 check(number(s.start)&&number(s.end)&&s.start>=0&&s.end>s.start&&s.end<=end,'Invalid selection range');
 if(legacy)out.noteIds??=[];
 return out;
}
function validate(p){try{validateProject(p);}catch(e){e.status??=400;throw e;}if(p.sections!==undefined){check(Array.isArray(p.sections)&&p.sections.length<=2048,'Invalid sections');const ids=new Set([...p.tracks,...p.clips,...p.clips.flatMap(c=>c.notes)].map(x=>x.id));for(const s of p.sections){check(s&&typeof s.id==='string'&&s.id&&!ids.has(s.id),'Invalid section ID');ids.add(s.id);check(typeof s.name==='string'&&s.name.length<=300&&number(s.start)&&number(s.end)&&s.start>=0&&s.end>s.start&&s.end<=totalBeats(p),'Invalid section');}}return p;}
function operate(p,op,s) {
 check(op&&typeof op.type==='string','Invalid operation');
 const clip=()=>{const c=p.clips.find(c=>c.id===op.clipId);check(c,'Clip does not exist');return c;};
 const scopeClip=(c,start=c.start,end=c.start+c.length,notes)=>{if(!s)return;if(s.clipId){check(c.id===s.clipId,'Outside selected clip');check(start>=c.start+s.start&&end<=c.start+s.end,'Outside selected range');if(s.noteIds?.length)check(notes&&notes.every(n=>s.noteIds.includes(n.id)),'Outside selected notes');}else{if(s.trackIds?.length)check(s.trackIds.includes(c.trackId),'Outside selected tracks');if(s.clipIds?.length)check(s.clipIds.includes(c.id),'Outside selected clips');check(!s.sectionIds?.length||(p.sections??[]).some(x=>s.sectionIds.includes(x.id)&&start>=x.start&&end<=x.end),'Outside selected sections');check(start>=s.start&&end<=s.end,'Outside selected range');}};
 switch(op.type){
 case 'renameProject':check(!s,'Project rename is outside selection');check(typeof op.title==='string','Invalid title');p.title=op.title;break;
 case 'updateTrack':{const t=p.tracks.find(t=>t.id===op.trackId);check(t,'Track does not exist');if(s)check(!s.clipId&&s.trackIds?.includes(t.id)&&!s.clipIds?.length&&!s.sectionIds?.length&&s.start===0&&s.end===totalBeats(p),'Track settings require whole-track selection');allowedPatch(op.patch,['gain','pan','wave','name','mute','solo','duty']);for(const k of ['mute','solo'])if(k in op.patch)check(typeof op.patch[k]==='boolean',`Invalid ${k}`);Object.assign(t,op.patch);break;}
 case 'updateNotes':{const c=clip();check(Array.isArray(op.noteIds)&&op.noteIds.length>0&&new Set(op.noteIds).size===op.noteIds.length,'Explicit note IDs required');const notes=op.noteIds.map(id=>{const n=c.notes.find(n=>n.id===id);check(n,'Note does not exist');return n;});check(!!op.patch!==!!op.delta,'Supply patch or delta');const patch=op.patch??op.delta;allowedPatch(patch,['start','duration','midi','velocity']);for(const n of notes){scopeClip(c,c.start+n.start,c.start+n.start+n.duration,[n]);for(const [k,v] of Object.entries(patch)){check(number(v),'Invalid note value');n[k]=op.delta?n[k]+v:v;}scopeClip(c,c.start+n.start,c.start+n.start+n.duration,[n]);n.tieFromPrevious=false;delete n.sourceId;}break;}
 case 'replaceNotes':{const c=clip();const selection=validateSelection(p,{clipId:c.id,start:op.start,end:op.end,noteIds:op.noteIds??[]});const affected=c.notes.filter(n=>selection.noteIds.length?selection.noteIds.includes(n.id):n.start>=selection.start&&n.start<selection.end);scopeClip(c,c.start+selection.start,c.start+selection.end,affected);try{applyProposal(p,selection,{summary:op.summary??'Replace notes',notes:op.notes});}catch(e){e.status??=400;throw e;}break;}
 case 'updateClip':{const c=clip();scopeClip(c);allowedPatch(op.patch,['start','name']);Object.assign(c,op.patch);scopeClip(c);break;}
 case 'addSection':case 'updateSection':case 'deleteSection':{p.sections??=[];let item=op.type==='addSection'?clone(op.section):p.sections.find(x=>x.id===op.sectionId);check(item,'Section does not exist');const scope=()=>{if(s)check(!s.clipId&&!s.trackIds?.length&&!s.clipIds?.length&&(!s.sectionIds?.length||s.sectionIds.includes(item.id))&&item.start>=s.start&&item.end<=s.end,'Outside selected sections');};scope();if(op.type==='addSection')p.sections.push(item);if(op.type==='updateSection'){allowedPatch(op.patch,['name','start','end']);Object.assign(item,op.patch);scope();}if(op.type==='deleteSection')p.sections=p.sections.filter(x=>x.id!==item.id);break;}
 default:fail(`Unsupported operation: ${op.type}`);
 }
}
export async function createProjectService({directory,initialProject}) {
 check(typeof directory==='string'&&directory,'Persistence directory required');await mkdir(directory,{recursive:true});const path=join(directory,'project-state.json'),lockPath=join(directory,'project-state.lock'),token=randomUUID();let state;
 // Exclusive creation also protects separate Node processes. Never reclaim a lock
 // automatically: PID reuse and stale-lock removal races can admit two writers.
 let lock;
 try{lock=await open(lockPath,'wx',0o600);}catch(e){if(e.code!=='EEXIST')throw e;let owner;try{owner=JSON.parse(await readFile(lockPath,'utf8'));}catch{}throw Object.assign(new Error(`Project directory is already locked${owner?.pid?` by PID ${owner.pid}`:''}: ${directory}. Close its studio first. After an unclean exit, verify the owner has stopped before removing ${lockPath}.`),{status:409,code:'PROJECT_LOCKED'});}
 try{await lock.writeFile(JSON.stringify({pid:process.pid,token}));await lock.sync();await lock.close();}catch(e){await lock.close().catch(()=>{});await unlink(lockPath).catch(()=>{});throw e;}
 const release=async()=>{try{const owner=JSON.parse(await readFile(lockPath,'utf8'));if(owner.token!==token)throw new Error('Project lock ownership changed; refusing to remove another lock');await unlink(lockPath);}catch(e){if(e.code!=='ENOENT')throw e;}};
 const persist=async next=>{const temp=`${path}.${randomUUID()}.tmp`;let f;try{f=await open(temp,'wx',0o600);await f.writeFile(JSON.stringify(next));await f.sync();await f.close();f=null;await rename(temp,path);}catch(e){await f?.close().catch(()=>{});await unlink(temp).catch(()=>{});throw e;}};
 try{try{state=JSON.parse(await readFile(path,'utf8'));check(state.format===1&&Array.isArray(state.past)&&Array.isArray(state.future)&&Array.isArray(state.receipts),'Invalid persisted state');validate(state.project);validateSelection(state.project,state.selection);for(const x of [...state.past,...state.future])validate(x.project);}catch(e){if(e.code!=='ENOENT')throw e;state={format:1,project:clone(validate(await initialProject)),selection:null,past:[],future:[],receipts:[]};await persist(state);}}catch(e){await release();throw e;}
 let closing=false,closePromise;
 const ensureOpen=()=>{if(closing)fail('Project service is closed',503);};
 let queue=Promise.resolve();const snapshot=s=>clone({project:s.project,selection:s.selection,canUndo:!!s.past.length,canRedo:!!s.future.length});
 const run=async(kind,request,change)=>{ensureOpen();const task=queue.then(async()=>{check(request&&typeof request==='object','Request required');const fingerprint=JSON.stringify({kind,request});if(request.operationId!==undefined){check(typeof request.operationId==='string'&&request.operationId.length>0&&request.operationId.length<=200,'Invalid operationId');const receipt=state.receipts.find(r=>r.id===request.operationId);if(receipt){if(receipt.fingerprint!==fingerprint)fail('operationId already used for another request',409);return clone(receipt.result);}}
 if(request.projectId!==state.project.id||request.baseRevision!==state.project.revision)fail('Project changed; read the current project and retry',409);
 const next=clone(state);await change(next);validate(next.project);const result=snapshot(next);if(request.operationId)next.receipts.push({id:request.operationId,fingerprint,result});next.receipts=next.receipts.slice(-30);await persist(next);state=next;return result;});queue=task.catch(()=>{});return task;};
 const edit=(next,label,project)=>{next.past.push({project:next.project,label});next.past=next.past.slice(-30);next.future=[];project.revision=next.project.revision+1;next.project=project;next.selection=null;};
 return {
 read:async()=>{ensureOpen();await queue;return snapshot(state);},
 close:()=>{if(!closePromise){closing=true;closePromise=queue.then(release);}return closePromise;},
 replace:r=>run('replace',r,next=>edit(next,r.label??'Replace project',clone(validate(r.project)))),
 setSelection:r=>run('selection',r,next=>{next.selection=validateSelection(next.project,r.selection);}),
 apply:r=>run('apply',r,next=>{check(typeof r.operationId==='string'&&r.operationId,'operationId required');check(Array.isArray(r.operations)&&r.operations.length>0&&r.operations.length<=1000,'Invalid operations');const p=clone(next.project),s=r.selection===undefined?null:validateSelection(p,r.selection);if(r.selection?.revision!==undefined)check(r.selection.revision===p.revision,'Stale selection');for(const op of r.operations)operate(p,op,s);validate(p);edit(next,r.label??'Agent edit',p);}),
 undo:r=>run('undo',r,next=>{check(next.past.length,'Nothing to undo');const entry=next.past.pop();next.future.push({project:next.project,label:entry.label});next.project=clone(entry.project);next.project.revision=state.project.revision+1;next.selection=null;}),
 redo:r=>run('redo',r,next=>{check(next.future.length,'Nothing to redo');const entry=next.future.pop();next.past.push({project:next.project,label:entry.label});next.project=clone(entry.project);next.project.revision=state.project.revision+1;next.selection=null;})
 };
}
