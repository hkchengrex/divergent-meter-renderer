"""Reproduce the README images. Run from the repository root.

python examples/render_gallery.py --blender /path/to/blender
"""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

# These argument lists are also printed as commands for easy reproduction.
CASES = {
    'dark': [],
    'brighter': ['--brightness', '40', '--bloom-threshold', '0.7'],
    'glossy-studio': ['--reflection', '0.8', '--floor-roughness', '0.06',
        '--studio-brightness', '150', '--studio-position', '-4', '-3', '6',
        '--studio-target', '0', '0', '1', '--studio-size', '5', '--studio-size-y', '2',
        '--camera-position', '0', '-15', '4.22', '--camera-target', '0', '0', '0.7'],
    'perspective': ['--camera-type', 'PERSP', '--camera-position', '3', '-14', '5',
        '--camera-target', '0', '0', '1.13', '--focal-length', '45',
        '--glass-roughness', '0.12', '--glass-reflection', '0.15'],
    'atlas': ['--atlas', '--width', '1280', '--height', '400'],
}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--blender')
    args = p.parse_args()
    images = ROOT / 'docs/images'
    images.mkdir(parents=True, exist_ok=True)
    for name, options in CASES.items():
        prefix = ROOT / 'renders/gallery' / name
        command = [sys.executable, '-m', 'nixie_renderer', '--reading', '1.097302',
            '--width', '960', '--height', '540', '--samples', '24', *options,
            '--output', str(prefix), '--overwrite']
        if args.blender:
            command += ['--blender', args.blender]
        print('Rendering:', name, flush=True)
        subprocess.run(command, cwd=ROOT, check=True)
        shutil.copy2(str(prefix) + '.png', images / (name + '.png'))

if __name__ == '__main__':
    main()
