"""Export Python defaults to the browser; --check detects drift."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from nixie_renderer import RenderConfig

p=argparse.ArgumentParser()
p.add_argument('--check',action='store_true')
args=p.parse_args()
path=ROOT/'web/src/defaults.json'
text=json.dumps(RenderConfig().to_dict(),indent=2)+'\n'
if args.check:
    if path.read_text()!=text:
        raise SystemExit('Browser defaults differ. Run python tools/sync_web.py.')
else:
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(text)
