import {flattenProject,validateProject} from './core.mjs';
const ascii=s=>Array.from(s,c=>c.charCodeAt(0));
const be=(n,k)=>Array.from({length:k},(_,i)=>(n>>((k-i-1)*8))&255);
const vlq=n=>{n=Math.max(0,Math.round(n));const b=[n&127];while(n>>=7)b.unshift((n&127)|128);return b;};
const chunk=(name,data)=>[...ascii(name),...be(data.length,4),...data];
const text=s=>Array.from(new TextEncoder().encode(s));
const meta=(type,data)=>[255,type,...vlq(data.length),...data];
const drum={kick:36,snare:38,hat:42,openhat:46,crash:49,tom:45};
function trackChunk(events){events.sort((a,b)=>a.tick-b.tick||a.order-b.order);let prev=0,out=[];for(const e of events){out.push(...vlq(e.tick-prev),...e.bytes);prev=e.tick;}out.push(0,255,47,0);return chunk('MTrk',out);}
export function midiBytes(project){
 validateProject(project);const ppq=480,tempo=Math.round(60000000/project.bpm);
 const tracks=[trackChunk([{tick:0,order:0,bytes:meta(3,text(project.title))},{tick:0,order:1,bytes:meta(81,be(tempo,3))},{tick:0,order:2,bytes:meta(88,[project.meter[0],Math.log2(project.meter[1]),24,8])}])];
 const events=flattenProject(project).events;let channelIndex=0;
 for(const t of project.tracks){const percussion=Object.hasOwn(drum,t.voice);let channel=9;if(!percussion){channel=channelIndex++%15;if(channel>=9)channel++;}
  const es=[{tick:0,order:0,bytes:meta(3,text(t.name))},{tick:0,order:1,bytes:[176|channel,10,Math.round((t.pan+1)*63.5)]}];
  for(const n of events.filter(n=>n.trackId===t.id)){const start=Math.round(n.start*ppq),end=Math.max(start+1,Math.round((n.start+n.duration)*ppq)),pitch=percussion?drum[t.voice]:n.midi;es.push({tick:start,order:3,bytes:[144|channel,pitch,Math.max(1,Math.min(127,Math.round(n.velocity*100)))]},{tick:end,order:2,bytes:[128|channel,pitch,0]});}
  tracks.push(trackChunk(es));
 }
 return Uint8Array.from([...chunk('MThd',[0,1,...be(tracks.length,2),...be(ppq,2)]),...tracks.flat()]);
}
export const exportMidi=project=>new Blob([midiBytes(project)],{type:'audio/midi'});
