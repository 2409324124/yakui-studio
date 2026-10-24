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
