"""Apply the experimental exposure classifier to a video-derived keypoint CSV."""
import argparse
import csv
from pathlib import Path
from model import predict_rows


def export(source, checkpoint, output):
    with source.open(encoding='utf-8-sig', newline='') as file:
        rows = list(csv.DictReader(file))
    if not rows:
        raise ValueError('Empty observation CSV')
    results = predict_rows(rows, checkpoint)
    # Keep the original posture output; never overwrite an existing prediction file.
    with output.open('x', encoding='utf-8-sig', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=list(results[0]))
        writer.writeheader(); writer.writerows(results)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path); parser.add_argument('checkpoint', type=Path); parser.add_argument('output', type=Path)
    args = parser.parse_args()
    export(args.source, args.checkpoint, args.output)
