#!/usr/bin/env python3
"""Real Demucs separation. No filtering is described as instrument separation."""
import argparse, json, os, shutil, subprocess
from pathlib import Path

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('audio',type=Path); p.add_argument('--out',type=Path,required=True)
    p.add_argument('--model',default='htdemucs'); p.add_argument('--device',default='cpu')
    p.add_argument('--start',type=float,default=0);p.add_argument('--seconds',type=float)
    p.add_argument('--threads',type=int,default=4);p.add_argument('--segment',type=float,default=7.5)
    p.add_argument('--shifts',type=int,default=1); p.add_argument('--seed',type=int,default=0)
    a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
    # Heavy imports remain optional: NumPy-only composition does not need these.
    import random, numpy as np, torch, soundfile as sf
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    torch.set_num_threads(a.threads); torch.manual_seed(a.seed);random.seed(a.seed)
    model=get_model(a.model);model.eval();model.to(a.device)
    rate=int(model.samplerate);channels=int(model.audio_channels)
    ff=os.environ.get('FFMPEG') or shutil.which('ffmpeg')
    if not ff:raise SystemExit('FFmpeg is required to decode the reference.')
    cmd=[ff,'-v','error','-ss',str(a.start),'-i',str(a.audio)]
    if a.seconds is not None:cmd+=['-t',str(a.seconds)]
    cmd+=['-ar',str(rate),'-ac',str(channels),'-f','f32le','pipe:1']
    raw=subprocess.check_output(cmd)
    x=np.frombuffer(raw,dtype='<f4').reshape(-1,channels).copy().T
    if x.shape[-1]<rate//2:raise SystemExit('Audio selection must be at least 0.5 seconds.')
    wav=torch.from_numpy(x);ref=wav.mean(0);mean=ref.mean();std=ref.std()
    if float(std)<1e-8:raise SystemExit('Audio selection is silent.')
    with torch.inference_mode():
        est=apply_model(model,((wav-mean)/std)[None],device=a.device,
                        split=True,segment=a.segment,overlap=.25,shifts=a.shifts,progress=True)[0]
        # Demucs official inference normalization is restored per source.
        est=est.cpu()*std+mean
    stems=[]
    for label,signal in zip(model.sources,est):
        target=a.out/(label+'.wav');data=signal.T.numpy()
        sf.write(target,data,rate,subtype='FLOAT')
        stems.append({'source_label':label,'path':target.name,'sample_rate':rate,
                      'channels':channels,'frames':len(data),'seconds':len(data)/rate,
                      'rms':float(np.sqrt(np.mean(data**2))),'peak':float(np.max(np.abs(data)))})
    report={'schema':'demucs-stems-v1','input':str(a.audio.resolve()),'start_seconds':a.start,
            'model':a.model,'device':a.device,'torch':torch.__version__,'source_labels':list(model.sources),
            'seed':a.seed,'shifts':a.shifts,'segment':a.segment,'stems':stems,
            'limitations':['Labels are instrument classes, not musical roles.',
            'Lead and high answer may coexist inside vocals/other; separation can bleed or erase details.',
            'Float stems intentionally retain headroom; normalize only for a listening copy.']}
    (a.out/'stems.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
