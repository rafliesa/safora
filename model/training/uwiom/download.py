"""Download the small UW-IOM skeleton/label subset and verify publisher hashes."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def download(manifest, root):
    for entry in json.loads(manifest.read_text()):
        folder, name = entry['folder_name'], entry['filename']
        if folder == 'Videos':
            continue
        if folder not in ('JointPositions', 'VideoLabels', 'UW IOM Dataset') or Path(name).name != name:
            raise ValueError('Unexpected file path in manifest')
        details = entry['content_details']
        if not details['download_url'].startswith('https://data.mendeley.com/public-files/'):
            raise ValueError('Unexpected download host')
        path = root/folder/name
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == details['sha256_hash']:
            continue
        temporary = path.with_suffix(path.suffix+'.part')
        subprocess.run(['curl', '-fL', '-sS', '--retry', '2', '--max-time', '90',
                        details['download_url'], '-o', str(temporary)], check=True)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != details['sha256_hash']:
            raise ValueError(f'Checksum mismatch: {name}')
        temporary.replace(path)
        print(name, path.stat().st_size, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path); parser.add_argument('root', type=Path)
    args = parser.parse_args()
    download(args.manifest, args.root)
