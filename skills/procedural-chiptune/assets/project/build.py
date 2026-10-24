"""Build the editable score, then export audio. Optional --mp3 and --three-pass."""
from pathlib import Path
import subprocess,sys
root=Path(__file__).resolve().parent
subprocess.run([sys.executable,str(root/'arrange.py')],check=True)
subprocess.run([sys.executable,str(root/'render_score.py'),str(root/'score.json'),'--out',str(root/'audio'),*sys.argv[1:]],check=True)
