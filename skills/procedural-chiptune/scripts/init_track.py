#!/usr/bin/env python3
"""Create an independent, editable chip score project without overwriting files."""
import argparse,json,shutil,sys
from pathlib import Path

def main():
    p=argparse.ArgumentParser();p.add_argument('output',type=Path);p.add_argument('--title',default='Chip study')
    p.add_argument('--bpm',type=float,default=120);p.add_argument('--bars',type=int,default=16)
    args=p.parse_args()
    if not 20<=args.bpm<=400 or args.bars<4:p.error('bpm must be 20..400 and template bars at least 4')
    if args.output.exists():p.error('output must be a new directory; edit an existing project in place')
    root=Path(__file__).resolve().parents[1];args.output.mkdir(parents=True)
    for source in (root/'assets/project').iterdir():
        if source.is_file():shutil.copy2(source,args.output/source.name)
    shutil.copy2(root/'scripts/render_score.py',args.output/'render_score.py')
    # Generic demonstration motif, deliberately independent of the Yakui adaptation.
    config={'title':args.title,'bpm':args.bpm,'bars':args.bars,'meter':[4,4],
      'theme':[60,63,67,70,67,63,62,58],
      'bass_roots':[36,32,39,34],
      'chords':[[60,63,67],[56,60,63],[63,67,70],[58,62,65]],
      'provenance':'Original demonstration material. Replace theme/chords for each requested track; not reference transcription.'}
    (args.output/'track.json').write_text(json.dumps(config,indent=2,ensure_ascii=False)+'\n')
    print(f'Created {args.output}. Edit arrange.py and track.json; then {sys.executable} build.py')
if __name__=='__main__':main()
