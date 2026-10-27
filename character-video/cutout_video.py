"""
Convert a studio-backdrop Veo MP4 clip (or PNG anchor) into a clean, halo-free
transparent VP9 WebM (`yuva420p`) or RGBA PNG for Bubba's desktop companion.

Run via uv:
  uv run --with "rembg[cpu]" --with imageio-ffmpeg --with pillow --with numpy python character-video/cutout_video.py --input raw.mp4 --output out.webm
"""

import argparse
import os
import subprocess
import numpy as np
from PIL import Image
from rembg import new_session, remove
import imageio_ffmpeg


def clean_rgba(rgb_arr: np.ndarray, alpha_arr: np.ndarray, bg_rgb: np.ndarray) -> np.ndarray:
    """Remove studio grey spill from semi-transparent edge pixels and tighten outer fringe."""
    a = alpha_arr.astype(np.float32) / 255.0
    # Tighten soft outer halo below 22% alpha
    a_tight = np.clip((a - 0.22) / 0.76, 0.0, 1.0) ** 1.2

    rgb = rgb_arr.astype(np.float32)
    bg = bg_rgb.reshape((1, 1, 3)).astype(np.float32)
    denom = np.maximum(a[..., None], 0.18)
    decontam = np.clip((rgb - (1.0 - a[..., None]) * bg) / denom, 0.0, 255.0)
    # Blend decontaminated RGB on border pixels (0.05 < a < 0.96)
    edge = ((a > 0.04) & (a < 0.96))[..., None]
    out_rgb = np.where(edge, decontam, rgb).astype(np.uint8)
    out_a = np.round(a_tight * 255.0).astype(np.uint8)
    return np.dstack([out_rgb, out_a])


def estimate_bg_color(rgb_arr: np.ndarray) -> np.ndarray:
    top_left = rgb_arr[:24, :24, :].reshape(-1, 3)
    top_right = rgb_arr[:24, -24:, :].reshape(-1, 3)
    samples = np.vstack([top_left, top_right])
    return np.median(samples, axis=0)


def process_image(inp: str, out: str, session) -> None:
    im = Image.open(inp).convert("RGB")
    rgb = np.array(im)
    bg = estimate_bg_color(rgb)
    cut = np.array(remove(im, session=session))
    cleaned = clean_rgba(rgb, cut[..., 3], bg)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    Image.fromarray(cleaned, mode="RGBA").save(out)


def process_video(inp: str, out: str, width: int, height: int, fps: int, session) -> None:
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)

    decode_cmd = [
        ffmpeg, "-y", "-v", "error",
        "-i", inp,
        "-vf", f"fps={fps},scale={width}:{height}:flags=lanczos",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ]
    encode_cmd = [
        ffmpeg, "-y", "-v", "error",
        "-f", "rawvideo", "-pix_fmt", "rgba",
        "-s", f"{width}x{height}", "-r", str(fps),
        "-i", "-",
        "-c:v", "libvpx-vp9",
        "-pix_fmt", "yuva420p",
        "-b:v", "0", "-crf", "27",
        "-deadline", "good", "-cpu-used", "2",
        "-auto-alt-ref", "0",
        "-an", out,
    ]

    dec = subprocess.Popen(decode_cmd, stdout=subprocess.PIPE)
    enc = subprocess.Popen(encode_cmd, stdin=subprocess.PIPE)

    frame_bytes = width * height * 3
    prev_alpha: np.ndarray | None = None
    prev_rgb: np.ndarray | None = None
    bg_color: np.ndarray | None = None
    count = 0

    try:
        assert dec.stdout is not None and enc.stdin is not None
        while True:
            buf = dec.stdout.read(frame_bytes)
            if len(buf) < frame_bytes:
                break
            rgb = np.frombuffer(buf, dtype=np.uint8).reshape((height, width, 3))
            if bg_color is None:
                bg_color = estimate_bg_color(rgb)

            cut = np.array(remove(Image.fromarray(rgb), session=session))
            alpha = cut[..., 3].astype(np.float32)

            # Temporal anti-flicker smoothing on stationary pixels
            if prev_alpha is not None and prev_rgb is not None:
                diff = np.mean(np.abs(rgb.astype(np.float32) - prev_rgb), axis=2)
                still_weight = np.clip(1.0 - diff / 22.0, 0.0, 1.0) * 0.35
                alpha = alpha * (1.0 - still_weight) + prev_alpha * still_weight

            prev_alpha = alpha
            prev_rgb = rgb.astype(np.float32)

            rgba = clean_rgba(rgb, alpha.astype(np.uint8), bg_color)
            enc.stdin.write(rgba.tobytes())
            count += 1
    finally:
        if dec.stdout:
            dec.stdout.close()
        if enc.stdin:
            enc.stdin.close()
        dec.wait()
        rc = enc.wait()
        if rc != 0:
            raise RuntimeError(f"ffmpeg VP9 alpha encode exited with code {rc}")
    print(f"Encoded {count} transparent frames -> {out}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--width", type=int, default=396)
    ap.add_argument("--height", type=int, default=704)
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--model", default="u2net_human_seg")
    args = ap.parse_args()

    session = new_session(args.model)
    if args.output.lower().endswith(".png"):
        process_image(args.input, args.output, session)
    else:
        process_video(args.input, args.output, args.width, args.height, args.fps, session)


if __name__ == "__main__":
    main()
