// Pure project model: beats in the arrangement, local beats inside every clip.
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `y-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const copy = value => structuredClone(value);
const finite = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
export const beatsPerBar = p => p.meter[0] * 4 / p.meter[1];
export const totalBeats = p => p.bars * beatsPerBar(p);
const colors = ['#a995bb','#7ca4bb','#91ad79','#c2b07d','#9b89ab','#bca3b7','#809aad','#b39a80','#8aa198','#879b9d','#afb18a','#ad958a','#b7a77f'];
const names = {lead:'主旋律',answer:'高音回应',bass:'三角贝斯',arp:'琶音',power_l:'和声 L',power_r:'和声 R',octave:'低八度',kick:'底鼓',snare:'军鼓',hat:'闭镲',openhat:'开镲',crash:'吊镲',tom:'通鼓'};
const drumVoices = new Set(['kick','snare','hat','openhat','crash','tom']);
export function validateProject(p) {
  assert(p && p.version === 1, '不支持的工程版本');
  assert(typeof p.id === 'string' && typeof p.title === 'string' && p.title.length <= 300, '工程标识或名称无效');
  assert(finite(p.bpm,20,400), 'BPM 必须在 20–400 之间');
  assert(Array.isArray(p.meter) && p.meter.length === 2 && Number.isInteger(p.meter[0]) && finite(p.meter[0],1,32) && [1,2,4,8,16,32].includes(p.meter[1]), '拍号无效');
  assert(Number.isInteger(p.bars) && finite(p.bars,1,1024), '小节数必须是 1–1024 的整数');
  assert(Number.isSafeInteger(p.revision) && p.revision >= 0, '工程修订号无效');
  assert(Array.isArray(p.tracks) && p.tracks.length <= 128 && Array.isArray(p.clips) && p.clips.length <= 10000, '轨道或片段数量无效');
  const tracks = new Set(), ids = new Set(); let count = 0;
  const unique = id => { assert(typeof id === 'string' && id.length > 0 && !ids.has(id), '重复或缺少 ID'); ids.add(id); };
  for (const t of p.tracks) {
    unique(t.id); tracks.add(t.id);
    assert(typeof t.name === 'string' && typeof t.voice === 'string', '轨道名称或声部无效');
    assert(finite(t.gain,0,2) && finite(t.pan,-1,1), '轨道音量或声像无效');
    assert(['pulse','triangle','sine','sawtooth','square','noise'].includes(t.wave), '不支持的波形');
    assert(finite(t.duty,.01,.99), '脉冲占空比无效');
  }
  for (const c of p.clips) {
    unique(c.id); assert(tracks.has(c.trackId), '片段所属轨道不存在');
    assert(typeof c.name === 'string' && finite(c.start,0,totalBeats(p)) && finite(c.length,.001,totalBeats(p)) && c.start+c.length <= totalBeats(p)+1e-7, '片段超出工程范围');
    assert(Array.isArray(c.notes), '片段音符无效'); count += c.notes.length;
    for (const n of c.notes) {
      unique(n.id);
      assert(finite(n.start,0,c.length) && finite(n.duration,.001,c.length) && n.start+n.duration <= c.length+1e-7, '音符超出片段范围');
      assert(Number.isInteger(n.midi) && finite(n.midi,0,127) && finite(n.velocity,0,2), '音高或力度无效');
    }
  }
  assert(count <= 100000, '工程音符过多'); return p;
}
export function importScore(score) {
  if (score?.version === 1 && Array.isArray(score.tracks) && Array.isArray(score.clips)) return validateProject(copy(score));
  assert(score && Array.isArray(score.events), '请导入 Yakui 工程或包含 events 的事件谱');
  const p = {version:1,id:uid(),title:score.title || 'Untitled',bpm:score.bpm ?? 95,meter:score.meter ?? [4,4],bars:score.bars ?? Math.max(1,Math.ceil((score.beats ?? 16)/4)),revision:0,tracks:[],clips:[],sourceMetadata:{...copy(score),events:undefined}};
  const end = totalBeats(p), bar = beatsPerBar(p);
  const boundaries = new Set([0,end]);
  for (const s of score.sections ?? []) if (Array.isArray(s.bars)) {
    boundaries.add(Math.max(0,Math.min(end,(s.bars[0]-1)*bar)));
    boundaries.add(Math.max(0,Math.min(end,s.bars[1]*bar)));
  }
  // Keep unsegmented imports immediately editable in four-bar regions.
  if (boundaries.size === 2) for (let x=bar*4;x<end;x+=bar*4) boundaries.add(x);
  const bounds = [...boundaries].sort((a,b)=>a-b);
  const voices = [...new Set(score.events.map(e=>e.voice ?? 'lead'))];
  for (const [index,voice] of voices.entries()) {
    const settings=score.voices?.[voice] ?? {};
    const t={id:uid(),name:names[voice] ?? voice,voice,color:colors[index%colors.length],mute:false,solo:false,gain:.7,pan:settings.pan ?? (voice==='power_l'?-.65:voice==='power_r'?.65:0),wave:drumVoices.has(voice)?'noise':voice==='bass'?'triangle':'pulse',duty:settings.duty ?? (voice==='answer'||voice==='arp'?.125:.25),sourceSettings:copy(settings)};
    p.tracks.push(t);
    const sourceNotes=score.events.filter(e=>(e.voice??'lead')===voice).map(e=>({...copy(e),sourceId:uid()}));
    for (let i=0;i<bounds.length-1;i++) {
      const start=bounds[i], length=bounds[i+1]-start;
      const section=(score.sections??[]).find(s=>Array.isArray(s.bars) && start >= (s.bars[0]-1)*bar && start < s.bars[1]*bar);
      const notes=[];
      for (const e of sourceNotes) {
        assert(finite(e.start,0,end) && finite(e.duration,.001,end), '事件时间无效');
        const a=Math.max(start,e.start), b=Math.min(start+length,e.start+e.duration,end);
        if(b-a < .001) continue;
        notes.push({...e,id:uid(),start:a-start,duration:b-a,midi:Math.round(e.midi??60),velocity:e.velocity??1,tieFromPrevious:a>e.start});
      }
      if(notes.length) p.clips.push({id:uid(),trackId:t.id,name:section?.name ?? `${t.name} ${i+1}`,start,length,notes});
    }
  }
  return validateProject(p);
}
export function flattenProject(p) {
  validateProject(p);
  const tracks=new Map(p.tracks.map(t=>[t.id,t])), events=[];
  for(const c of p.clips) for(const n of c.notes) {
    const t=tracks.get(c.trackId);
    events.push({...copy(n),voice:t.voice,trackId:t.id,start:c.start+n.start,gain:t.gain,pan:n.pan??t.pan,wave:t.wave,duty:n.duty??t.duty,mute:!!t.mute,solo:!!t.solo});
  }
  events.sort((a,b)=>a.start-b.start || a.midi-b.midi);
  // Rejoin notes split by a region boundary, but not independently edited parts.
  const joined=[], tails=new Map();
  for(const e of events) {
    const key=`${e.trackId}:${e.sourceId}`, prev=tails.get(key);
    if(e.sourceId && e.tieFromPrevious && prev && Math.abs(prev.start+prev.duration-e.start)<1e-7 && prev.midi===e.midi && prev.velocity===e.velocity && prev.duty===e.duty) prev.duration+=e.duration;
    else { joined.push(e); if(e.sourceId) tails.set(key,e); }
  }
  return {...copy(p.sourceMetadata??{}),title:p.title,bpm:p.bpm,meter:copy(p.meter),bars:p.bars,beats:totalBeats(p),seconds:totalBeats(p)*60/p.bpm,voices:Object.fromEntries(p.tracks.map(t=>[t.voice,{...t.sourceSettings,gain:t.gain,pan:t.pan,duty:t.duty,wave:t.wave}])),events:joined};
}
export function createStore(initial) {
  let p=copy(validateProject(initial)), revision=p.revision; const past=[], future=[], listeners=new Set();
  const notify=label=>{for(const fn of listeners) fn(p,label);};
  return {get project(){return p;},get canUndo(){return !!past.length;},get canRedo(){return !!future.length;},
    commit(label,fn){const next=copy(p);fn(next);next.revision=revision+1;validateProject(next);past.push({project:p,label});if(past.length>100)past.shift();future.length=0;p=next;revision++;notify(label);return p;},
    undo(){if(!past.length)return false;const previous=past.pop();future.push({project:p,label:previous.label});p=copy(previous.project);p.revision=++revision;notify(`撤销 ${previous.label}`);return true;},
    redo(){if(!future.length)return false;const next=future.pop();past.push({project:p,label:next.label});p=copy(next.project);p.revision=++revision;notify(`重做 ${next.label}`);return true;},
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}};
}
const clipById=(p,id)=>{const c=p.clips.find(c=>c.id===id);assert(c,'片段不存在');return c;};
export function splitClip(p,clipId,localBeat) {
  const c=clipById(p,clipId);assert(finite(localBeat,.001,c.length-.001),'切分位置必须在片段内部');
  const right={...copy(c),id:uid(),name:`${c.name} B`,start:c.start+localBeat,length:c.length-localBeat,notes:[]};
  const left=[];
  for(const n of c.notes){
    if(n.start<localBeat)left.push({...copy(n),duration:Math.min(n.duration,localBeat-n.start)});
    if(n.start+n.duration>localBeat){const a=Math.max(localBeat,n.start);right.notes.push({...copy(n),id:uid(),start:a-localBeat,duration:n.start+n.duration-a,tieFromPrevious:n.start<localBeat || n.tieFromPrevious,sourceId:n.sourceId??n.id});}
    if(n.start<localBeat && n.start+n.duration>localBeat)left[left.length-1].sourceId=n.sourceId??n.id;
  }
  c.length=localBeat;c.notes=left;p.clips.push(right);return right;
}
export function duplicateClip(p,clipId) {
  const c=clipById(p,clipId), start=c.start+c.length;
  const needed=Math.ceil((start+c.length)/beatsPerBar(p));if(needed>p.bars)p.bars=needed;
  const clone={...copy(c),id:uid(),name:`${c.name} copy`,start,notes:c.notes.map(n=>({...copy(n),id:uid(),sourceId:uid(),tieFromPrevious:false}))};p.clips.push(clone);return clone;
}
export function moveClip(p,clipId,start) {const c=clipById(p,clipId);assert(finite(start,0,totalBeats(p)-c.length),'片段移动超出工程范围');c.start=start;return c;}
export function getSelection(p,clipId,noteIds=[],start=0,end) {
  const c=clipById(p,clipId);end ??= c.length;
  assert(finite(start,0,c.length) && finite(end,start,c.length) && end>start,'选区范围无效');
  assert(Array.isArray(noteIds) && noteIds.every(id=>c.notes.some(n=>n.id===id)), '选中的音符已不存在');
  const notes=c.notes.filter(n=>noteIds.length?noteIds.includes(n.id):n.start>=start && n.start<end);
  if(noteIds.length){start=Math.min(...notes.map(n=>n.start));end=Math.max(...notes.map(n=>n.start+n.duration));}
  return {clipId,noteIds:[...new Set(noteIds)],start,end,revision:p.revision,notes:copy(notes)};
}
export function applyProposal(p,selection,proposal) {
  assert(selection?.revision===p.revision,'工程已修改，请重新生成 AI 候选');
  const c=clipById(p,selection.clipId);
  assert(finite(selection.start,0,c.length) && finite(selection.end,selection.start,c.length) && selection.end>selection.start,'选区范围无效');
  assert(Array.isArray(selection.noteIds) && selection.noteIds.every(id=>c.notes.some(n=>n.id===id)),'选中的音符已不存在');
  assert(proposal && typeof proposal.summary==='string' && Array.isArray(proposal.notes) && proposal.notes.length<=4096,'AI 候选格式无效');
  const notes=proposal.notes.map(n=>{
    assert(finite(n.start,selection.start,selection.end) && finite(n.duration,.001,selection.end-selection.start) && n.start+n.duration<=selection.end+1e-7,'AI 音符超出选区');
    assert(Number.isInteger(n.midi) && finite(n.midi,0,127) && finite(n.velocity,0,2),'AI 音高或力度无效');
    return {id:uid(),start:n.start,duration:n.duration,midi:n.midi,velocity:n.velocity};
  });
  c.notes=c.notes.filter(n=>selection.noteIds.length?!selection.noteIds.includes(n.id):!(n.start>=selection.start && n.start<selection.end));
  c.notes.push(...notes);c.notes.sort((a,b)=>a.start-b.start);return c;
}
