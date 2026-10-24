import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
const execute = promisify(execFile);
export const PROVIDERS = [{id:'codex',label:'Codex'},{id:'claude',label:'Claude Code'},{id:'opencode',label:'OpenCode'}];
function known(provider) {
 if (!PROVIDERS.some(p=>p.id===provider)) throw new Error(`Unknown agent provider: ${provider}`);
}
export async function detectProviders() {
 return Promise.all(PROVIDERS.map(async provider=>{
  if(provider.id==='claude')return {...provider,installed:false,planned:true,version:null,reason:'后续功能：保留 Claude Code 接口，暂不启用'};
  try {
   const {stdout}=await execute(provider.id,['--version'],{timeout:5000,maxBuffer:65536});
   const version=stdout.trim().split('\n').at(-1);
   if (!version) throw new Error('CLI returned no version');
   return {...provider,installed:true,version,reason:null};
  } catch(error) {
   const reason=error.code==='ENOENT'?'CLI not found in PATH':error.code==='EACCES'?'CLI exists but cannot execute (permission denied or incomplete installation)':error.killed?'CLI version check timed out':`CLI unavailable: ${String(error.stderr||error.message).trim().slice(0,300)}`;
   return {...provider,installed:false,version:null,reason};
  }
 }));
}
// Keep authentication stores and provider/model settings; restrict tools per invocation.
// CLI contracts: codex exec --help (0.164.0); opencode run --help (1.18.32);
// https://code.claude.com/docs/en/cli-reference and https://opencode.ai/docs/permissions/
export async function buildProviderSpec(provider,{prompt,cwd,outputFile,schemaPath,model}={}) {
 known(provider);
 if(typeof prompt!=='string'||!prompt.trim()) throw new Error('A prompt is required');
 const env={...process.env};
 let args,input=prompt,outputMode;
 if(provider==='codex') {
  if(!outputFile||!schemaPath) throw new Error('Codex needs outputFile and schemaPath');
  args=['exec','--ignore-user-config','--ephemeral','--disable','shell_tool','--disable','unified_exec','--disable','apps','--disable','browser_use','--disable','computer_use','-c','web_search="disabled"','--sandbox','read-only','--skip-git-repo-check','--color','never','--output-schema',schemaPath,'--output-last-message',outputFile];
  if(cwd)args.push('--cd',cwd);
  if(model)args.push('--model',model);
  args.push('-');outputMode='file';
 } else if(provider==='claude') {
  args=['-p','--output-format','json','--tools','','--disallowedTools','mcp__*','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--no-session-persistence','--settings','{"disableAllHooks":true}'];
  if(schemaPath)args.push('--json-schema',await readFile(schemaPath,'utf8'));
  if(model)args.push('--model',model);
  outputMode='json';
 } else {
  // A dedicated agent avoids user build-agent permissions overriding the deny rule.
  env.OPENCODE_CONFIG_CONTENT=JSON.stringify({permission:'deny',agent:{'yakui-proposal':{mode:'primary',description:'Tool-free music proposal generation',permission:'deny',tools:{'*':false}}},autoupdate:false});
  args=['run','--pure','--format','json','--agent','yakui-proposal'];
  if(cwd)args.push('--dir',cwd);
  if(model)args.push('--model',model);
  // stdin avoids command-line size limits and shell interpolation.
  if(schemaPath)input+=`\nReturn one JSON object matching this schema, with no prose:\n${await readFile(schemaPath,'utf8')}`;
  outputMode='jsonl';
 }
 return {command:provider,args,env,input,outputMode};
}
function parseJSON(text) {
 if(typeof text!=='string')throw new Error('Provider did not return JSON text');
 const stripped=text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/,'$1').trim();
 try {return JSON.parse(stripped);}catch {throw new Error('Provider returned invalid proposal JSON');}
}
export async function parseProviderOutput(provider,stdout,{outputFile}={}) {
 known(provider);
 if(provider==='codex')return parseJSON(await readFile(outputFile,'utf8'));
 if(provider==='claude') {
  const result=parseJSON(stdout);
  if(result.is_error || (result.subtype && result.subtype!=='success'))throw new Error(`Claude failed: ${result.subtype||'provider error'}`);
  if(result.structured_output!==undefined)return result.structured_output;
  return parseJSON(result.result);
 }
 const events=stdout.split(/\r?\n/).filter(s=>s.trim()).map(line=>{try{return JSON.parse(line);}catch{throw new Error('OpenCode returned malformed JSON events');}});
 const error=events.find(e=>e.type==='error');
 if(error) {
  const status=error.error?.data?.statusCode;
  // Report actionable status without echoing response bodies, headers or credentials.
  const detail=status===401?'authentication failed (HTTP 401)':status===403?'access denied (HTTP 403)':Number.isInteger(status)?`HTTP ${status}`:error.error?.name||'provider error';
  throw new Error(`OpenCode failed: ${detail}`);
 }
 const text=events.filter(e=>e.type==='text').map(e=>e.part?.text||'').join('');
 if(!text.trim())throw new Error('OpenCode returned no proposal text');
 return parseJSON(text);
}
