// Arrangement positions are quarter-note beats, independent of time signatures.
export function tempoPoints(project) {
  const points=[{beat:0,bpm:project.bpm},...(project.tempoMap??[])];
  const unique=new Map(points.map(p=>[p.beat,p]));
  return [...unique.values()].sort((a,b)=>a.beat-b.beat);
}
export function beatToSeconds(project,beat) {
  if(!Number.isFinite(beat)||beat<0)throw new Error('Beat must be non-negative');
  const points=tempoPoints(project);let seconds=0;
  for(let i=0;i<points.length;i++){
    const p=points[i],end=Math.min(beat,points[i+1]?.beat??beat);
    if(end>p.beat)seconds+=(end-p.beat)*60/p.bpm;
    if(end===beat)break;
  }
  return seconds;
}
export function secondsToBeat(project,seconds) {
  if(!Number.isFinite(seconds)||seconds<0)throw new Error('Seconds must be non-negative');
  const points=tempoPoints(project);let remaining=seconds;
  for(let i=0;i<points.length;i++){
    const p=points[i],span=((points[i+1]?.beat??Infinity)-p.beat)*60/p.bpm;
    if(remaining<=span)return p.beat+remaining*p.bpm/60;
    remaining-=span;
  }
}
export const durationSeconds=(project,start,end)=>beatToSeconds(project,end)-beatToSeconds(project,start);

// A signature change begins a new bar; a preceding partial bar counts as one.
export function meterSegments(project) {
  const points=[...new Map([{beat:0,meter:project.meter},...(project.meterMap??[])].map(e=>[e.beat,e])).values()].sort((a,b)=>a.beat-b.beat);
  let bar=1;
  return points.map((point,i)=>{
    const unit=4/point.meter[1],length=point.meter[0]*unit,end=points[i+1]?.beat??Infinity;
    const segment={...point,bar,unit,length,end};bar+=Math.ceil((end-point.beat)/length-1e-9);return segment;
  });
}
export function meterPosition(project,beat) {
  const segments=meterSegments(project),s=segments.find(s=>beat<s.end)??segments.at(-1);
  const offset=Math.max(0,beat-s.beat),bars=Math.floor(offset/s.length+1e-9),within=Math.max(0,offset-bars*s.length)/s.unit;
  return {bar:s.bar+bars,beat:Math.floor(within+1e-9)+1,tick:Math.max(0,Math.floor((within-Math.floor(within+1e-9))*960+1e-6)),meter:s.meter};
}
export function meterGrid(project,start,end,{barsOnly=false}={}) {
  const result=[];
  for(const s of meterSegments(project)){
    if(s.beat>=end)break;
    const step=barsOnly?s.length:s.unit,first=Math.max(0,Math.ceil((start-s.beat)/step-1e-9));
    for(let i=first;s.beat+i*step<Math.min(end,s.end)-1e-9;i++){
      const beat=s.beat+i*step,isBar=barsOnly||i%s.meter[0]===0;
      result.push({beat,bar:s.bar+Math.floor(i*step/s.length+1e-9),isBar,meter:s.meter,length:Math.min(step,s.end-beat,end-beat)});
    }
  }
  return result;
}
export function setInitialTempo(project,bpm) {
  if(!Number.isFinite(bpm)||bpm<20||bpm>400)throw new Error('BPM 必须在 20–400 之间');
  project.bpm=bpm;
  if(project.tempoMap?.length)project.tempoMap=[{beat:0,bpm},...project.tempoMap.filter(e=>e.beat!==0)];
  return project;
}
