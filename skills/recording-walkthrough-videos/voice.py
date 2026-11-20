"""Synthesizes the voiceover clips for a walkthrough, offline, with Kokoro-82M (Apache-2.0) on the CPU.

Setup, once:
    python3 -m venv ~/.cache/walkthrough-voice
    ~/.cache/walkthrough-voice/bin/pip install kokoro-onnx soundfile
    cd ~/.cache/walkthrough-voice && for f in kokoro-v1.0.onnx voices-v1.0.bin; do
      curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f; done

Use (after a DEMO_VOICE=<voice> DEMO_FAST=1 dry run wrote <outDir>/voice/lines.json):
    ~/.cache/walkthrough-voice/bin/python voice.py <outDir>/voice [--speed 1.0]

Writes <key>.wav for every line whose clip is missing, so only new or changed lines are synthesized.
Voices: af_heart (the approved voice), am_michael, bf_emma, ... (see the kokoro-onnx voice list).
"""
import argparse
import json
import os
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
parser.add_argument("voice_dir", type=Path)
parser.add_argument("--speed", type=float, default=1.0)
args = parser.parse_args()

spec = json.loads((args.voice_dir / "lines.json").read_text())
todo = [l for l in spec["lines"] if not (args.voice_dir / f"{l['key']}.wav").exists()]
if todo:
    models = Path(os.environ.get("KOKORO_DIR", Path.home() / ".cache/walkthrough-voice"))
    kokoro = Kokoro(str(models / "kokoro-v1.0.onnx"), str(models / "voices-v1.0.bin"))
    lang = "en-gb" if spec["voice"].startswith("b") else "en-us"  # b* voices are British
    for line in todo:
        audio, rate = kokoro.create(line["text"], voice=spec["voice"], speed=args.speed, lang=lang)
        tmp = args.voice_dir / f"{line['key']}.tmp.wav"
        sf.write(tmp, audio, rate)
        tmp.rename(args.voice_dir / f"{line['key']}.wav")  # a stopped run never leaves a half clip that counts as done
print(f"synthesized {len(todo)}, cached {len(spec['lines']) - len(todo)}")
