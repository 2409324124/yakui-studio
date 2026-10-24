import {beatToSeconds,secondsToBeat,durationSeconds} from './timeline.mjs';
import {flattenProject,totalBeats,validateProject} from './core.mjs';
const noiseCache=new WeakMap(), pulseCache=new WeakMap();
const drummers=new Set(['kick','snare','hat','openhat','crash','tom']);
const voiceGain={lead:.13,answer:.09,bass:.20,arp:.07,power_l:.065,power_r:.065,octave:.075,kick:.30,snare:.19,hat:.07,openhat:.07,crash:.08,tom:.19};
function noise(context){
  if(noiseCache.has(context))return noiseCache.get(context);
  const b=context.createBuffer(1,context.sampleRate*2,context.sampleRate),a=b.getChannelData(0);let x=0x4f35;
  for(let i=0;i<a.length;i++){a[i]=(x&1)?1:-1;x=(x>>>1)|(((x^(x>>>1))&1)<<14);}
  noiseCache.set(context,b);return b;
}
function pulse(context,duty){
  let cache=pulseCache.get(context);if(!cache){cache=new Map();pulseCache.set(context,cache);}
  const key=Math.round(duty*1000);if(cache.has(key))return cache.get(key);
  const real=new Float32Array(65),imag=new Float32Array(65);
  for(let n=1;n<65;n++){real[n]=2*Math.sin(2*Math.PI*n*duty)/(Math.PI*n);imag[n]=2*(1-Math.cos(2*Math.PI*n*duty))/(Math.PI*n);}
  const w=context.createPeriodicWave(real,imag);cache.set(key,w);return w;
}
function output(context){
  const master=context.createGain();master.gain.value=.55;
  const limiter=context.createDynamicsCompressor();limiter.threshold.value=-8;limiter.knee.value=8;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.12;
  master.connect(limiter);limiter.connect(context.destination);return master;
}
function schedule(context,destination,e,when,duration,offset=0,registry){
  if(duration<=0 || e.velocity<=0 || e.gain===0)return;
  const amp=context.createGain(), pan=context.createStereoPanner();pan.pan.value=e.pan??0;
  amp.connect(pan);pan.connect(destination);
  const isDrum=drummers.has(e.voice)||e.wave==='noise';
  const level=(voiceGain[e.voice]??.12)*(e.gain??.7)*e.velocity;
  const release=Math.min(.025,duration*.3), attack=Math.min(.004,duration*.2), finish=when+duration;
  amp.gain.setValueAtTime(0,when);
  amp.gain.linearRampToValueAtTime(level*(offset>0?.68:1),when+attack);
  if(isDrum){amp.gain.exponentialRampToValueAtTime(Math.max(.0001,level*.025),Math.max(when+attack,finish-release));}
  else {amp.gain.linearRampToValueAtTime(level*.65,Math.max(when+attack,finish-release));}
  amp.gain.linearRampToValueAtTime(0,finish);
  const sources=[]; const hz=440*Math.pow(2,(e.midi-69)/12);
  const osc=(type,freq,gain=1)=>{
    const s=context.createOscillator();
    if(type==='pulse')s.setPeriodicWave(pulse(context,e.duty??.25));else s.type=type;
    s.frequency.setValueAtTime(freq,when);
    const g=context.createGain();g.gain.value=gain;s.connect(g);g.connect(amp);sources.push(s);return s;
  };
  const ns=(cutoff,type,gain=1)=>{
    const s=context.createBufferSource();s.buffer=noise(context);s.loop=true;const f=context.createBiquadFilter();f.type=type;f.frequency.value=cutoff;
    const g=context.createGain();g.gain.value=gain;s.connect(f);f.connect(g);g.connect(amp);sources.push(s);return s;
  };
  if(e.voice==='kick'){const s=osc('sine',145);s.frequency.exponentialRampToValueAtTime(43,when+Math.min(.14,duration));}
  else if(e.voice==='snare'){ns(1100,'highpass',.65);osc('triangle',175,.4);}
  else if(['hat','openhat','crash'].includes(e.voice)){ns(e.voice==='crash'?3400:7000,'highpass');}
  else if(e.voice==='tom'){const s=osc('sine',Math.max(65,hz)*1.7);s.frequency.exponentialRampToValueAtTime(Math.max(45,hz),when+Math.min(.14,duration));}
  else if(e.wave==='noise')ns(1800,'bandpass');
  else osc(e.wave==='triangle'?'triangle':e.wave==='sine'?'sine':e.wave==='sawtooth'?'sawtooth':e.wave==='square'?'square':'pulse',hz);
  const handle={amp,stop(at=context.currentTime){try{amp.gain.cancelScheduledValues(at);amp.gain.setTargetAtTime(0,at,.004);for(const s of sources)s.stop(at+.025);}catch{}}};
  registry?.add(handle);
  sources.forEach(s=>{s.start(when);s.stop(finish+.008);});
  sources[0].onended=()=>{registry?.delete(handle);amp.disconnect();pan.disconnect();};
  return handle;
}
function eventsFor(p){
  const anySolo=p.tracks.some(t=>t.solo);
  return flattenProject(p).events.filter(e=>!e.mute && (!anySolo||e.solo));
}
function range(p,opts){const start=opts.start??0,end=opts.end??totalBeats(p);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>totalBeats(p)||end<=start)throw new Error('播放范围无效');return {start,end};}
export function playbackPosition(elapsed,{start,end,loop=false,loopStart=start}){
  const tail=end-start;
  if(!loop||elapsed<tail)return Math.min(end,start+elapsed);
  return loopStart+(elapsed-tail)%(end-loopStart);
}
export class Player {
  constructor({onPosition=()=>{},onState=()=>{}}={}){this.onPosition=onPosition;this.onState=onState;this._playing=false;this._nodes=new Set();this._timer=null;this._generation=0;}
  get playing(){return this._playing;}
  async context(){
    if(!this._context){const C=globalThis.AudioContext??globalThis.webkitAudioContext;if(!C)throw new Error('浏览器不支持 Web Audio');this._context=new C();this._output=output(this._context);}
    if(this._context.state==='suspended')await this._context.resume();return this._context;
  }
  async play(project,opts={}){
    validateProject(project);const {start,end}=range(project,opts);this.stop();const generation=this._generation;
    const c=await this.context();if(generation!==this._generation)return;
    const loopStart=opts.loopStart??start;
    if(!Number.isFinite(loopStart)||loopStart<0||loopStart>start||loopStart>=end)throw new Error('循环起点无效');
    const span=durationSeconds(project,start,end), loopSpan=durationSeconds(project,loopStart,end), events=eventsFor(project);
    this._playing=true;this.onState('playing');const epoch=c.currentTime+.04;let scheduledUntil=epoch;
    this.onPosition(start);
    const tick=()=>{
      if(!this._playing)return;const now=c.currentTime;
      if(!opts.loop && now>=epoch+span){this.stop();this.onPosition(end);return;}
      const horizon=Math.min(now+.16,opts.loop?Infinity:epoch+span);
      const cycleAt=t=>t<epoch+span?0:1+Math.floor((t-epoch-span)/loopSpan);
      const firstCycle=Math.max(0,cycleAt(scheduledUntil)),lastCycle=Math.max(0,cycleAt(horizon));
      for(let cycle=firstCycle;cycle<=lastCycle;cycle++){
        if(cycle>0&&!opts.loop)break;
        for(const e of events){
          const cycleStart=cycle===0?start:loopStart;
          const a=Math.max(cycleStart,e.start),b=Math.min(end,e.start+e.duration);if(b<=a)continue;
          const cycleEpoch=cycle===0?epoch:epoch+span+(cycle-1)*loopSpan;
          const at=cycleEpoch+durationSeconds(project,cycleStart,a);
          if(at>=scheduledUntil-1e-8 && at<horizon-1e-8){const lateness=Math.max(0,now-at);const duration=durationSeconds(project,a,b)-lateness;if(duration>0)schedule(c,this._output,e,Math.max(at,now),duration,durationSeconds(project,e.start,a)+lateness,this._nodes);}
        }
      }
      scheduledUntil=Math.max(scheduledUntil,horizon);
      this.onPosition(secondsToBeat(project,playbackPosition(Math.max(0,now-epoch),{start:beatToSeconds(project,start),end:beatToSeconds(project,end),loop:opts.loop,loopStart:beatToSeconds(project,loopStart)})));
    };
    tick();this._timer=setInterval(tick,25);
  }
  stop(){this._generation++;this._playing=false;if(this._timer){clearInterval(this._timer);this._timer=null;}for(const n of this._nodes)n.stop();this._nodes.clear();this.onState('stopped');}
  async previewNote(track,midi,duration=.3,velocity=.8){const c=await this.context();schedule(c,this._output,{...track,midi,velocity},c.currentTime+.005,duration,0,this._nodes);}
}
export async function renderWav(project,opts={}){
  validateProject(project);const {start,end}=range(project,opts),seconds=durationSeconds(project,start,end);
  if(seconds>600)throw new Error('单次 WAV 导出最多 10 分钟，请缩小范围');
  const C=globalThis.OfflineAudioContext??globalThis.webkitOfflineAudioContext;if(!C)throw new Error('浏览器不支持离线音频导出');
  const sr=44100,c=new C(2,Math.ceil(seconds*sr),sr),out=output(c);
  for(const e of eventsFor(project)){const a=Math.max(start,e.start),b=Math.min(end,e.start+e.duration);if(b>a)schedule(c,out,e,durationSeconds(project,start,a),durationSeconds(project,a,b),durationSeconds(project,e.start,a));}
  const buffer=await c.startRendering(),frames=buffer.length,bytes=new ArrayBuffer(44+frames*4),view=new DataView(bytes);
  const str=(offset,s)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i));};
  str(0,'RIFF');view.setUint32(4,36+frames*4,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,sr,true);view.setUint32(28,sr*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,frames*4,true);
  const l=buffer.getChannelData(0),r=buffer.getChannelData(1);for(let i=0;i<frames;i++){view.setInt16(44+i*4,Math.round(Math.max(-1,Math.min(1,l[i]))*32767),true);view.setInt16(46+i*4,Math.round(Math.max(-1,Math.min(1,r[i]))*32767),true);}
  return new Blob([bytes],{type:'audio/wav'});
}
