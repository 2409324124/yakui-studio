#!/usr/bin/env python3
"""Lightweight tempo and harmonic candidates, not polyphonic transcription."""
import argparse,json,math,os,shutil,subprocess
from pathlib import Path
import numpy as np
SR=22050

def stft(audio,size,hop):
    if len(audio)<size: audio=np.pad(audio,(0,size-len(audio)))
    frames=np.lib.stride_tricks.sliding_window_view(audio,size)[::hop]
    return np.abs(np.fft.rfft(frames*np.hanning(size),axis=1))

def analyze(audio,bpm=None,minimum=60,maximum=180,min_midi=21,max_midi=108):
    mag=stft(audio,2048,256)
    flux=np.maximum(np.diff(np.log1p(mag*20),axis=0),0).mean(axis=1)
    width=min(43,len(flux));smooth=np.convolve(flux,np.ones(width)/width,mode='same')
    env=np.maximum(flux-smooth,0);env-=env.mean();rate=SR/256
    candidates=[];lags=list(range(max(1,math.ceil(rate*60/maximum)),min(len(env)//2,math.floor(rate*60/minimum))+1));correlations=[]
    for lag in lags:
        a,b=env[:-lag],env[lag:];den=np.linalg.norm(a)*np.linalg.norm(b)
        correlations.append(float(np.dot(a,b)/den) if den>1e-10 else 0)
    for i,(lag,value) in enumerate(zip(lags,correlations)):
        if value<=0:continue
        delta=0
        if 0<i<len(lags)-1:
            left,right=correlations[i-1],correlations[i+1]
            if value<left or value<right:continue
            denominator=left-2*value+right
            if abs(denominator)>1e-10:delta=float(np.clip(.5*(left-right)/denominator,-.5,.5))
        tempo=rate*60/(lag+delta)
        if minimum<=tempo<=maximum:candidates.append((value,tempo))
    top=[]
    for value,tempo in sorted(candidates,reverse=True):
        if all(abs(tempo-x['bpm'])>2 for x in top):top.append({'bpm':round(tempo,2),'periodicity':round(value,4)})
        if len(top)==6:break
    chosen=bpm or (top[0]['bpm'] if top else None)
    spectrum=stft(audio,8192,1024)
    # Local spectral whitening reduces broad timbre envelopes; harmonic ambiguity remains.
    padded=np.pad(spectrum,((0,0),(4,4)),mode='edge')
    local=sum(padded[:,i:i+spectrum.shape[1]] for i in range(9))/9
    white=np.minimum(spectrum/(local+np.maximum(spectrum.max()*1e-6,1e-12)),8)*np.sqrt(spectrum)
    midis=np.arange(min_midi,max_midi+1);freq=440*2**((midis-69)/12);salience=np.zeros((len(spectrum),len(midis)))
    for harmonic in range(1,9):
        bins=np.rint(freq*harmonic*8192/SR).astype(int);valid=bins<white.shape[1]-1
        for shift,weight in [(-1,.5),(0,1),(1,.5)]:
            salience[:,valid]+=white[:,np.clip(bins[valid]+shift,0,white.shape[1]-1)]*weight/harmonic
    profile=salience.mean(axis=0);classes=np.array([profile[midis%12==pc].sum() for pc in range(12)])
    classes/=max(classes.sum(),1e-12)
    names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    result={'seconds':len(audio)/SR,'tempo_candidates':top,'analysis_bpm':chosen,'bpm_source':'user' if bpm else 'unconfirmed periodicity candidate',
      'pitch_range_midi':[min_midi,max_midi],'pitch_class_weights':{name:round(float(value),4) for name,value in zip(names,classes)},'half_beat_candidates':[],
      'limitations':['Tempo may be half/double; compare several source sections and actual beat accents.',
       'Full-mix harmonics are not isolated instruments. These are candidates, not a transcribed melody.',
       'Half-beat boundaries start at the requested audio offset; align the phrase onset before using them.']}
    if chosen:
        hop_seconds=1024/SR;step=60/chosen/2
        for index in range(min(32,math.floor(len(audio)/SR/step))):
            lo=round((index*step+.025)/hop_seconds);hi=max(lo+1,round(((index+1)*step-.025)/hop_seconds))
            if lo>=len(salience):break
            values=salience[lo:min(hi,len(salience))].mean(axis=0);order=values.argsort()[-5:][::-1]
            result['half_beat_candidates'].append({'beat':index*.5,'candidates':[{'midi':int(midis[j]),'note':names[midis[j]%12]+str(midis[j]//12-1),'salience':round(float(values[j]),4)} for j in order]})
    return result

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('audio',type=Path);p.add_argument('--out',type=Path,required=True)
    p.add_argument('--start',type=float,default=0);p.add_argument('--seconds',type=float,default=30)
    p.add_argument('--bpm',type=float);p.add_argument('--bpm-min',type=float,default=60);p.add_argument('--bpm-max',type=float,default=180)
    p.add_argument('--min-midi',type=int,default=21);p.add_argument('--max-midi',type=int,default=108)
    args=p.parse_args()
    if not 0<=args.min_midi<args.max_midi<=127:p.error('invalid MIDI range')
    if not args.audio.is_file():p.error('audio must be an existing local file')
    if not all(math.isfinite(v) for v in [args.start,args.seconds,args.bpm_min,args.bpm_max]) or args.start<0 or not 1<=args.seconds<=90 or not 20<=args.bpm_min<args.bpm_max<=400:p.error('invalid range or excerpt length')
    if args.bpm is not None and (not math.isfinite(args.bpm) or not 20<=args.bpm<=400):p.error('invalid BPM')
    ffmpeg=os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    if not ffmpeg:p.error('ffmpeg is required to decode local reference audio')
    result=subprocess.run([ffmpeg,'-v','error','-ss',str(args.start),'-i',str(args.audio),'-t',str(args.seconds),'-ac','1','-ar',str(SR),'-f','f32le','pipe:1'],capture_output=True,check=True)
    audio=np.frombuffer(result.stdout,dtype='<f4').astype(float)
    if len(audio)<SR or not np.isfinite(audio).all() or np.abs(audio).max()<1e-8:p.error('excerpt is too short, silent or invalid')
    report=analyze(audio,args.bpm,args.bpm_min,args.bpm_max,args.min_midi,args.max_midi);report['source_file']=args.audio.name;report['source_start_seconds']=args.start
    args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'analysis':str(args.out),'tempo_candidates':report['tempo_candidates'],'note':'Pitch output contains candidates, not verified sheet music.'},indent=2))
if __name__=='__main__':main()
