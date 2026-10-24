#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { detectProviders } from '../providers.mjs';
import { installSkills } from './setup.mjs';
import { createStudioServer } from '../server.mjs';

export function parseArgs(args){
 const result={port:5240,open:true,check:false,help:false};
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--no-open')result.open=false;
  else if(arg==='--workspace'){if(!args[i+1])throw new Error('--workspace 需要目录');result.workspace=resolve(args[++i]);}
  else if(arg==='--check')result.check=true;
  else if(arg==='--help'||arg==='-h')result.help=true;
  else if(arg==='--port'||arg.startsWith('--port=')){
   const raw=arg==='--port'?args[++i]:arg.slice(7);
   if(!raw||!/^\d+$/.test(raw))throw new Error('--port 需要 1024–65535 之间的整数。');
   result.port=Number(raw);
   if(result.port<1024||result.port>65535)throw new Error('--port 需要 1024–65535 之间的整数。');
  }else throw new Error(`未知参数：${arg}。运行 yakui-studio --help 查看用法。`);
 }
 return result;
}
export function browserCommand(url,platform=process.platform,env=process.env){
 if(platform==='win32')return ['rundll32.exe',['url.dll,FileProtocolHandler',url]];
 if(platform==='darwin')return ['open',[url]];
 if(env.WSL_DISTRO_NAME)return ['wslview',[url]];
 if(env.DISPLAY||env.WAYLAND_DISPLAY)return ['xdg-open',[url]];
 return null;
}
export function openBrowser(url){
 const command=browserCommand(url);
 if(!command){console.log('没有检测到图形桌面。请手动在浏览器打开上方地址。');return;}
 try{
  const child=spawn(command[0],command[1],{stdio:'ignore',detached:process.platform!=='win32'});
  let reported=false;
  const failed=()=>{if(!reported){reported=true;console.log(`未能自动打开浏览器，请手动访问 ${url}`);}};
  child.once('error',failed);child.once('exit',code=>{if(code!==0)failed();});child.unref();
 }catch{console.log(`未能自动打开浏览器，请手动访问 ${url}`);}
}
export async function main(args=process.argv.slice(2)){
 if(args[0]==='setup'){await installSkills(args.slice(1));return 0;}
 if(args[0]==='project'){const {runProject}=await import('./project.mjs');return await runProject(args.slice(1));}
 if(args[0]==='music'){const {runMusic}=await import('../music/index.mjs');return await runMusic(args.slice(1));}
 let config;try{config=parseArgs(args);}catch(e){console.error(e.message);return 2;}
 if(config.help){console.log('Yakui Studio\n\n  yakui-studio setup [--agent codex|claude|opencode|all] [--skills-dir PATH] [--replace]\n  yakui-studio project --help\n  yakui-studio music --help\n  yakui-studio [--port 5240] [--no-open] [--workspace PATH]\n  yakui-studio --check\n\n在本机浏览器编辑乐谱；Ctrl+C 关闭本次服务。\n--check 检查 Node 与可用 agent CLI；Claude 接口预留，不登录、不调用模型。');return 0;}
 if(Number(process.versions.node.split('.')[0])<20){console.error('Yakui Studio 需要 Node.js 20 或更新版本。');return 1;}
 if(config.check){
  console.log(`Node.js ${process.versions.node} · 可用`);
  for(const p of await detectProviders())console.log(`${p.label} · ${p.installed?p.version:p.reason}`);
  console.log('CLI 存在不代表已登录；服务仅绑定回环地址。');return 0;
 }
 const app=createStudioServer({projectDir:config.workspace});
 try{await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(config.port,'127.0.0.1',resolve);});}
 catch(e){
  if(e.code==='EADDRINUSE')console.error(`端口 ${config.port} 已占用。请使用 yakui-studio --port ${config.port===65535?5240:config.port+1}，现有服务未被修改。`);
  else console.error(`无法启动本地工作台：${e.code||e.message}`);
  return 1;
 }
 const url=`http://127.0.0.1:${config.port}/`;
 console.log(`Yakui Studio\n${url}\nCtrl+C 关闭工作台。工程保存在本机共享目录；界面与 agent 共用修订。请用“保存工程”导出备份。`);
 let stopping=false;
 const stop=async()=>{if(stopping)return;stopping=true;console.log('\n正在关闭本次工作台…');await app.close();};
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 app.server.once('close',()=>{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);});
 if(config.open)openBrowser(url);
 return 0;
}
if(process.argv[1] && realpathSync(resolve(process.argv[1]))===realpathSync(fileURLToPath(import.meta.url)))main().then(code=>{if(code)process.exitCode=code;}).catch(e=>{console.error(e.message);process.exitCode=1;});
