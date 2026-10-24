"""Editable composition example. Replace this motif/phrasing for each new track."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parent
config=json.loads((ROOT/'track.json').read_text())
if config['meter']!=[4,4]:raise ValueError('This starter arrangement is 4/4; adapt its rhythm for a different meter')
bars=config['bars'];theme=config['theme'];roots=config['bass_roots'];chords=config['chords'];events=[]
intro=max(1,bars//4);build=max(intro+1,bars//2);climax=max(build+1,bars*3//4)
def note(voice,start,duration,midi=60,velocity=1,**options):
    if 0<=start<bars*4:events.append(dict(voice=voice,start=start,duration=duration,midi=midi,velocity=velocity,**options))
for bar in range(bars):
    start=bar*4;part='intro' if bar<intro else 'build' if bar<build else 'climax' if bar<climax else 'return'
    root=roots[bar%len(roots)];chord=chords[bar%len(chords)]
    for i,pitch in enumerate(theme):
        at=start+i*4/len(theme);gate=4/len(theme)*.85
        note('lead',at,gate,pitch,1 if i%2==0 else .72)
        if part=='climax':note('octave',at,gate,pitch-12,.7)
    for offset in [0,1,2,3]:note('bass',start+offset,.7,root,.95 if offset%2==0 else .72)
    if part in ('build','climax'):
        for offset,index in [(1.5,3),(3.5,7)]:note('answer',start+offset,.35,theme[index%len(theme)]+12,.72)
        step=.25 if part=='climax' else .5
        for i in range(round(4/step)):note('arp',start+i*step,step*.72,chord[i%len(chord)]+12,.65)
    if part=='climax':
        for pitch in [root+12,root+19]:note('power_l',start,3.8,pitch,.65)
        note('power_r',start+.02,3.78,root+24,.65)
    for offset in ([0,1.5,2,2.75] if part=='climax' else [0,2]):note('kick',start+offset,.4)
    for offset in [1,3]:note('snare',start+offset,.26,velocity=.95 if part=='climax' else .75)
    step=.25 if part=='climax' else .5
    for i in range(round(4/step)):note('hat',start+i*step,.1,velocity=.7 if i%2==0 else .4)
    if bar==build:note('crash',start,.9,velocity=.7)
    if bar==build-1:
        for i in range(3):note('tom',start+3.25+i*.25,.16,52-i*3,.65)
score={'title':config['title'],'bpm':config['bpm'],'bars':bars,'meter':config['meter'],
 'provenance':config['provenance'],'sections':[{'name':'intro','bars':[1,intro]},
 {'name':'build','bars':[intro+1,build]},{'name':'climax','bars':[build+1,climax]},
 {'name':'return','bars':[climax+1,bars]}],
 'events':sorted(events,key=lambda e:(e['start'],e['voice'],e['midi']))}
(ROOT/'score.json').write_text(json.dumps(score,indent=2,ensure_ascii=False)+'\n')
print(f"{len(events)} events, {bars} bars, {bars*4*60/config['bpm']:.3f} seconds")
