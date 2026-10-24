#!/usr/bin/env python3
"""Basic Pitch ONNX: polyphonic instrument-stem candidates, not role separation."""
import argparse,json,os,shutil,subprocess,tempfile
from pathlib import Path

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('audio',type=Path);p.add_argument('--out',type=Path,required=True)
    p.add_argument('--source-label',default='unknown');p.add_argument('--start',type=float,default=0)
    p.add_argument('--seconds',type=float);p.add_argument('--min-midi',type=float,default=21)
    p.add_argument('--max-midi',type=float,default=108);p.add_argument('--onset',type=float,default=.5)
    p.add_argument('--frame',type=float,default=.3);p.add_argument('--min-note',type=float,default=.09)
    p.add_argument('--roles',type=Path,help='JSON role windows [{role,start_seconds,end_seconds,min_midi,max_midi,reason}]')
    p.add_argument('--edits',type=Path);p.add_argument('--bpm',type=float);p.add_argument('--beat-origin',type=float,default=0)
    p.add_argument('--quantize',type=int);p.add_argument('--threads',type=int,default=4)
    a=p.parse_args()
    if a.quantize and not a.bpm:raise SystemExit('--quantize requires --bpm')
    if not (21<=a.min_midi<a.max_midi<=108):raise SystemExit('Basic Pitch model supports MIDI 21–108; use pYIN for a different range')
    import numpy as np,librosa,basic_pitch,onnxruntime as ort
    from basic_pitch.inference import Model,predict
    from basic_pitch.constants import CONTOURS_BINS_PER_SEMITONE
    model_path=Path(basic_pitch.__file__).parent/'saved_models/icassp_2022/nmp.onnx'
    # Explicit ONNX path prevents a TensorFlow default dependency or model selection.
    model=Model.__new__(Model);model.model_type=Model.MODEL_TYPES.ONNX
    opts=ort.SessionOptions();opts.intra_op_num_threads=a.threads
    model.model=ort.InferenceSession(str(model_path),sess_options=opts,providers=['CPUExecutionProvider'])
    ff=os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    with tempfile.TemporaryDirectory(prefix='stem-pitch-') as tmp:
        clip=Path(tmp)/'selection.wav';cmd=[ff,'-v','error','-ss',str(a.start),'-i',str(a.audio)]
        if a.seconds:cmd+=['-t',str(a.seconds)]
        cmd+=['-ar','22050','-ac','1',str(clip)];subprocess.run(cmd,check=True)
        duration=librosa.get_duration(path=clip)
        outputs,midi,raw=predict(clip,model_or_model_path=model,onset_threshold=a.onset,
            frame_threshold=a.frame,minimum_note_length=a.min_note*1000,
            minimum_frequency=float(librosa.midi_to_hz(a.min_midi)),
            maximum_frequency=float(librosa.midi_to_hz(a.max_midi)),multiple_pitch_bends=True)
        a.out.parent.mkdir(parents=True,exist_ok=True)
        # Raw activations retained for re-thresholding without repeating model inference.
        np.savez_compressed(a.out.with_suffix('.activations.npz'),**outputs)
        midi.write(str(a.out.with_suffix('.mid')))
    windows=json.loads(a.roles.read_text()) if a.roles else []
    notes=[]
    for start,end,pitch,amplitude,bends in sorted(raw):
        start=float(start)+a.start;end=min(float(end)+a.start,a.start+duration)
        if end<=start:continue
        roles=list(dict.fromkeys(w['role'] for w in windows if w['start_seconds']<=start<w['end_seconds']
               and w.get('min_midi',21)<=pitch<=w.get('max_midi',108)
               and w.get('source_label',a.source_label)==a.source_label))
        obj={'id':f'n{len(notes):04d}','start_seconds':round(start,6),'end_seconds':round(end,6),
            'midi':int(pitch),'confidence':round(float(amplitude),4),'role':roles[0] if len(roles)==1 else 'unassigned',
            'role_candidates':roles,'source_label':a.source_label,'status':'candidate',
            'provenance':'basic_pitch_onnx','octave_overlap_ids':[],
            'pitch_cents':[{'time_seconds':round(float(t),6),'cents':round(float(v)*100/CONTOURS_BINS_PER_SEMITONE,2)}
                           for t,v in zip(np.linspace(start,end,len(bends or [])),bends or [])]}
        if a.bpm:
            obj['start_beat']=(start-a.beat_origin)*a.bpm/60;obj['duration_beats']=(end-start)*a.bpm/60
            if a.quantize:
                obj['quantized_start_beat']=round(obj['start_beat']*a.quantize)/a.quantize
                obj['quantized_end_beat']=round((end-a.beat_origin)*a.bpm/60*a.quantize)/a.quantize
        notes.append(obj)
    # Flag possible octave leakage instead of discarding real simultaneous octaves.
    for i,note in enumerate(notes):
        for other in notes[:i]:
            if other['end_seconds']<=note['start_seconds']:continue
            if abs(note['midi']-other['midi']) in (12,24) and abs(note['start_seconds']-other['start_seconds'])<.12:
                note['octave_overlap_ids'].append(other['id']);other['octave_overlap_ids'].append(note['id'])
    corrections=[]
    if a.edits:
        for edit in json.loads(a.edits.read_text()):
            if not edit.get('reason'):raise SystemExit('Every correction needs a reason')
            target=next((n for n in notes if n['id']==edit.get('id')),None);before=dict(target) if target else None
            if edit['action']=='delete':
                if target is None:raise SystemExit('Unknown note '+str(edit.get('id')))
                notes.remove(target)
            elif edit['action']=='update':
                if target is None:raise SystemExit('Unknown note '+str(edit.get('id')))
                target.update({k:v for k,v in edit.items() if k not in ('action','reason','id')});target['status']='manually_corrected'
            elif edit['action']=='add':
                target={k:v for k,v in edit.items() if k not in ('action','reason')};target.update(status='manually_added',provenance='manual');notes.append(target)
            else:raise SystemExit('Invalid action')
            corrections.append({'edit':edit,'before':before})
    result={'schema':'stem-notes-v1','method':'basic_pitch_0.4.0_onnx_cpu','input':str(a.audio.resolve()),
        'source_label':a.source_label,'start_seconds':a.start,'duration_seconds':duration,'notes':notes,
        'confidence_kind':'mean_model_note_activation_not_calibrated_probability',
        'thresholds':{'onset':a.onset,'frame':a.frame,'min_note_seconds':a.min_note},
        'pitch_range_midi':[a.min_midi,a.max_midi],'role_windows':windows,'corrections':corrections,
        'limitations':['Polyphonic candidates can include overtones, bleed, missed attacks and octave errors.',
        'Demucs source labels identify instrument families, not lead/answer. Role windows require musical review.',
        'Possible simultaneous octaves are flagged, not automatically deleted.',
        'MIDI/NPZ sidecars are raw unedited model candidates; this JSON is authoritative after corrections.']}
    a.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(f'{len(notes)} polyphonic candidates saved: {a.out}')
if __name__=='__main__':main()
