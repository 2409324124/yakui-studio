import { spawn, execFile } from 'node:child_process';
import { constants as osConstants, homedir, tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { importScore, flattenProject } from '../core.mjs';

const scripts = fileURLToPath(new URL('../skills/procedural-chiptune/scripts/', import.meta.url));
const scriptNames = { analyze:'analyze_reference.py', separate:'separate_stems.py', transcribe:'transcribe_polyphonic.py', review:'review_notes.py', init:'init_track.py', render:'render_score.py' };
export const musicHelp = `Usage: yakui-studio music <command> [arguments]
  setup [--profile basic|transcribe] [--python python3]
  analyze AUDIO --out analysis.json [script options]
  separate AUDIO --out STEM_DIR [--device cpu] [script options]
  transcribe AUDIO --out candidates.json [--method polyphonic|pyin] [script options]
  review candidates.json --out reviewed.json [--roles roles.json] [--edits edits.json]
  import candidates.json --bpm BPM --out project.json [--beat-origin SECONDS] [--title TITLE]
  init OUTPUT_DIR [--title TITLE] [--bpm BPM] [--bars N]
  render score-or-project.json --out OUTPUT_DIR [--mp3] [--three-pass]
All Python commands accept --python PATH; use COMMAND --help for script options.
setup basic installs NumPy for analysis/rendering. transcribe additionally installs CPU
PyTorch/Demucs, librosa and Basic Pitch ONNX (no TensorFlow). It downloads dependencies;
Demucs downloads model weights on first separation. Setup requires Python 3.10–3.12.
FFmpeg must be installed separately (or set FFMPEG). YAKUI_DATA_DIR overrides user data.
Workbench rendering uses chip role presets; unknown melodic roles use lead (triangle uses bass).
Other workbench waveforms use pulse approximations; mute/solo, gain, pan and duty are retained.
Transcriptions remain candidates needing review. Import uses absolute source seconds,
with beat 0 at --beat-origin (default 0); confidence is retained, not mapped to velocity.
`;
export function musicDataDir(env = process.env) {
  return path.resolve(env.YAKUI_DATA_DIR || (process.platform === 'win32'
    ? path.join(env.LOCALAPPDATA || homedir(), 'yakui-studio')
    : path.join(env.XDG_DATA_HOME || path.join(homedir(), '.local', 'share'), 'yakui-studio')));
}
export function musicPython(env = process.env) {
  const candidate = path.join(musicDataDir(env), 'music-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return existsSync(candidate) ? candidate : env.YAKUI_PYTHON || 'python3';
}
function takeOption(args, key, fallback) {
  const positions = args.flatMap((x,i)=> x === key ? [i] : []);
  if (positions.length > 1) throw new Error(`Duplicate ${key}`);
  if (!positions.length) return fallback;
  const i = positions[0];
  if (!args[i+1] || args[i+1].startsWith('--')) throw new Error(`${key} requires a value`);
  return args.splice(i,2)[1];
}
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function candidatesToProject(data, { bpm, beatOrigin = 0, title } = {}) {
  if (data?.schema !== 'stem-notes-v1' || !Array.isArray(data.notes)) throw new Error('Expected stem-notes-v1 JSON from transcribe/review, not harmonic analysis');
  if (!finite(bpm) || bpm < 20 || bpm > 400) throw new Error('--bpm must be between 20 and 400');
  if (!finite(beatOrigin) || beatOrigin < 0) throw new Error('--beat-origin must be nonnegative seconds');
  if (data.notes.length > 100000) throw new Error('Too many candidate notes');
  const events = data.notes.map((n,i) => {
    if (!finite(n.start_seconds) || !finite(n.end_seconds) || n.start_seconds < beatOrigin || n.end_seconds <= n.start_seconds || !Number.isInteger(n.midi) || n.midi < 0 || n.midi > 127) throw new Error(`Invalid candidate ${n.id ?? i}: check seconds, beat origin and MIDI`);
    const duration = (n.end_seconds-n.start_seconds)*bpm/60;
    if (duration < .001) throw new Error(`Candidate ${n.id ?? i} is shorter than workbench minimum .001 beats`);
    const role = n.role ?? data.role;
    const voice = typeof role === 'string' && role && role !== 'unassigned' ? role : String(n.source_label ?? data.source_label ?? 'unassigned');
    return { start:(n.start_seconds-beatOrigin)*bpm/60, duration, midi:n.midi, velocity:1, voice,
      candidate:structuredClone(n), start_seconds:n.start_seconds, end_seconds:n.end_seconds };
  });
  let end = 0;
  for (const e of events) end = Math.max(end,e.start+e.duration);
  if (finite(data.start_seconds) && finite(data.duration_seconds)) end = Math.max(end,(data.start_seconds+data.duration_seconds-beatOrigin)*bpm/60);
  const bars = Math.max(1,Math.ceil(end/4));
  if (bars > 1024) throw new Error('Candidate timeline exceeds 1024 bars; select a shorter excerpt or use --beat-origin');
  return importScore({title:title ?? `${data.source_label || 'Audio'} candidates`,bpm,meter:[4,4],bars,
    transcription:structuredClone(data), transcriptionImport:{beatOriginSeconds:beatOrigin,timing:'source-seconds',reviewRequired:true},events});
}
export async function checkSetupPython(python, env = process.env) {
  const {stdout} = await promisify(execFile)(python,['-c','import sys,json; print(json.dumps(list(sys.version_info[:3])))'],{env});
  const version = JSON.parse(stdout.trim());
  if (!Array.isArray(version) || version[0] !== 3 || version[1] < 10 || version[1] > 12) {
    throw new Error(`Music setup requires Python 3.10–3.12; found ${version.join('.')}. Rerun setup with --python /path/to/python3.12.`);
  }
}
export function projectToRenderScore(project) {
  const score = flattenProject(project);
  const roles = new Set(['lead','answer','bass','arp','power_l','power_r','octave','kick','snare','hat','openhat','crash','tom']);
  const drums = new Set(['kick','snare','hat','openhat','crash','tom']);
  const preset = t => drums.has(t.voice) ? t.voice : t.wave === 'triangle' ? 'bass' : roles.has(t.voice) && t.voice !== 'bass' ? t.voice : 'lead';
  const solo = project.tracks.some(t => t.solo);
  score.renderMapping = {engine:'legacy-chip-role-presets', waveformApproximation:true, tracks:project.tracks.map(t=>({trackId:t.id,voice:t.voice,wave:t.wave,preset:preset(t),audible:!t.mute && (!solo || t.solo)}))};
  score.events = score.events.filter(n => !n.mute && (!solo || n.solo)).map(n => ({...n,
    voice:preset(n),
    velocity:n.velocity*n.gain/2,
  }));
  // The legacy renderer applies role gain, while workbench gain belongs to each track.
  // Use a shared gain of 2 and compensate velocity to retain the full 0..2 ranges.
  score.voices = Object.fromEntries([...new Set(score.events.map(n=>n.voice))].map(v=>[v,{gain:2}]));
  return score;
}
function execute(command, args, env) {
  return new Promise((resolve,reject)=>{
    const child = spawn(command,args,{stdio:'inherit',env});
    child.once('error',reject);
    child.once('exit',(code,signal)=>resolve(code ?? 128+(osConstants.signals[signal] || 1)));
  });
}
export async function runMusic(argv, { env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  const args = [...argv], command = args.shift();
  try {
    if (!command || command === '--help' || command === 'help') { stdout.write(musicHelp); return 0; }
    if (command === 'import') {
      if (args.includes('--help')) { stdout.write(musicHelp); return 0; }
      const bpm = Number(takeOption(args,'--bpm')), beatOrigin = Number(takeOption(args,'--beat-origin','0'));
      const out = takeOption(args,'--out'), title = takeOption(args,'--title');
      if (args.length !== 1 || !out) throw new Error('import requires candidates.json --bpm BPM --out project.json');
      const project = candidatesToProject(JSON.parse(await readFile(args[0],'utf8')),{bpm,beatOrigin,title});
      await mkdir(path.dirname(path.resolve(out)),{recursive:true});
      await writeFile(out,JSON.stringify(project,null,2)+'\n');
      stdout.write(`Imported ${project.tracks.length} tracks to ${out}; candidates still require musical review.\n`);
      return 0;
    }
    if (command === 'setup') {
      if (args.includes('--help')) { stdout.write(musicHelp); return 0; }
      const profile = takeOption(args,'--profile','basic'), python = takeOption(args,'--python',env.YAKUI_PYTHON || 'python3');
      if (!['basic','transcribe'].includes(profile) || args.length) throw new Error('setup expects --profile basic|transcribe [--python PATH]');
      await checkSetupPython(python,env);
      const venv = path.join(musicDataDir(env),'music-venv');
      await mkdir(path.dirname(venv),{recursive:true});
      let code = await execute(python,['-m','venv',venv],env); if (code) return code;
      const interpreter = musicPython(env), pip = ['-m','pip','install'];
      await checkSetupPython(interpreter,env);
      const installs = profile === 'basic' ? [['numpy==1.26.4']] : [
        ['torch==2.6.0','torchaudio==2.6.0',...(process.platform === 'darwin' ? [] : ['--index-url','https://download.pytorch.org/whl/cpu'])],
        ['demucs==4.0.1','numpy==1.26.4','scipy==1.14.1','librosa==0.11.0','soundfile','onnxruntime','pretty_midi','mir_eval','resampy==0.4.2','typing_extensions','packaging','scikit-learn','setuptools==80.9.0'],
        ['--no-deps','basic-pitch==0.4.0'] ];
      for (const packages of installs) { code = await execute(interpreter,[...pip,...packages],env); if (code) return code; }
      stdout.write(`Music ${profile} environment ready: ${interpreter}\nFFmpeg is required separately.\n`);
      return 0;
    }
    if (!Object.hasOwn(scriptNames,command)) throw new Error(`Unknown music command: ${command}`);
    const python = takeOption(args,'--python',musicPython(env));
    let script = scriptNames[command];
    if (command === 'transcribe') {
      const method = takeOption(args,'--method','polyphonic');
      if (!['polyphonic','pyin'].includes(method)) throw new Error('--method must be polyphonic or pyin');
      if (method === 'pyin') script = 'transcribe_stem.py';
    }
    if (command === 'render' && !args.includes('--help') && !args.includes('-h')) {
      // The renderer has one positional input; --out is its only valued option.
      const index = args.findIndex((arg,i) => !arg.startsWith('-') && (i === 0 || args[i-1] !== '--out'));
      if (index >= 0) {
        const data = JSON.parse(await readFile(args[index],'utf8'));
        if (data.version === 1 && Array.isArray(data.tracks) && Array.isArray(data.clips)) {
          const score = projectToRenderScore(data);
          const directory = await mkdtemp(path.join(tmpdir(),'yakui-render-'));
          try {
            const file = path.join(directory,'score.json');
            await writeFile(file,JSON.stringify(score));
            args[index] = file;
            stdout.write('Rendering preview with chip role presets: unknown melodic roles map to lead; triangle maps to bass; other waveforms approximate pulse. This is not an exact workbench timbre render.\n');
            const code = await execute(python,[path.join(scripts,script),...args],env);
            const outIndex = args.indexOf('--out');
            if (code === 0 && outIndex >= 0 && args[outIndex+1]) await writeFile(path.join(args[outIndex+1],'render-mapping.json'),JSON.stringify(score.renderMapping,null,2)+'\n');
            return code;
          } finally { await rm(directory,{recursive:true,force:true}); }
        }
      }
    }
    return await execute(python,[path.join(scripts,script),...args],env);
  } catch (error) { stderr.write(`Music: ${error.message}\n`); return 1; }
}
