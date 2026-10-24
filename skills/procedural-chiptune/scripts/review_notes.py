#!/usr/bin/env python3
"""Apply score/ear-backed role windows and explicit note corrections without rerunning ML."""
import argparse,copy,json
from pathlib import Path

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('candidates',type=Path)
    p.add_argument('--out',type=Path,required=True);p.add_argument('--roles',type=Path);p.add_argument('--edits',type=Path)
    a=p.parse_args();data=json.loads(a.candidates.read_text());notes=data['notes']
    windows=json.loads(a.roles.read_text()) if a.roles else []
    for w in windows:
        for k in ['role','start_seconds','end_seconds','reason']:
            if k not in w:raise SystemExit(f'Role window missing {k}')
        if w['end_seconds']<=w['start_seconds']:raise SystemExit('Invalid role time window')
    for n in notes:
        matches=[w for w in windows if w['start_seconds']<=n['start_seconds']<w['end_seconds']
                 and w.get('min_midi',0)<=n['midi']<=w.get('max_midi',127)
                 and w.get('source_label',n.get('source_label'))==n.get('source_label')]
        if matches:
            roles=list(dict.fromkeys(m['role'] for m in matches))
            n['role_candidates']=roles
            n['role']=roles[0] if len(roles)==1 else 'unassigned'
            n['role_basis']=[m['reason'] for m in matches]
            n['role_status']='human_window_candidate'
    corrections=[]
    for e in json.loads(a.edits.read_text()) if a.edits else []:
        if not e.get('reason'):raise SystemExit('Every edit must have an evidence/reason')
        target=next((n for n in notes if n['id']==e.get('id')),None);before=copy.deepcopy(target)
        if e['action']=='delete':
            if target is None:raise SystemExit('Unknown note '+str(e.get('id')))
            notes.remove(target)
        elif e['action']=='update':
            if target is None:raise SystemExit('Unknown note '+str(e.get('id')))
            target.update({k:v for k,v in e.items() if k not in ('action','reason','id')})
            target['status']='manually_corrected'
        elif e['action']=='add':
            target={k:v for k,v in e.items() if k not in ('action','reason')}
            target['status']='manually_added';target['provenance']='manual';notes.append(target)
        else:raise SystemExit('Invalid action: '+str(e['action']))
        corrections.append({'edit':e,'before':before})
    ids=[n['id'] for n in notes]
    if len(ids)!=len(set(ids)):raise SystemExit('Duplicate note IDs after editing')
    for n in notes:
        if not 0<=n['midi']<=127 or n['end_seconds']<=n['start_seconds']:raise SystemExit('Invalid corrected note')
    data['review_parent']=str(a.candidates.resolve());data.setdefault('review_history',[]).append({
        'role_windows':windows,'corrections':corrections,
        'note':'Human window roles are annotations, not newly separated instrument audio.'})
    a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(f'Reviewed {len(notes)} candidates; {len(corrections)} explicit edits -> {a.out}')
if __name__=='__main__':main()
