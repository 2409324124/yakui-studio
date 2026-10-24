import { cp, mkdir, access, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const bundled=fileURLToPath(new URL('../skills/',import.meta.url));
export async function installSkills(args=[]){
 let destination=resolve(process.env.CODEX_HOME||join(homedir(),'.codex'),'skills'),replace=false;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--skills-dir'&&args[i+1])destination=resolve(args[++i]);
  else if(args[i]==='--replace')replace=true;
  else if(args[i]==='--help'){console.log('yakui-studio setup [--skills-dir PATH] [--replace]\nInstalls yakui-studio and procedural-chiptune skills. Existing skills are preserved unless --replace is supplied; replacement keeps a backup.');return;}
  else throw new Error(`Unknown setup option: ${args[i]}`);
 }
 await mkdir(destination,{recursive:true});
 const names=['procedural-chiptune','yakui-studio'];
 for(const name of names){
  const target=join(destination,name);let exists=false;try{await access(target);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(exists&&!replace)throw new Error(`Skill already exists: ${target}. Use --replace to back it up and install the bundle, or choose --skills-dir.`);
 }
 for(const name of names){
  const target=join(destination,name), staging=join(destination,`.${name}-${process.pid}-${Date.now()}`);
  await cp(join(bundled,name),staging,{recursive:true});
  let backup;
  try{await access(target);backup=`${target}.backup-${Date.now()}`;await rename(target,backup);}catch(e){if(e.code!=='ENOENT'){await rm(staging,{recursive:true,force:true});throw e;}}
  try{await rename(staging,target);}catch(e){if(backup)await rename(backup,target);throw e;}
  console.log(`Installed ${target}${backup?` (previous version: ${backup})`:''}`);
 }
 console.log('Skills ready. Start a new agent session to discover them. Run yakui-studio to open the workbench.\nOptional audio tools: yakui-studio music setup --profile transcribe');
}
