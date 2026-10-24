import {readFile,writeFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {importScore} from '../core.mjs';
import {midiBytes} from '../midi.mjs';
export async function runProject(args=[]) {
 const help='yakui-studio project read\n  selection [--file JSON]\n  apply --file JSON (projectId, baseRevision, operationId, operations required)\n  import FILE (.json/.mid)\n  export FILE (.json/.mid)\n  undo|redo --revision N --project ID [--operation ID]\nSet YAKUI_STUDIO_URL or --url URL to choose the running studio.';
 if(!args.length||args.includes('--help')){console.log(help);return 0;}
 try{
  let url=process.env.YAKUI_STUDIO_URL||'http://127.0.0.1:5240';const positional=[],flags={};
  for(let i=0;i<args.length;i++){const a=args[i];if(a.startsWith('--')){if(!['--url','--file','--revision','--project','--operation'].includes(a)||!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Invalid option ${a}`);flags[a.slice(2)]=args[++i];}else positional.push(a);}
  url=flags.url??url;const origin=new URL(url).origin;
  const request=async(path,method='GET',body)=>{const response=await fetch(new URL(path,origin),{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok)throw new Error(`${response.status}: ${result.error??result.message??'Request failed'}`);return result;};
  const jsonFile=async file=>{if(!file)throw new Error('--file is required');return JSON.parse(await readFile(file,'utf8'));};
  const [command,file,...extra]=positional;if(extra.length)throw new Error('Too many arguments');let result;
  if(command==='read')result=await request('/api/project');
  else if(command==='selection')result=flags.file?await request('/api/selection','PUT',await jsonFile(flags.file)):await request('/api/selection');
  else if(command==='apply'){const body=await jsonFile(flags.file);if(typeof body.projectId!=='string'||!Number.isSafeInteger(body.baseRevision)||typeof body.operationId!=='string'||!body.operationId)throw new Error('apply requires explicit projectId, baseRevision and operationId');result=await request('/api/project/operations','POST',body);}
  else if(command==='undo'||command==='redo'){const baseRevision=Number(flags.revision);if(!flags.project||flags.revision===undefined||!Number.isSafeInteger(baseRevision)||baseRevision<0)throw new Error('undo/redo requires --revision N --project ID');result=await request(`/api/project/${command}`,'POST',{projectId:flags.project,baseRevision,operationId:flags.operation??randomUUID()});}
  else if(command==='import'){if(!file)throw new Error('Import file required');const bytes=await readFile(file);let project;if(['.mid','.midi'].includes(extname(file).toLowerCase())){const {importMidi}=await import('../midi.mjs');project=importMidi(bytes);}else project=importScore(JSON.parse(bytes.toString('utf8')));const current=await request('/api/project');result=await request('/api/project','PUT',{project,projectId:current.project.id,baseRevision:current.project.revision,operationId:randomUUID(),label:`Import ${file}`});}
  else if(command==='export'){if(!file)throw new Error('Export file required');const current=await request('/api/project');if(['.mid','.midi'].includes(extname(file).toLowerCase()))await writeFile(file,midiBytes(current.project));else if(extname(file).toLowerCase()==='.json')await writeFile(file,JSON.stringify(current.project,null,2)+'\n');else throw new Error('Export extension must be .json or .mid');result={file,projectId:current.project.id,revision:current.project.revision};}
  else throw new Error(`Unknown project command: ${command}`);
  console.log(JSON.stringify(result,null,2));return 0;
 }catch(e){console.error(e.message);return 1;}
}
