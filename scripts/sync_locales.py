"""Copy the shared English UI dictionary into the sibling mobile checkout."""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
parser.add_argument('--mobile', type=Path, default=Path(__file__).resolve().parents[2] / 'wiring-mobile')
args = parser.parse_args()
source = Path(__file__).resolve().parents[1] / 'locales/en.json'
target = args.mobile / 'src/locales/en.json'
if args.check:
    if not target.exists() or source.read_bytes() != target.read_bytes():
        raise SystemExit('Mobile translations differ. Run python3 scripts/sync_locales.py.')
else:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(source.read_bytes())
