import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseArgs, browserCommand } from './bin/cli.mjs';

test('CLI validates ports and rejects unknown arguments',()=>{
 assert.deepEqual(parseArgs([]),{port:5240,open:true,check:false,help:false});
 assert.equal(parseArgs(['--port','5300','--no-open']).port,5300);
 assert.equal(parseArgs(['--port=65535']).port,65535);
 for(const arg of ['0','22','65536','abc','5240;echo hi'])assert.throws(()=>parseArgs(['--port',arg]));
 assert.throws(()=>parseArgs(['--port']));assert.throws(()=>parseArgs(['--publish']));
});
test('browser launch uses platform-specific argv without shell interpolation',()=>{
 const url='http://127.0.0.1:5240/';
 assert.deepEqual(browserCommand(url,'win32',{}),['rundll32.exe',['url.dll,FileProtocolHandler',url]]);
 assert.deepEqual(browserCommand(url,'darwin',{}),['open',[url]]);
 assert.deepEqual(browserCommand(url,'linux',{DISPLAY:':0'}),['xdg-open',[url]]);
 assert.deepEqual(browserCommand(url,'linux',{WSL_DISTRO_NAME:'Ubuntu'}),['wslview',[url]]);
 assert.equal(browserCommand(url,'linux',{}),null);
});
test('package is dependency-free with a bounded public artifact allowlist',async()=>{
 const p=JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8'));
 assert.equal(p.bin['yakui-studio'],'bin/cli.mjs');assert.equal(p.license,'UNLICENSED');assert.equal(p.engines.node,'>=20');
 assert.equal(Object.keys(p.dependencies||{}).length,0);
 for(const file of ['server.mjs','core.mjs','audio.mjs','midi.mjs','app.mjs','index.html','proposal-schema.json','data/example-score.json','assets/yakui.png'])assert.ok(p.files.includes(file));
 assert.ok(!p.files.some(f=>f.includes('.runtime')||f.includes('evidence')||f.includes('test')||f.includes('*')));
});
