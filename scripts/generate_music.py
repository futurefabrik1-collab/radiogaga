#!/usr/bin/env python3
"""
MusicGen via HuggingFace transformers for radioGAGA.
Usage: generate_music.py --prompt "..." --duration 30 --output /path/to/out.wav
Model is cached after first download (~300MB for small).
"""

import argparse
import sys
import os
import torch
import scipy.io.wavfile
import numpy as np

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--duration", type=int, default=30)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="facebook/musicgen-medium")
    args = parser.parse_args()

    from transformers import AutoProcessor, MusicgenForConditionalGeneration

    # MPS has a bug with EnCodec's decoder (>65536 output channels not supported).
    # CPU is reliable and fast enough on Apple Silicon for musicgen-small.
    # CUDA works fine if available (Linux/Windows with GPU).
    if torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"

    print(f"[musicgen] Device: {device}", file=sys.stderr)
    print(f"[musicgen] Prompt: {args.prompt}", file=sys.stderr)
    print(f"[musicgen] Duration: {args.duration}s", file=sys.stderr)

    processor = AutoProcessor.from_pretrained(args.model)
    model = MusicgenForConditionalGeneration.from_pretrained(args.model)
    model.to(device)

    # tokens_per_second ≈ 50 for musicgen-small at 32kHz
    max_tokens = int(args.duration * 50)

    inputs = processor(text=[args.prompt], padding=True, return_tensors="pt").to(device)

    audio_values = model.generate(**inputs, max_new_tokens=max_tokens)

    # audio_values shape: [batch, channels, samples] — take first result
    audio_np = audio_values[0, 0].cpu().float().numpy()

    # Normalise to int16
    audio_np = audio_np / (np.abs(audio_np).max() + 1e-8)
    audio_int16 = (audio_np * 32767).astype(np.int16)

    sample_rate = model.config.audio_encoder.sampling_rate

    out_path = args.output
    if not out_path.endswith(".wav"):
        out_path += ".wav"

    scipy.io.wavfile.write(out_path, sample_rate, audio_int16)

    print(f"[musicgen] Saved: {out_path}", file=sys.stderr)
    print(out_path)  # stdout for Node to read

if __name__ == "__main__":
    main()
