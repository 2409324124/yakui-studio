import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildProviderSpec,parseProviderOutput} from './providers.mjs';
const proposal={summary:'a phrase',notes:[{start:0,duration:1,midi:60,velocity:.8}]};
test('provider envelopes decode actual structured output formats and reject errors',async()=>{
 assert.deepEqual(await parseProviderOutput('claude',JSON.stringify({type:'result',subtype:'success',structured_output:proposal})),proposal);
 assert.deepEqual(await parseProviderOutput('claude',JSON.stringify({result:JSON.stringify(proposal)})),proposal);
 const text=JSON.stringify(proposal),events=[{type:'step_start',part:{}},{type:'text',part:{text:text.slice(0,20)}},{type:'text',part:{text:text.slice(20)}},{type:'step_finish',part:{reason:'stop'}}];
 assert.deepEqual(await parseProviderOutput('opencode',events.map(e=>JSON.stringify(e)).join('\n')),proposal);
 await assert.rejects(parseProviderOutput('claude',JSON.stringify({is_error:true,result:JSON.stringify(proposal)})),/Claude failed/);
 await assert.rejects(parseProviderOutput('opencode',JSON.stringify({type:'error',error:{name:'AuthError'}})),/AuthError/);
 await assert.rejects(parseProviderOutput('opencode',JSON.stringify({type:'step_finish'})),/no proposal/);
 await assert.rejects(parseProviderOutput('opencode','not json'),/malformed/);
 await assert.rejects(parseProviderOutput('opencode',JSON.stringify({type:'error',error:{name:'APIError',data:{statusCode:401,message:'secret response body'}}})),error=>error.message==='OpenCode failed: authentication failed (HTTP 401)');
});
test('Codex reads final response file; command arguments carry data without shell interpolation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'yakui-providers-'));
 try {
  const outputFile=join(dir,'out.json'),schemaPath=join(dir,'schema.json');
  await writeFile(outputFile,JSON.stringify(proposal));await writeFile(schemaPath,'{"type":"object"}');
  assert.deepEqual(await parseProviderOutput('codex','irrelevant progress',{outputFile}),proposal);
  const options={prompt:'music; $(not-a-command)',cwd:dir,outputFile,schemaPath};
  const codex=await buildProviderSpec('codex',options);assert.equal(codex.input,options.prompt);assert.equal(codex.args.at(-1),'-');assert.ok(codex.args.includes('read-only'));
  const claude=await buildProviderSpec('claude',options);assert.equal(claude.args[claude.args.indexOf('--tools')+1],'');assert.ok(claude.args.includes('mcp__*'));
  const opencode=await buildProviderSpec('opencode',options);assert.ok(opencode.args.includes('--pure'));assert.equal(JSON.parse(opencode.env.OPENCODE_CONFIG_CONTENT).agent['yakui-proposal'].permission,'deny');assert.ok(opencode.input.startsWith(options.prompt));
  await assert.rejects(buildProviderSpec('missing',options),/Unknown/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
