import assert from 'node:assert/strict';
import {playbackPosition} from './audio.mjs';
// Resume mid-clip, finish its remainder, then loop the WHOLE region.
const r={start:22,end:32,loopStart:16,loop:true};
assert.equal(playbackPosition(0,r),22);
assert.equal(playbackPosition(3,r),25);
assert.equal(playbackPosition(10,r),16);
assert.equal(playbackPosition(26,r),16);
assert.equal(playbackPosition(28,r),18);
assert.equal(playbackPosition(15,{start:22,end:32}),32);
console.log('Transport: mid-region resume, whole-region wrap and song-end clamp passed.');
