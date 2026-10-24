import {flattenProject,validateProject,uid,totalBeats} from './core.mjs';
import {tempoPoints} from './timeline.mjs';
import parseMidi from './vendor/midi-file/midi-parser.mjs';
import writeMidi from './vendor/midi-file/midi-writer.mjs';
const drum={kick:36,snare:38,hat:42,openhat:46,crash:49,tom:45};
const text=s=>String.fromCharCode(...new TextEncoder().encode(s));
const decode=s=>{try{return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(s,c=>c.charCodeAt(0)));}catch{return s;}};
const mapPoints=events=>[...new Map(events.sort((a,b)=>a.beat-b.beat).map(e=>[e.beat,e])).values()];
function delta(events,endTick=0){
  events.sort((a,b)=>a.tick-b.tick||a.order-b.order);let previous=0;
  const result=events.map(({tick,order,beat,...event})=>{const deltaTime=tick-previous;previous=tick;return {...event,deltaTime};});
  result.push({deltaTime:Math.max(0,endTick-previous),type:'endOfTrack',meta:true});return result;
}
export function importMidi(bytes,{title}={}){
  if(!(bytes instanceof Uint8Array)||bytes.length>32*1024*1024)throw new Error('MIDI 必须是最大 32 MB 的 Uint8Array');
  let data;try{data=parseMidi(bytes);}catch(e){throw new Error(`无法读取 MIDI: ${e.message??e}`);}
  const {header,tracks}=data,ppq=header.ticksPerBeat;
  if(![0,1].includes(header.format))throw new Error('不支持 MIDI Format 2（独立序列）；请转换为 Format 0/1');
  if(!ppq)throw new Error('不支持 SMPTE 时间分辨率；请转换为 PPQ MIDI');
  if(header.numTracks!==tracks.length||!tracks.length)throw new Error('MIDI 轨道缺失');
  const p={version:1,id:uid(),title:title??'Imported MIDI',bpm:120,meter:[4,4],bars:1,revision:0,tracks:[],clips:[],tempoMap:[],meterMap:[],warnings:[],midi:{ppq,format:header.format}};
  let endBeat=0,hasControllers=false,hasExtras=false;
  tracks.forEach((events,index)=>{
    const t={id:uid(),name:`MIDI ${index+1}`,voice:`midi_${index}`,color:'#91ad79',mute:false,solo:false,gain:.7,pan:0,wave:'pulse',duty:.25,midiEvents:[],midiTrackIndex:index};
    let tick=0;const active=new Map(),notes=[];
    for(const [order,event] of events.entries()){
      tick+=event.deltaTime;const beat=tick/ppq;endBeat=Math.max(endBeat,beat);
      const {deltaTime,...e}=event;
      if(e.type==='setTempo'){if(!e.microsecondsPerBeat)throw new Error('MIDI tempo 不能为零');p.tempoMap.push({beat,bpm:60000000/e.microsecondsPerBeat});continue;}
      if(e.type==='timeSignature'){p.meterMap.push({beat,meter:[e.numerator,e.denominator],metronome:e.metronome,thirtyseconds:e.thirtyseconds});continue;}
      if(e.type==='endOfTrack')continue;
      if(e.type==='trackName'){t.name=decode(e.text);if(index===0&&!title)p.title=t.name;continue;}
      if(e.type==='noteOn'){
        const key=`${e.channel}:${e.noteNumber}`,q=active.get(key)??[];
        q.push({id:uid(),start:beat,midi:e.noteNumber,velocity:e.velocity/100,midiChannel:e.channel,midiOrder:order});active.set(key,q);
      } else if(e.type==='noteOff'){
        const key=`${e.channel}:${e.noteNumber}`,q=active.get(key),n=q?.shift();
        if(!n){p.warnings.push(`轨道 ${index+1} 在 ${beat} 拍存在无对应 note-on 的 note-off`);continue;}
        n.duration=beat-n.start;n.midiReleaseVelocity=e.velocity;n.midiOffOrder=order;
        if(n.duration<.001){n.duration=.001;p.warnings.push('零长或极短 MIDI 音符已延长至 0.001 拍');}
        endBeat=Math.max(endBeat,n.start+n.duration);notes.push(n);
      }else{t.midiEvents.push({...e,beat,order});if(['programChange','controller','pitchBend','noteAftertouch','channelAftertouch'].includes(e.type))hasControllers=true;else hasExtras=true;}
    }
    for(const q of active.values())for(const n of q){n.duration=Math.max(.001,tick/ppq-n.start);notes.push(n);endBeat=Math.max(endBeat,n.start+n.duration);p.warnings.push(`轨道 ${index+1} 未结束音符已在轨道结尾截断`);}
    // Pure conductor tracks carry global metadata, not playable instruments.
    // Retain any other metadata for re-export on the conductor track.
    if(!notes.length&&!t.midiEvents.some(e=>e.channel!==undefined)){
      p.midi.conductorEvents??=[];p.midi.conductorEvents.push(...t.midiEvents);
      return;
    }
    p.tracks.push(t);
    if(notes.length)p.clips.push({id:uid(),trackId:t.id,name:t.name,start:0,length:notes.reduce((end,n)=>Math.max(end,n.start+n.duration),0),notes});
  });
  p.tempoMap=mapPoints(p.tempoMap);p.meterMap=mapPoints(p.meterMap);
  if(p.tempoMap[0]?.beat===0)p.bpm=Math.max(20,Math.min(400,p.tempoMap[0].bpm));
  if(p.meterMap[0]?.beat===0){const m=p.meterMap[0].meter;if(m[0]<=32&&m[1]<=32)p.meter=m;}
  p.bars=Math.max(1,Math.ceil(endBeat/(p.meter[0]*4/p.meter[1])));
  p.warnings.push('MIDI 使用芯片合成器近似预听；原始乐器音色与鼓组不还原。');
  if(hasControllers)p.warnings.push('Program、CC、弯音及触后事件已保留并随 MIDI 导出；当前预听不执行这些事件（含延音踏板）。');
  if(hasExtras)p.warnings.push('其他 MIDI 元数据 / SysEx 已保留用于导出，预听不执行。');
  p.warnings=[...new Set(p.warnings)];return validateProject(p);
}
export function midiBytes(project){
  validateProject(project);const ppq=project.midi?.ppq??480,events=flattenProject(project).events;
  const conductor=[{tick:0,order:-3,type:'trackName',text:text(project.title),meta:true},...tempoPoints(project).map(e=>({tick:Math.round(e.beat*ppq),order:-2,type:'setTempo',meta:true,microsecondsPerBeat:Math.round(60000000/e.bpm)})),...mapPoints([{beat:0,meter:project.meter},...(project.meterMap??[])]).map(e=>({tick:Math.round(e.beat*ppq),order:-1,type:'timeSignature',meta:true,numerator:e.meter[0],denominator:e.meter[1],metronome:e.metronome??24,thirtyseconds:e.thirtyseconds??8}))];
  for(const e of project.midi?.conductorEvents??[])conductor.push({...e,tick:Math.round(e.beat*ppq)});
  const tracks=[delta(conductor,Math.round(totalBeats(project)*ppq))];let channelIndex=0;
  for(const t of project.tracks){
    const percussion=Object.hasOwn(drum,t.voice);let channel=9;if(!percussion){channel=channelIndex++%15;if(channel>=9)channel++;}
    const es=[{tick:0,order:-3,type:'trackName',meta:true,text:text(t.name)}];
    if(!t.midiEvents)es.push({tick:0,order:-1,type:'controller',channel,controllerType:10,value:Math.round((t.pan+1)*63.5)});
    for(const e of t.midiEvents??[])es.push({...e,tick:Math.round(e.beat*ppq)});
    for(const n of events.filter(n=>n.trackId===t.id)){
      const start=Math.round(n.start*ppq),end=Math.max(start+1,Math.round((n.start+n.duration)*ppq)),pitch=percussion?drum[t.voice]:n.midi,ch=n.midiChannel??channel;
      es.push({tick:start,order:n.midiOrder??3,type:'noteOn',channel:ch,noteNumber:pitch,velocity:Math.max(1,Math.min(127,Math.round(n.velocity*100)))},{tick:end,order:n.midiOffOrder??2,type:'noteOff',channel:ch,noteNumber:pitch,velocity:n.midiReleaseVelocity??0});
    }
    tracks.push(delta(es));
  }
  return Uint8Array.from(writeMidi({header:{format:1,ticksPerBeat:ppq},tracks}));
}
export const exportMidi=project=>new Blob([midiBytes(project)],{type:'audio/midi'});
