#!/usr/bin/env python3
"""pYIN monophonic candidates with confidence, bends and auditable editing.
Run on a genuine instrument stem or explicitly selected solo phrase. A pitch-range
search inside a polyphonic stem is a candidate pass, never a newly separated stem.
"""
import argparse,json,math,os,shutil,subprocess
from pathlib import Path

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('audio',type=Path);p.add_argument('--out',type=Path,required=True)
    p.add_argument('--role',default='unassigned');p.add_argument('--source-label',default='unknown')
    p.add_argument('--start',type=float,default=0);p.add_argument('--seconds',type=float)
    p.add_argument('--min-midi',type=float,default=21);p.add_argument('--max-midi',type=float,default=108)
    p.add_argument('--sample-rate',type=int,default=22050);p.add_argument('--hop',type=int,default=256)
    p.add_argument('--confidence',type=float,default=.12);p.add_argument('--min-note',type=float,default=.08)
    p.add_argument('--bpm',type=float);p.add_argument('--beat-origin',type=float,default=0)
    p.add_argument('--quantize',type=int,help='optional subdivisions per quarter note, e.g. 4=16ths; originals retained')
    p.add_argument('--edits',type=Path,help='JSON list: {id,action:delete|update,reason,...fields}, or action:add')
    a=p.parse_args()
    if a.max_midi<=a.min_midi:raise SystemExit('max-midi must exceed min-midi')
    if a.quantize and not a.bpm:raise SystemExit('--quantize requires --bpm')
    import numpy as np,librosa
    ff=os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    cmd=[ff,'-v','error','-ss',str(a.start),'-i',str(a.audio)]
    if a.seconds:cmd+=['-t',str(a.seconds)]
    cmd+=['-ac','1','-ar',str(a.sample_rate),'-f','f32le','pipe:1']
    y=np.frombuffer(subprocess.check_output(cmd),dtype='<f4').copy();sr=a.sample_rate;hop=a.hop
    if len(y)<sr//2:raise SystemExit('Selection too short')
    # Choose long enough frames for low bass, instead of silently deleting it.
    fmin=float(librosa.midi_to_hz(a.min_midi));fmax=min(float(librosa.midi_to_hz(a.max_midi)),sr*.45)
    frame=2**int(math.ceil(math.log2(max(2048,3*sr/fmin))))
    frame=min(16384,frame)
    f0,voiced,prob=librosa.pyin(y,fmin=fmin,fmax=fmax,sr=sr,frame_length=frame,
                              hop_length=hop,resolution=.1,fill_na=np.nan)
    times=librosa.times_like(f0,sr=sr,hop_length=hop)+a.start
    midi=librosa.hz_to_midi(f0); rms=librosa.feature.rms(y=y,frame_length=frame,hop_length=hop)[0]
    n=min(len(midi),len(rms));midi=midi[:n];times=times[:n];prob=prob[:n];rms=rms[:n];voiced=voiced[:n]
    energy_threshold=max(float(np.max(rms))*.018,1e-7)
    good=np.isfinite(midi)&voiced&(prob>=a.confidence)&(rms>=energy_threshold)
    # Brief isolated pitch flips are suppressed by 3-frame median, without losing the raw trajectory.
    stable=np.rint(np.nan_to_num(midi,nan=-999)).astype(int)
    for i in range(1,n-1):
        if good[i-1:i+2].all():stable[i]=int(np.median(np.rint(midi[i-1:i+2])))
    notes=[];rejected=[];i=0;dt=hop/sr
    while i<n:
        if not good[i]:i+=1;continue
        j=i+1
        while j<n and good[j] and stable[j]==stable[i]:j+=1
        start=float(times[i]);end=min(float(times[j-1]+dt),a.start+len(y)/sr)
        pitch=int(stable[i]);confidence=float(np.median(prob[i:j]));duration=end-start
        obj={'id':f'n{len(notes):04d}','midi':pitch,'start_seconds':round(start,6),'end_seconds':round(end,6),
             'confidence':round(confidence,4),'role':a.role,'source_label':a.source_label,
             'pitch_cents':[{'time_seconds':round(float(times[k]),6),'cents':round(float((midi[k]-pitch)*100),2)}
                             for k in range(i,j)],'status':'candidate','provenance':'pYIN_monophonic'}
        if duration<a.min_note:rejected.append({'start_seconds':round(start,6),'end_seconds':round(end,6),'midi':pitch,'reason':'short_run'})
        else:
            if a.bpm:
                obj['start_beat']=(start-a.beat_origin)*a.bpm/60
                obj['duration_beats']=duration*a.bpm/60
                if a.quantize:
                    q=a.quantize
                    obj['quantized_start_beat']=round(obj['start_beat']*q)/q
                    obj['quantized_end_beat']=round(((end-a.beat_origin)*a.bpm/60)*q)/q
            notes.append(obj)
        i=j
    corrections=[]
    if a.edits:
        edits=json.loads(a.edits.read_text())
        for edit in edits:
            if not edit.get('reason'):raise SystemExit('Every correction needs a reason')
            action=edit['action'];uid=edit.get('id');match=next((v for v in notes if v['id']==uid),None)
            before=dict(match) if match else None
            if action=='delete':
                if match is None:raise SystemExit(f'Unknown note {uid}')
                notes.remove(match)
            elif action=='update':
                if match is None:raise SystemExit(f'Unknown note {uid}')
                match.update({k:v for k,v in edit.items() if k not in ('action','reason','id')});match['status']='manually_corrected'
            elif action=='add':
                obj={k:v for k,v in edit.items() if k not in ('action','reason')};obj['status']='manually_added';obj['provenance']='manual';notes.append(obj)
            else:raise SystemExit(f'Unknown action {action}')
            corrections.append({'edit':edit,'before':before})
    for note in notes:
        if not (0<=note['midi']<=127 and note['end_seconds']>note['start_seconds']):raise SystemExit('Invalid edited note')
    frames=[{'time_seconds':round(float(t),6),'f0_hz':round(float(f),4) if np.isfinite(f) else None,
             'midi_float':round(float(m),4) if np.isfinite(m) else None,'voiced_probability':round(float(v),4),
             'accepted':bool(g)} for t,f,m,v,g in zip(times,f0,midi,prob,good)]
    out={'schema':'stem-notes-v1','input':str(a.audio.resolve()),'source_label':a.source_label,'role':a.role,
         'method':'librosa.pyin','sample_rate':sr,'hop':hop,'frame_length':frame,'start_seconds':a.start,
         'duration_seconds':len(y)/sr,'pitch_range_midi':[a.min_midi,a.max_midi],
         'confidence_threshold':a.confidence,'energy_threshold_rms':energy_threshold,'notes':notes,
         'rejected_short_runs':rejected,'frames':frames,'corrections':corrections,
         'limitations':['Monophonic F0 candidate extraction, not polyphonic transcription.',
         'In a mixed stem, dominant partials and octave errors need score/ear/adjacent-phrase confirmation.',
         'Separate lead/answer passes only identify roles in chosen time/register windows; they are not independently separated instruments.',
         'Repeated same-pitch attacks may remain joined; inspect original rhythm before accepting.']}
    a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:out[k] for k in ('method','source_label','role','duration_seconds','frame_length')}))
    print(f'{len(notes)} notes; {len(rejected)} short runs rejected; saved {a.out}')
if __name__=='__main__':main()
