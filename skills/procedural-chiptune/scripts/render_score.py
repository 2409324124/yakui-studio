"""Small, deterministic chip-style synthesizer. Python + NumPy only.

This is an expanded chiptune arrangement, not a NES hardware emulator.
Derived from the approved Yakui synthesis engine; event input is independent of any song.
"""
from pathlib import Path
import json, math, wave
import numpy as np

SR = 44100
VOICE = {
    'lead': dict(kind='pulse', duty=.25, gain=.145, pan=-.12, decay=2.0, sustain=.38),
    'answer': dict(kind='pulse', duty=.125, gain=.077, pan=.28, decay=3.2, sustain=.32),
    'bass': dict(kind='triangle', gain=.215, pan=0, decay=1.2, sustain=.66),
    'arp': dict(kind='pulse', duty=.125, gain=.052, pan=-.42, decay=6.2, sustain=.12),
    'power_l': dict(kind='pulse', duty=.50, gain=.055, pan=-.67, decay=.65, sustain=.65),
    'power_r': dict(kind='pulse', duty=.25, gain=.050, pan=.67, decay=.85, sustain=.62),
    'octave': dict(kind='pulse', duty=.50, gain=.056, pan=.06, decay=2.0, sustain=.30),
    'kick': dict(gain=.34, pan=0),
    'snare': dict(gain=.19, pan=.06),
    'hat': dict(gain=.055, pan=-.18),
    'openhat': dict(gain=.065, pan=.24),
    'crash': dict(gain=.095, pan=.16),
    'tom': dict(gain=.16, pan=-.24),
}

def blep(phase, step):
    out = np.zeros_like(phase)
    first = phase < step
    x = phase[first] / step
    out[first] = x + x - x*x - 1
    last = phase > 1-step
    x = (phase[last]-1)/step
    out[last] = x*x+x+x+1
    return out

def oscillator(freq, length, kind, duty=.25, phase_offset=0):
    t = np.arange(length, dtype=np.float64)/SR
    phase = np.mod(t*freq+phase_offset, 1)
    if kind == 'triangle':
        signal = np.zeros(length)
        for harmonic in range(1, min(19, int(SR*.45/freq))+1, 2):
            signal += (-1)**((harmonic-1)//2) * np.sin(2*np.pi*harmonic*phase)/(harmonic*harmonic)
        return signal*(8/(np.pi*np.pi))
    signal = np.where(phase < duty, 1., -1.)
    signal += blep(phase, freq/SR)-blep(np.mod(phase-duty, 1), freq/SR)
    # Remove duty-dependent DC, keeping different pulse widths balanced.
    return (signal-(2*duty-1))*.75

def envelope(length, decay, sustain, attack=.003, release=.014):
    t = np.arange(length)/SR
    env = sustain+(1-sustain)*np.exp(-decay*t)
    attack_count = min(length, max(2, round(attack*SR)))
    release_count = min(length, max(2, round(release*SR)))
    env[:attack_count] *= np.sin(np.linspace(0, np.pi/2, attack_count))**2
    env[-release_count:] *= np.cos(np.linspace(0, np.pi/2, release_count))**2
    return env

def noise_table():
    table = np.empty(32767, np.float64)
    state = 0x4f35
    for i in range(len(table)):
        table[i] = (state&1)*2-1
        state = (state>>1)|(((state^(state>>1))&1)<<14)
    return table
NOISE = noise_table()

def percussion(voice, length, index, midi=43):
    t = np.arange(length)/SR
    noise = NOISE[(np.arange(length)+index*7919)%len(NOISE)]
    high = (noise-np.roll(noise, 1))*.5
    if voice == 'kick':
        frequency = 48+130*np.exp(-t*45)
        signal = np.sin(2*np.pi*np.cumsum(frequency)/SR)*np.exp(-t*15)
        signal += .13*high*np.exp(-t*180)
    elif voice == 'snare':
        signal = .80*high*np.exp(-t*20)+.30*np.sin(2*np.pi*185*t)*np.exp(-t*30)
    elif voice == 'tom':
        frequency = 440*2**((midi-69)/12)*(1+.75*np.exp(-t*35))
        signal = np.sin(2*np.pi*np.cumsum(frequency)/SR)*np.exp(-t*18)+.12*noise*np.exp(-t*45)
    elif voice == 'hat':
        signal = high*np.exp(-t*65)
    elif voice == 'openhat':
        signal = high*np.exp(-t*17)
    else:
        # Sparse chip-noise accents, not continuous crash hiss.
        signal = high*np.exp(-t*7)
    ramp = min(length, 45)
    signal[:ramp] *= np.linspace(0,1,ramp)
    signal[-min(length,220):] *= np.linspace(1,0,min(length,220))
    return signal

def add_wrapped(stem, signal, start, pan):
    left = math.cos((pan+1)*math.pi/4)
    right = math.sin((pan+1)*math.pi/4)
    start %= len(stem)
    first = min(len(signal), len(stem)-start)
    stem[start:start+first,0] += signal[:first]*left
    stem[start:start+first,1] += signal[:first]*right
    if first < len(signal):
        stem[:len(signal)-first,0] += signal[first:]*left
        stem[:len(signal)-first,1] += signal[first:]*right

def validate(score):
    bpm=float(score['bpm']); bars=int(score['bars']); meter=score.get('meter',[4,4])
    if not math.isfinite(bpm) or not 20<=bpm<=400: raise ValueError('bpm must be 20..400')
    if bars!=score['bars'] or bars<1: raise ValueError('bars must be a positive integer')
    if len(meter)!=2 or any(isinstance(x,bool) or not isinstance(x,int) or x<1 for x in meter):
        raise ValueError('meter must contain two positive integers')
    beats=bars*meter[0]*4/meter[1]  # Quarter-note beat units, including 6/8 etc.
    if beats*60/bpm>600: raise ValueError('This preview engine supports up to 10 minutes per render')
    events=score['events']
    if not events: raise ValueError('events must not be empty')
    for i,e in enumerate(events):
        if e['voice'] not in VOICE: raise ValueError(f'Unknown voice in event {i}')
        vals={k:float(e.get(k,default)) for k,default in [('start',0),('duration',0),('midi',60),('velocity',1),('pan',0),('duty',.25)]}
        if not all(math.isfinite(x) for x in vals.values()): raise ValueError(f'Nonfinite event {i}')
        if not 0<=vals['start']<beats or not 0<vals['duration']<=beats: raise ValueError(f'Event {i} outside score')
        if not 0<=vals['midi']<=127 or not 0<=vals['velocity']<=2 or not -1<=vals['pan']<=1 or not .01<=vals['duty']<=.99:
            raise ValueError(f'Invalid note, velocity, pan or duty in event {i}')
    return bpm,beats

def render(score):
    bpm,beats=validate(score);beat=60/bpm;samples=round(beats*beat*SR)
    voices={name:dict(value) for name,value in VOICE.items()}
    for name,settings in score.get('voices',{}).items():
        if name not in voices: raise ValueError(f'Unknown voice override: {name}')
        if set(settings)-set(voices[name]): raise ValueError(f'Unsupported voice parameter: {name}')
        for key,value in settings.items():
            if key=='kind':
                if value not in ('pulse','triangle'): raise ValueError('Unsupported oscillator')
            elif not isinstance(value,(int,float)) or not math.isfinite(value): raise ValueError('Invalid voice setting')
        voices[name].update(settings)
        v=voices[name]
        if not 0<=v['gain']<=2 or not -1<=v['pan']<=1: raise ValueError('Invalid voice gain/pan')
        if 'kind' in v and (not 0<=v['sustain']<=1 or v['decay']<0 or not .01<=v.get('duty',.25)<=.99): raise ValueError('Invalid envelope/duty')
    active={e['voice'] for e in score['events']}
    stems={name:np.zeros((samples,2),np.float32) for name in active}
    for i,event in enumerate(score['events']):
        name=event['voice'];settings=voices[name]
        length=max(4,round(event['duration']*beat*SR));midi=event.get('midi',60)
        if 'kind' in settings:
            freq=440*2**((midi-69)/12)
            signal=oscillator(freq,length,settings['kind'],event.get('duty',settings.get('duty',.25)))
            signal*=envelope(length,settings['decay'],settings['sustain'],release=.010 if name=='arp' else .018)
        else: signal=percussion(name,length,i,midi)
        signal*=settings['gain']*event.get('velocity',1)
        add_wrapped(stems[name],signal,round(event['start']*beat*SR),event.get('pan',settings['pan']))
    for voice,amount in [('lead',.13),('answer',.16),('arp',.07)]:
        if voice not in stems: continue
        dry=stems[voice].copy()
        stems[voice]+=np.roll(dry,round(.75*beat*SR),axis=0)[:,::-1]*amount
        stems[voice]+=np.roll(dry,round(1.5*beat*SR),axis=0)*amount*.40
    mix=sum(stems.values());mix-=mix.mean(axis=0);mix=np.tanh(mix*1.15)
    peak=float(np.abs(mix).max())
    if peak<1e-8: raise ValueError('Score rendered silence')
    mix*=10**(-1.5/20)/peak
    if not np.isfinite(mix).all(): raise ValueError('Nonfinite output')
    return mix

def write_wav(path, signal):
    pcm=np.rint(np.clip(signal,-1,1)*32767).astype('<i2')
    with wave.open(str(path),'wb') as out:
        out.setnchannels(2);out.setsampwidth(2);out.setframerate(SR);out.writeframes(pcm.tobytes())

def stats(signal):
    return {'seconds':len(signal)/SR,'peak_dbfs':float(20*np.log10(np.abs(signal).max()+1e-12)),
            'rms_dbfs':float(20*np.log10(np.sqrt(np.mean(signal**2))+1e-12))}

def main():
    import argparse,os,shutil,subprocess
    parser=argparse.ArgumentParser(description='Render an event score to chip-style WAV/MP3')
    parser.add_argument('score',type=Path);parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--mp3',action='store_true');parser.add_argument('--three-pass',action='store_true')
    args=parser.parse_args();score=json.loads(args.score.read_text());loop=render(score);args.out.mkdir(parents=True,exist_ok=True)
    write_wav(args.out/'loop.wav',loop)
    preview=loop.copy();fade=min(len(loop),round(.55*SR));preview[-fade:]*=np.linspace(1,0,fade)[:,None]
    edge=min(len(loop),round(.008*SR));preview[:edge]*=np.linspace(0,1,edge)[:,None];write_wav(args.out/'preview.wav',preview)
    report=stats(loop);report.update(sample_rate=SR,channels=2,bit_depth=16,bars=score['bars'],bpm=score['bpm'],events=len(score['events']))
    report['loop_boundary_step']=np.abs(loop[0]-loop[-1]).tolist()
    report['near_join_max_step']=float(np.abs(np.diff(np.concatenate([loop[-1024:],loop[:1024]]),axis=0)).max())
    report['sections']=[]
    bpm,beats=validate(score);bar_beats=beats/score['bars'];climax=None
    for section in score.get('sections',[]):
        first,last=section['bars']
        if not 1<=first<=last<=score['bars']: raise ValueError('Section bars must be inclusive, 1-based')
        clip=loop[round((first-1)*bar_beats*60/bpm*SR):round(last*bar_beats*60/bpm*SR)]
        report['sections'].append(dict(name=section['name'],bars=[first,last],**stats(clip)))
        if section['name']=='climax' and climax is None: climax=clip.copy()
    if climax is not None:
        count=min(len(climax)//2,round(.008*SR))
        if count:climax[:count]*=np.linspace(0,1,count)[:,None];climax[-count:]*=np.linspace(1,0,count)[:,None]
        write_wav(args.out/'climax.wav',climax)
    if args.three_pass:write_wav(args.out/'loop-3x.wav',np.tile(loop,(3,1)))
    if args.mp3:
        ffmpeg=os.environ.get('FFMPEG') or shutil.which('ffmpeg')
        if not ffmpeg: raise SystemExit('WAV saved; ffmpeg is required for --mp3')
        for name in ['preview']+(['climax'] if climax is not None else []):
            subprocess.run([ffmpeg,'-v','error','-y','-i',str(args.out/(name+'.wav')),'-c:a','libmp3lame','-b:a','192k',str(args.out/(name+'.mp3'))],check=True)
    (args.out/'render-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
