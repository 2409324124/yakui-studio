import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importScore,flattenProject} from './core.mjs';
import {midiBytes} from './midi.mjs';
const p=importScore(JSON.parse(readFileSync(new URL('./data/example-score.json',import.meta.url))));
const b=midiBytes(p),v=new DataView(b.buffer);assert.equal(new TextDecoder().decode(b.slice(0,4)),'MThd');assert.equal(v.getUint16(10),14);assert.equal(v.getUint16(12),480);
let pos=14,on=0,off=0,tracks=0,tempo;
const variable=()=>{let value=0,x;do{x=b[pos++];value=(value<<7)|(x&127);}while(x&128);return value;};
while(pos<b.length){assert.equal(new TextDecoder().decode(b.slice(pos,pos+4)),'MTrk');const end=pos+8+v.getUint32(pos+4);pos+=8;tracks++;let tick=0;while(pos<end){tick+=variable();const status=b[pos++];if(status===255){const kind=b[pos++],len=variable();if(kind===81)tempo=(b[pos]<<16)|(b[pos+1]<<8)|b[pos+2];pos+=len;}else{const kind=status&240;if(kind===144)on++;if(kind===128)off++;pos+=2;}}assert.equal(pos,end);}
assert.equal(tracks,14);assert.equal(on,flattenProject(p).events.length);assert.equal(off,on);assert.ok(Math.abs(60000000/tempo-95)<.001);console.log(`MIDI parsed: ${tracks} tracks, ${on} paired notes, 95 BPM.`);

const {importMidi}=await import('./midi.mjs');
const {default:writeMidi}=await import('./vendor/midi-file/midi-writer.mjs');
const {default:parseMidi}=await import('./vendor/midi-file/midi-parser.mjs');
const fixture=Uint8Array.from(writeMidi({header:{format:1,ticksPerBeat:480},tracks:[
 [{deltaTime:0,type:'setTempo',microsecondsPerBeat:500000},{deltaTime:0,type:'timeSignature',numerator:4,denominator:4,metronome:24,thirtyseconds:8},{deltaTime:960,type:'setTempo',microsecondsPerBeat:1000000},{deltaTime:0,type:'timeSignature',numerator:3,denominator:4,metronome:24,thirtyseconds:8},{deltaTime:1920,type:'endOfTrack'}],
 [{deltaTime:0,type:'trackName',text:'Two channels'},{deltaTime:0,type:'programChange',channel:2,programNumber:48},{deltaTime:0,type:'controller',channel:2,controllerType:64,value:127},{deltaTime:0,type:'noteOn',channel:2,noteNumber:60,velocity:90},{deltaTime:240,type:'noteOn',channel:2,noteNumber:60,velocity:70},{deltaTime:240,type:'noteOn',channel:5,noteNumber:60,velocity:100},{deltaTime:240,type:'pitchBend',channel:5,value:2048},{deltaTime:240,type:'noteOff',channel:2,noteNumber:60,velocity:20},{deltaTime:240,type:'noteOff',channel:2,noteNumber:60,velocity:30},{deltaTime:240,type:'noteOff',channel:5,noteNumber:60,velocity:40},{deltaTime:0,type:'controller',channel:2,controllerType:64,value:0},{deltaTime:0,type:'endOfTrack'}]
]}));
const imported=importMidi(fixture,{title:'Fixture'});
assert.equal(imported.title,'Fixture');assert.equal(imported.tracks.length,1);
assert.deepEqual(imported.tempoMap,[{beat:0,bpm:120},{beat:2,bpm:60}]);
assert.deepEqual(imported.meterMap.map(e=>[e.beat,e.meter]),[[0,[4,4]],[2,[3,4]]]);
const ns=flattenProject(imported).events;
assert.deepEqual(ns.map(n=>[n.start,n.duration,n.midiChannel,n.midiReleaseVelocity]),[[0,2,2,20],[.5,2,2,30],[1,2,5,40]]);
assert.ok(imported.warnings.some(w=>w.includes('CC')));
const again=importMidi(midiBytes(imported));
const semantic=p=>flattenProject(p).events.map(({start,duration,midi,velocity,midiChannel,midiReleaseVelocity})=>({start,duration,midi,velocity,midiChannel,midiReleaseVelocity}));
assert.deepEqual(semantic(again),semantic(imported));
assert.deepEqual(again.tempoMap,imported.tempoMap);assert.deepEqual(again.meterMap,imported.meterMap);
const controllers=p=>p.tracks.flatMap(t=>t.midiEvents??[]).map(({order,running,...e})=>e);
assert.deepEqual(controllers(again),controllers(imported));
assert.equal(flattenProject(imported).seconds,7);
assert.throws(()=>importMidi(fixture.slice(0,-3)),/MIDI/);
assert.throws(()=>importMidi(Uint8Array.from(writeMidi({header:{format:2,ticksPerBeat:480},tracks:[[{deltaTime:0,type:'endOfTrack'}]]}))),/Format 2/);
assert.throws(()=>importMidi(Uint8Array.from(writeMidi({header:{format:0,framesPerSecond:25,ticksPerFrame:40},tracks:[[{deltaTime:0,type:'endOfTrack'}]]}))),/SMPTE/);
// Format 0 and running status are handled by the vendored codec.
const format0=Uint8Array.from(writeMidi({header:{format:0,ticksPerBeat:480},tracks:[parseMidi(fixture).tracks[1]]},{running:true}));
assert.equal(flattenProject(importMidi(format0)).events.length,3);
console.log('MIDI import: Format 0/1, running status, multichannel overlap FIFO, maps, controls, semantic roundtrip and rejection passed.');

assert.equal(again.tracks.length,imported.tracks.length);
const scoreRoundtrip=importMidi(midiBytes(p));
assert.equal(scoreRoundtrip.tracks.length,p.tracks.length);
assert.ok(scoreRoundtrip.clips.some(c=>c.trackId===scoreRoundtrip.tracks[0].id));
const metaOnly=Uint8Array.from(writeMidi({header:{format:1,ticksPerBeat:480},tracks:[[{deltaTime:0,type:'trackName',text:'Conductor'},{deltaTime:0,type:'marker',text:'Intro'},{deltaTime:480,type:'endOfTrack'}]]}));
const metaProject=importMidi(metaOnly);assert.equal(metaProject.tracks.length,0);assert.equal(metaProject.midi.conductorEvents[0].text,'Intro');
assert.equal(importMidi(midiBytes(metaProject)).midi.conductorEvents[0].text,'Intro');
console.log('Conductor-only tracks stay global; score roundtrip adds no empty instrument and retains markers.');
