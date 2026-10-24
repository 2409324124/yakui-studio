import { cp, mkdir, access, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const bundled=fileURLToPath(new URL('../skills/',import.meta.url));
export function skillDestinations(agent='codex',explicit,{home=homedir(),env=process.env}={}) {
 const paths={codex:resolve(env.CODEX_HOME||join(home,'.codex'),'skills'),claude:resolve(env.CLAUDE_CONFIG_DIR||join(home,'.claude'),'skills'),opencode:resolve(env.XDG_CONFIG_HOME||join(home,'.config'),'opencode','skills')};
 if(agent!=='all'&&!Object.hasOwn(paths,agent))throw new Error(`Unknown agent: ${agent}`);
 // An explicit shared discovery directory is installed once, including --agent all.
 return explicit?[resolve(explicit)]:agent==='all'?Object.values(paths):[paths[agent]];
}
export async function installSkills(args=[]){
 let explicit,agent='codex',replace=false;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--skills-dir'&&args[i+1])explicit=resolve(args[++i]);
  else if(args[i]==='--agent'&&args[i+1])agent=args[++i];
  else if(args[i]==='--replace')replace=true;
  else if(args[i]==='--help'){console.log('yakui-studio setup [--agent codex|claude|opencode|all] [--skills-dir PATH] [--replace]\nInstalls yakui-studio and procedural-chiptune skills. Existing skills are preserved unless --replace is supplied; replacement keeps a backup.');return;}
  else throw new Error(`Unknown setup option: ${args[i]}`);
 }
 const destinations=skillDestinations(agent,explicit);
 const names=['procedural-chiptune','yakui-studio'];
 for(const destination of destinations)for(const name of names){
  const target=join(destination,name);let exists=false;try{await access(target);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(exists&&!replace)throw new Error(`Skill already exists: ${target}. Use --replace to back it up and install the bundle, or choose --skills-dir.`);
 }
 for(const destination of destinations){
 await mkdir(destination,{recursive:true});
 for(const name of names){
  const target=join(destination,name), staging=join(destination,`.${name}-${process.pid}-${Date.now()}`);
  await cp(join(bundled,name),staging,{recursive:true});
  let backup;
  try{await access(target);backup=`${target}.backup-${Date.now()}`;await rename(target,backup);}catch(e){if(e.code!=='ENOENT'){await rm(staging,{recursive:true,force:true});throw e;}}
  try{await rename(staging,target);}catch(e){if(backup)await rename(backup,target);throw e;}
  console.log(`Installed ${target}${backup?` (previous version: ${backup})`:''}`);
 }
 }
 console.log('Skills ready. Start a new agent session to discover them. Run yakui-studio to open the workbench.\nOptional audio tools: yakui-studio music setup --profile transcribe');
}
