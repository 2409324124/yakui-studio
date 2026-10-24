export async function api(path,method='GET',data){
 const r=await fetch(path,{method,headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});
 const result=await r.json();if(!r.ok){const e=new Error(result.error||`HTTP ${r.status}`);e.status=r.status;throw e;}return result;
}
export class ProjectSync {
 constructor({onSaved=()=>{},onError=()=>{}}={}){this.onSaved=onSaved;this.onError=onError;this.pending=0;this.error=null;this.chain=Promise.resolve();this.state=null;}
 adopt(state){this.state=state;this.error=null;}
 publish(project,label){const copy=structuredClone(project);this.pending++;
 this.chain=this.chain.then(async()=>{if(this.error)return;try{const s=await api('/api/project','PUT',{project:copy,projectId:this.state.project.id,baseRevision:this.state.project.revision,label,operationId:crypto.randomUUID()});this.state=s;this.onSaved(s);}catch(e){this.error=e;this.onError(e);}}).finally(()=>{this.pending--;});
 }
 async flush(){await this.chain;if(this.error)throw this.error;}
 async replace(project,label='打开工程'){await this.flush();const s=await api('/api/project','PUT',{project,projectId:this.state.project.id,baseRevision:this.state.project.revision,label,operationId:crypto.randomUUID()});this.adopt(s);return s;}
 async history(action){await this.flush();const s=await api(`/api/project/${action}`,'POST',{projectId:this.state.project.id,baseRevision:this.state.project.revision,operationId:crypto.randomUUID()});this.adopt(s);return s;}
}
