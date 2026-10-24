import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installSkills } from './bin/setup.mjs';
test('install bundled skills, protect local modifications, explicitly back up replacements',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'yakui-install-'));
 try{
  await installSkills(['--skills-dir',dir]);
  assert.match(await readFile(join(dir,'yakui-studio/SKILL.md'),'utf8'),/name: yakui-studio/);
  const file=join(dir,'procedural-chiptune/SKILL.md');await writeFile(file,'local customization');
  await assert.rejects(installSkills(['--skills-dir',dir]),/already exists/);
  assert.equal(await readFile(file,'utf8'),'local customization');
  await installSkills(['--skills-dir',dir,'--replace']);
  const backup=(await readdir(dir)).find(n=>n.startsWith('procedural-chiptune.backup-'));
  assert.equal(await readFile(join(dir,backup,'SKILL.md'),'utf8'),'local customization');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('npm-style symlink entry executes CLI',async()=>{
 const {symlink}=await import('node:fs/promises');const {spawnSync}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'yakui-bin-'));
 try{const bin=join(dir,'yakui-studio');await symlink(new URL('./bin/cli.mjs',import.meta.url).pathname,bin);
 const r=spawnSync(process.execPath,[bin,'--help'],{encoding:'utf8'});assert.equal(r.status,0);assert.match(r.stdout,/yakui-studio setup/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('provider-specific discovery paths and explicit shared destination',async()=>{
 const {skillDestinations}=await import('./bin/setup.mjs');
 const options={home:'/test-home',env:{}};
 assert.deepEqual(skillDestinations('all',undefined,options),['/test-home/.codex/skills','/test-home/.claude/skills','/test-home/.config/opencode/skills']);
 assert.deepEqual(skillDestinations('all','/shared/skills',options),['/shared/skills']);
 assert.deepEqual(skillDestinations('opencode',undefined,{home:'/test-home',env:{XDG_CONFIG_HOME:'/custom'}}),['/custom/opencode/skills']);
 assert.throws(()=>skillDestinations('bogus',undefined,options),/Unknown agent/);
 const dir=await mkdtemp(join(tmpdir(),'yakui-all-'));
 try{await installSkills(['--agent','all','--skills-dir',dir]);assert.ok((await readdir(dir)).includes('yakui-studio'));}
 finally{await rm(dir,{recursive:true,force:true});}
});
