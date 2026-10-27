"""
Local 2.5D Pixar Character Clip Synthesizer for Bubba (`Oliver` & `Aria`).

Generates all 18 halo-free transparent VP9 (`yuva420p`) `.webm` companion clips
per character directly from the high-res Pixar standing & sitting cutouts
(`anchor_stand.png`, `anchor_sit.png`) at $0 API cost, and writes
`desktop/public/videos/<character>/manifest.json`.

Run via uv:
  uv run --with pillow --with numpy --with scipy --with imageio-ffmpeg python character-video/synthesize_local_clips.py --character aria
  uv run --with pillow --with numpy --with scipy --with imageio-ffmpeg python character-video/synthesize_local_clips.py --character all
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import json
import math
import os
import subprocess
import time
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates
import imageio_ffmpeg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_W = 396
OUT_H = 704
FPS = 24


def smooth_bell(t: float, t0: float, t1: float) -> float:
    if t <= t0 or t >= t1:
        return 0.0
    u = (t - t0) / (t1 - t0)
    return 0.5 * (1.0 - math.cos(2.0 * math.pi * u))


def smooth_plateau(t: float, t_start: float, t_rise: float, t_fall: float, t_end: float) -> float:
    if t <= t_start or t >= t_end:
        return 0.0
    if t < t_rise:
        u = (t - t_start) / max(1e-5, t_rise - t_start)
        return 0.5 * (1.0 - math.cos(math.pi * u))
    if t <= t_fall:
        return 1.0
    u = (t - t_fall) / max(1e-5, t_end - t_fall)
    return 0.5 * (1.0 + math.cos(math.pi * u))


def smoothstep01(u: float) -> float:
    u = max(0.0, min(1.0, u))
    return u * u * (3.0 - 2.0 * u)


def blink_pulse(t: float, center: float, half_width: float = 0.13) -> float:
    return smooth_bell(t, center - half_width, center + half_width)


@dataclass(frozen=True)
class CharacterRigSpec:
    name: str
    # Standing eyebrows
    brow_cx_mid: float
    brow_floor_y: float
    brow_r: tuple[float, float, float, float]  # cx, cy, rx, ry
    brow_l: tuple[float, float, float, float]
    brow_in: tuple[float, float, float, float]
    # Standing eyes: (cx, y_fold, y_lash, y_bot, rx)
    eye_r: tuple[float, float, float, float, float]
    eye_l: tuple[float, float, float, float, float]
    # Standing mouth
    mcx: float
    mcy: float
    corner_r_xy: tuple[float, float]
    corner_l_xy: tuple[float, float]
    seam_half_w: float
    seam_curve: float
    mouth_half_w: float
    mouth_roi: tuple[int, int, int, int]  # mx0, mx1, my0, my1
    # Cheeks
    cheek_r_xy: tuple[float, float]
    cheek_l_xy: tuple[float, float]
    # Standing head & body
    long_hair_head_gauss: tuple[float, float, float, float] | None
    neck_pivot: tuple[float, float]
    waist_y: float
    chest_xy: tuple[float, float]
    hands_xy: tuple[float, float]
    legs_start_y: float
    # Sitting eyes & head & prop
    sit_eye_r: tuple[float, float, float, float, float, float]  # cx, yf, yl, yb, rx, slope
    sit_eye_l: tuple[float, float, float, float, float, float]
    sit_head_gauss: tuple[float, float, float, float] | None
    sit_neck_pivot: tuple[float, float]
    sit_chest_xy: tuple[float, float]
    sit_prop_xy: tuple[float, float]
    writes_notes: bool = False


OLIVER_SPEC = CharacterRigSpec(
    name="oliver",
    brow_cx_mid=362.5,
    brow_floor_y=114.6,
    brow_r=(338.0, 107.0, 19.0, 7.5),
    brow_l=(387.0, 107.0, 19.0, 7.5),
    brow_in=(362.5, 107.5, 15.0, 7.0),
    eye_r=(338.0, 115.2, 120.2, 129.2, 15.0),
    eye_l=(387.0, 115.2, 120.2, 129.2, 15.0),
    mcx=363.0,
    mcy=169.0,
    corner_r_xy=(340.0, 167.0),
    corner_l_xy=(386.0, 167.0),
    seam_half_w=23.0,
    seam_curve=2.3,
    mouth_half_w=17.5,
    mouth_roi=(322, 404, 150, 222),
    cheek_r_xy=(326.0, 145.0),
    cheek_l_xy=(399.0, 145.0),
    long_hair_head_gauss=None,
    neck_pivot=(362.0, 232.0),
    waist_y=565.0,
    chest_xy=(362.0, 355.0),
    hands_xy=(360.0, 510.0),
    legs_start_y=585.0,
    sit_eye_r=(330.0, 383.5, 388.5, 396.5, 13.0, 0.16),
    sit_eye_l=(371.0, 393.5, 398.0, 405.5, 11.5, 0.18),
    sit_head_gauss=None,
    sit_neck_pivot=(328.0, 475.0),
    sit_chest_xy=(325.0, 565.0),
    sit_prop_xy=(442.0, 592.0),
    writes_notes=False,
)

ARIA_SPEC = CharacterRigSpec(
    name="aria",
    brow_cx_mid=358.0,
    brow_floor_y=132.5,
    brow_r=(325.0, 125.0, 21.0, 8.0),
    brow_l=(391.0, 125.0, 21.0, 8.0),
    brow_in=(358.0, 125.5, 16.0, 7.5),
    eye_r=(327.0, 131.5, 137.8, 162.5, 23.5),
    eye_l=(389.0, 131.5, 137.8, 162.5, 23.5),
    mcx=358.0,
    mcy=204.0,
    corner_r_xy=(332.0, 200.5),
    corner_l_xy=(385.0, 200.5),
    seam_half_w=26.5,
    seam_curve=3.4,
    mouth_half_w=19.0,
    mouth_roi=(314, 402, 184, 256),
    cheek_r_xy=(312.0, 178.0),
    cheek_l_xy=(404.0, 178.0),
    long_hair_head_gauss=(358.0, 152.0, 92.0, 102.0),
    neck_pivot=(358.0, 248.0),
    waist_y=515.0,
    chest_xy=(358.0, 375.0),
    hands_xy=(358.0, 560.0),
    legs_start_y=560.0,
    sit_eye_r=(408.0, 340.5, 346.5, 368.5, 20.5, 0.10),
    sit_eye_l=(466.0, 349.5, 355.0, 376.5, 19.5, 0.12),
    sit_head_gauss=(432.0, 360.0, 88.0, 96.0),
    sit_neck_pivot=(425.0, 445.0),
    sit_chest_xy=(425.0, 545.0),
    sit_prop_xy=(415.0, 585.0),
    writes_notes=True,
)


class CharacterRig:
    """High-precision 720x1280 2.5D displacement & facial rig for Oliver & Aria."""

    def __init__(self, spec: CharacterRigSpec, stand_rgba: np.ndarray, sit_rgba: np.ndarray) -> None:
        self.spec = spec
        self.stand = stand_rgba.astype(np.float32)
        self.sit = sit_rgba.astype(np.float32)
        self.h, self.w, _ = self.stand.shape
        yy, xx = np.mgrid[0 : self.h, 0 : self.w].astype(np.float32)
        self.xx = xx
        self.yy = yy

        brow_floor = spec.brow_floor_y + 3.2 * (((xx - spec.brow_cx_mid) / 44.0) ** 2)
        brow_gate = np.clip((brow_floor - yy) / 3.0, 0.0, 1.0)
        self.brow_r = self._gauss(*spec.brow_r) * brow_gate
        self.brow_l = self._gauss(*spec.brow_l) * brow_gate
        self.brow_inner = self._gauss(*spec.brow_in) * brow_gate

        self.corner_r = self._gauss(spec.corner_r_xy[0], spec.corner_r_xy[1], 13.0, 9.5)
        self.corner_l = self._gauss(spec.corner_l_xy[0], spec.corner_l_xy[1], 13.0, 9.5)
        self.mouth_wide = self._gauss(spec.mcx, spec.mcy, 26.0, 13.0)
        nx_seam = np.clip((xx - spec.mcx) / spec.seam_half_w, -1.5, 1.5)
        y_seam = spec.mcy - spec.seam_curve * (nx_seam ** 2)
        self.mouth_below = 1.0 / (1.0 + np.exp(-np.clip((yy - y_seam) / 1.1, -20.0, 20.0)))
        self.mouth_above = 1.0 - self.mouth_below
        self.jaw_zone = self._gauss(spec.mcx, spec.mcy + 15.0, 29.0, 20.0)
        self.low_lip_zone = self._gauss(spec.mcx, spec.mcy + 3.5, 22.0, 7.5)
        self.up_lip_zone = self._gauss(spec.mcx, spec.mcy - 2.5, 21.0, 4.8)

        self.cheeks = self._gauss(spec.cheek_r_xy[0], spec.cheek_r_xy[1], 17.0, 10.5) + self._gauss(
            spec.cheek_l_xy[0], spec.cheek_l_xy[1], 17.0, 10.5
        )

        if spec.long_hair_head_gauss is not None:
            self.head_w = self._gauss(*spec.long_hair_head_gauss)
        else:
            self.head_w = np.clip((252.0 - yy) / 52.0, 0.0, 1.0)

        self.upper_torso_w = np.clip((spec.waist_y - yy) / 110.0, 0.0, 1.0)
        self.chest_w = self._gauss(spec.chest_xy[0], spec.chest_xy[1], 130.0, 90.0)
        self.hands_clasp_w = self._gauss(spec.hands_xy[0], spec.hands_xy[1], 80.0, 42.0)
        self.legs_w = np.clip((yy - spec.legs_start_y) / 85.0, 0.0, 1.0)
        self.left_leg_side = 1.0 / (1.0 + np.exp(-np.clip(((spec.mcx - 2.0) - xx) / 5.0, -20.0, 20.0)))
        self.right_leg_side = 1.0 - self.left_leg_side

        if spec.sit_head_gauss is not None:
            self.sit_head_w = self._gauss(*spec.sit_head_gauss)
        else:
            self.sit_head_w = np.clip((492.0 - yy) / 52.0, 0.0, 1.0)
        self.sit_chest_w = self._gauss(spec.sit_chest_xy[0], spec.sit_chest_xy[1], 125.0, 85.0)
        self.sit_prop_w = self._gauss(spec.sit_prop_xy[0], spec.sit_prop_xy[1], 56.0, 48.0)

    def _gauss(self, cx: float, cy: float, rx: float, ry: float) -> np.ndarray:
        return np.exp(-0.5 * (((self.xx - cx) / rx) ** 2 + ((self.yy - cy) / ry) ** 2)).astype(np.float32)

    def _warp_full(self, img: np.ndarray, dx: np.ndarray, dy: np.ndarray) -> np.ndarray:
        sx = np.clip(self.xx - dx, 0.0, self.w - 1.0)
        sy = np.clip(self.yy - dy, 0.0, self.h - 1.0)
        out = np.empty_like(img)
        for c in range(4):
            out[..., c] = map_coordinates(img[..., c], [sy, sx], order=1, mode="constant", cval=0.0)
        return out

    def _blink_roi(
        self,
        img: np.ndarray,
        cx: float,
        y_fold: float,
        y_lash: float,
        y_bot: float,
        rx: float,
        blink: float,
        squint: float = 0.0,
        slope: float = 0.0,
        gaze_x: float = 0.0,
        gaze_y: float = 0.0,
    ) -> None:
        if blink <= 0.004 and abs(squint) <= 0.004 and abs(gaze_x) <= 0.02 and abs(gaze_y) <= 0.02:
            return
        x0 = max(0, int(cx - rx - 8))
        x1 = min(self.w, int(cx + rx + 9))
        y0 = max(0, int(y_fold - 6))
        y1 = min(self.h, int(y_bot + 16))

        sub = img[y0:y1, x0:x1].copy()
        sh, sw, _ = sub.shape
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)

        nx = (xx - cx) / rx
        is_tall_eye = (y_bot - y_lash) > 13.0
        if is_tall_eye:
            horiz = np.clip(1.0 - (nx ** 2) ** 1.6, 0.0, 1.0) ** 0.45
        else:
            horiz = np.clip(1.0 - nx ** 2, 0.0, 1.0) ** 0.65
        eye_ap_x = np.clip(1.0 - (nx * 1.04) ** 2, 0.0, 1.0)
        tilt_off = slope * (xx - cx)

        yf = y_fold + tilt_off + (4.8 * (nx ** 2) if is_tall_eye else 0.0)
        yl = y_lash + tilt_off + (3.2 * (nx ** 2) if is_tall_eye else 0.0)
        yb = y_bot + tilt_off

        dx = np.zeros_like(xx)
        dy = np.zeros_like(yy)

        if (abs(gaze_x) > 0.02 or abs(gaze_y) > 0.02) and blink < 0.7:
            iris_w = (
                np.clip(1.0 - nx ** 2, 0.0, 1.0)
                * np.clip((yy - yl) / 2.0, 0.0, 1.0)
                * np.clip((yb - yy) / 2.0, 0.0, 1.0)
            )
            dx += gaze_x * iris_w * (1.0 - blink)
            dy += gaze_y * iris_w * (1.0 - blink)

        bot_target = yb + (1.0 if is_tall_eye else 0.0) - max(0.0, squint) * (3.4 if is_tall_eye else 2.6) * eye_ap_x
        arch = (1.3 if squint > 0.35 else -0.9) * eye_ap_x * blink
        lash_cur = yl + blink * (bot_target - yl) * horiz + arch

        orig_span = np.maximum(1.5, yl - yf)
        cur_span = np.maximum(orig_span, lash_cur - yf)
        in_upper = (yy >= yf) & (yy <= lash_cur) & (horiz > 0.02)
        sy_upper = yf + (yy - yf) * (orig_span / cur_span)
        dy = np.where(in_upper, yy - sy_upper, dy)

        if abs(squint) > 0.004:
            sq_m = eye_ap_x * np.clip((yy - (yb - 3.8)) / 3.8, 0.0, 1.0) * np.clip(((yb + 13.0) - yy) / 7.5, 0.0, 1.0)
            dy += -squint * (3.8 if is_tall_eye else 3.0) * sq_m

        sx_l = np.clip((xx - x0) - dx, 0.0, sw - 1.0)
        sy_l = np.clip((yy - y0) - dy, 0.0, sh - 1.0)
        warped = np.empty_like(sub)
        for c in range(4):
            warped[..., c] = map_coordinates(sub[..., c], [sy_l, sx_l], order=1, mode="nearest")

        if is_tall_eye and blink > 0.25:
            lid_mask = (
                np.clip((yy - (yf + 2.0)) / 3.2, 0.0, 1.0)
                * np.clip((lash_cur - yy) / 1.6, 0.0, 1.0)
                * np.clip(1.0 - (nx * 1.06) ** 2, 0.0, 1.0)
                * np.clip((blink - 0.25) / 0.55, 0.0, 1.0)
            )
            v_prog = np.clip((yy - yf) / np.maximum(4.0, lash_cur - yf), 0.0, 1.0)
            sphere = (1.0 - 0.16 * (nx ** 2)) * (0.90 + 0.12 * np.sin(np.pi * v_prog))
            peach_lid = np.array([232.0, 179.0, 160.0], dtype=np.float32)[None, None, :] * sphere[..., None]
            fold_line = np.clip(1.0 - np.abs(yy - (yf + 3.2)) / 1.6, 0.0, 1.0) * 0.18
            peach_lid *= (1.0 - fold_line[..., None])
            lm = (lid_mask * 0.85)[..., None]
            warped[..., :3] = warped[..., :3] * (1.0 - lm) + peach_lid * lm

        if blink > 0.52:
            crease = (
                np.clip(1.0 - np.abs(yy - lash_cur) / (1.55 if is_tall_eye else 1.25), 0.0, 1.0)
                * (eye_ap_x ** 0.45)
                * ((blink - 0.52) / 0.48)
            )
            lash_col = np.array([44.0, 24.0, 22.0], dtype=np.float32)
            strength = 0.80 if is_tall_eye else 0.62
            warped[..., :3] = warped[..., :3] * (1.0 - crease[..., None] * strength) + lash_col[None, None, :] * (
                crease[..., None] * strength
            )

        img[y0:y1, x0:x1] = warped

    def render_standing(
        self,
        *,
        blink_r: float = 0.0,
        blink_l: float = 0.0,
        squint_r: float = 0.0,
        squint_l: float = 0.0,
        gaze_x: float = 0.0,
        gaze_y: float = 0.0,
        brow_r_lift: float = 0.0,
        brow_l_lift: float = 0.0,
        brow_inner_lift: float = 0.0,
        mouth_open: float = 0.0,
        smile: float = 0.0,
        smirk_lr: float = 0.0,
        mouth_width: float = 0.0,
        show_teeth: float = 0.55,
        head_roll_deg: float = 0.0,
        head_nod_px: float = 0.0,
        head_turn_px: float = 0.0,
        breath: float = 0.0,
        torso_bow: float = 0.0,
        upper_scale: float = 1.0,
        body_bob_y: float = 0.0,
        hands_bounce_y: float = 0.0,
        stride_phase: float | None = None,
        blush: float = 0.0,
    ) -> np.ndarray:
        sp = self.spec
        work = self.stand.copy()

        self._blink_roi(work, *sp.eye_r, blink_r, squint_r, gaze_x=gaze_x, gaze_y=gaze_y)
        self._blink_roi(work, *sp.eye_l, blink_l, squint_l, gaze_x=gaze_x, gaze_y=gaze_y)

        if blush > 0.01:
            b = (blush * self.cheeks)[..., None]
            work[..., 0] = np.clip(work[..., 0] + 18.0 * b[..., 0], 0.0, 255.0)
            work[..., 1] = np.clip(work[..., 1] - 5.0 * b[..., 0], 0.0, 255.0)

        dx = np.zeros_like(self.xx)
        dy = np.zeros_like(self.yy)

        if abs(brow_r_lift) > 0.01 or abs(brow_l_lift) > 0.01 or abs(brow_inner_lift) > 0.01:
            dy += -brow_r_lift * self.brow_r - brow_l_lift * self.brow_l - brow_inner_lift * self.brow_inner

        drop_px = mouth_open * 13.0
        lift_px = mouth_open * 2.4
        if mouth_open > 0.005 or abs(smile) > 0.005 or abs(smirk_lr) > 0.005 or abs(mouth_width) > 0.005:
            dy += -3.6 * smile * (self.corner_r + self.corner_l)
            dx += -1.8 * smile * self.corner_r + 1.8 * smile * self.corner_l
            if abs(smirk_lr) > 0.005:
                tc = self.corner_l if smirk_lr > 0 else self.corner_r
                sgn = 1.0 if smirk_lr > 0 else -1.0
                dy += -4.5 * abs(smirk_lr) * tc
                dx += 2.6 * sgn * abs(smirk_lr) * tc
            dx += (self.xx - sp.mcx) * (0.11 * mouth_width) * self.mouth_wide
            dy += self.mouth_below * (drop_px * 0.65 * self.jaw_zone + drop_px * 0.50 * self.low_lip_zone)
            dy += -self.mouth_above * (lift_px * self.up_lip_zone)

        if mouth_open > 0.045:
            mx0, mx1, my0, my1 = sp.mouth_roi
            msub = work[my0:my1, mx0:mx1]
            msx = np.clip((self.xx[my0:my1, mx0:mx1] - mx0) - dx[my0:my1, mx0:mx1], 0.0, mx1 - mx0 - 1.0)
            msy = np.clip((self.yy[my0:my1, mx0:mx1] - my0) - dy[my0:my1, mx0:mx1], 0.0, my1 - my0 - 1.0)
            mw = np.empty_like(msub)
            for c in range(4):
                mw[..., c] = map_coordinates(msub[..., c], [msy, msx], order=1, mode="nearest")

            lxx = self.xx[my0:my1, mx0:mx1]
            lyy = self.yy[my0:my1, mx0:mx1]
            half_w = max(11.5, sp.mouth_half_w + 3.5 * smile + 3.2 * mouth_width)
            nx = (lxx - sp.mcx) / half_w
            taper = np.clip(1.0 - nx ** 2, 0.0, 1.0) ** 0.72
            curve = (-sp.seam_curve - 2.2 * smile) * (nx ** 2)
            if abs(smirk_lr) > 0.01:
                curve += -2.0 * smirk_lr * np.clip(nx, -1.0, 1.0) * (nx ** 2)

            top_in = (sp.mcy - 0.2 - lift_px * 0.85) + curve
            bot_in = (sp.mcy + 0.3 + drop_px * 0.82 * taper) + curve

            in_top = np.clip((lyy - top_in) / 1.1, 0.0, 1.0)
            in_bot = np.clip((bot_in - lyy) / 1.2, 0.0, 1.0)
            cavity = in_top * in_bot * np.clip((1.0 - np.abs(nx)) * 4.0, 0.0, 1.0) * (taper ** 0.35)

            teeth_h = (1.1 + 2.2 * mouth_open * show_teeth + 0.9 * max(0.0, smile)) * taper
            teeth_m = (
                np.clip(((top_in + teeth_h) - lyy) / 1.05, 0.0, 1.0)
                * np.clip(1.0 - (nx * 1.06) ** 2, 0.0, 1.0)
                * show_teeth
            )
            tooth_shade = (0.96 - 0.20 * (nx ** 2)) * (0.84 + 0.16 * np.clip((lyy - top_in) / 1.6, 0.0, 1.0))
            teeth_rgb = np.array([244.0, 238.0, 232.0], dtype=np.float32)[None, None, :] * tooth_shade[..., None]

            tongue_top = bot_in - drop_px * 0.35 * taper
            tongue_m = np.clip((lyy - tongue_top) / 1.4, 0.0, 1.0) * (1.0 - teeth_m)
            tongue_rgb = np.array([156.0, 78.0, 80.0], dtype=np.float32)[None, None, :] * (0.85 + 0.15 * taper)[..., None]

            dark_rgb = np.array([42.0, 20.0, 24.0], dtype=np.float32)[None, None, :]
            inner = dark_rgb * (1.0 - tongue_m[..., None]) + tongue_rgb * tongue_m[..., None]
            inner = inner * (1.0 - teeth_m[..., None]) + teeth_rgb * teeth_m[..., None]

            cm = cavity[..., None]
            mw[..., :3] = mw[..., :3] * (1.0 - cm) + inner * cm
            work[my0:my1, mx0:mx1] = mw
            feather_roi = self._gauss(sp.mcx, sp.mcy + 12.0, 34.0, 24.0)
            dx *= (1.0 - feather_roi)
            dy *= (1.0 - feather_roi)

        if abs(breath) > 0.005:
            dy += -2.2 * breath * self.chest_w
            dx += (self.xx - sp.chest_xy[0]) * (0.006 * breath) * self.chest_w

        if abs(hands_bounce_y) > 0.01:
            dy += hands_bounce_y * self.hands_clasp_w

        if abs(head_roll_deg) > 0.01 or abs(head_nod_px) > 0.01 or abs(head_turn_px) > 0.01:
            npx, npy = sp.neck_pivot
            ang = np.deg2rad(head_roll_deg) * self.head_w
            ca = np.cos(ang)
            sa = np.sin(ang)
            px = self.xx - npx
            py = self.yy - npy
            dx += (px * ca - py * sa + npx - self.xx) + head_turn_px * self.head_w
            dy += (px * sa + py * ca + npy - self.yy) + head_nod_px * self.head_w

        if torso_bow > 0.005:
            above_waist = np.clip((sp.waist_y - self.yy) / 360.0, 0.0, 1.4)
            dy += torso_bow * 34.0 * (above_waist ** 1.15) * self.upper_torso_w
            dx += (self.xx - sp.mcx) * (0.025 * torso_bow) * above_waist * self.upper_torso_w

        if abs(upper_scale - 1.0) > 0.001:
            s_amt = (upper_scale - 1.0) * self.upper_torso_w
            dx += (self.xx - sp.mcx) * s_amt
            dy += (self.yy - sp.waist_y) * s_amt

        if stride_phase is not None:
            s = math.sin(stride_phase)
            bob = -7.0 * abs(s)
            dy += bob
            leg_prog = np.clip((self.yy - (sp.legs_start_y + 15.0)) / 580.0, 0.0, 1.0)
            swing_l = s * 10.5 * leg_prog * self.left_leg_side * self.legs_w
            swing_r = -s * 10.5 * leg_prog * self.right_leg_side * self.legs_w
            lift_l = -max(0.0, s) * 8.5 * leg_prog * self.left_leg_side * self.legs_w
            lift_r = -max(0.0, -s) * 8.5 * leg_prog * self.right_leg_side * self.legs_w
            dx += swing_l + swing_r
            dy += lift_l + lift_r
            dx += -s * 2.4 * self.head_w

        if abs(body_bob_y) > 0.01:
            dy += body_bob_y

        return self._warp_full(work, dx, dy)

    def render_sitting(
        self,
        *,
        blink: float = 0.0,
        head_roll_deg: float = 0.0,
        head_nod_px: float = 0.0,
        breath: float = 0.0,
        prop_bob_x: float = 0.0,
        prop_bob_y: float = 0.0,
        body_offset_y: float = 0.0,
    ) -> np.ndarray:
        sp = self.spec
        work = self.sit.copy()
        r = sp.sit_eye_r
        l = sp.sit_eye_l
        self._blink_roi(work, r[0], r[1], r[2], r[3], r[4], blink, slope=r[5])
        self._blink_roi(work, l[0], l[1], l[2], l[3], l[4], blink, slope=l[5])

        dx = np.zeros_like(self.xx)
        dy = np.zeros_like(self.yy)

        if abs(breath) > 0.005:
            dy += -2.0 * breath * self.sit_chest_w
            dx += (self.xx - sp.sit_chest_xy[0]) * (0.005 * breath) * self.sit_chest_w

        if abs(prop_bob_x) > 0.01 or abs(prop_bob_y) > 0.01:
            dx += prop_bob_x * self.sit_prop_w
            dy += prop_bob_y * self.sit_prop_w

        if abs(head_roll_deg) > 0.01 or abs(head_nod_px) > 0.01:
            npx, npy = sp.sit_neck_pivot
            ang = np.deg2rad(head_roll_deg) * self.sit_head_w
            ca = np.cos(ang)
            sa = np.sin(ang)
            px = self.xx - npx
            py = self.yy - npy
            dx += px * ca - py * sa + npx - self.xx
            dy += (px * sa + py * ca + npy - self.yy) + head_nod_px * self.sit_head_w

        if abs(body_offset_y) > 0.01:
            dy += body_offset_y

        return self._warp_full(work, dx, dy)


def encode_clip(rig: CharacterRig, out_dir: str, name: str, duration: float, frame_fn) -> None:
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    out_path = os.path.join(out_dir, f"{name}.webm")
    n_frames = max(12, int(round(duration * FPS)))

    cmd = [
        ffmpeg, "-y", "-v", "error",
        "-f", "rawvideo", "-pix_fmt", "rgba",
        "-s", f"{rig.w}x{rig.h}", "-r", str(FPS),
        "-i", "-",
        "-vf", f"scale={OUT_W}:{OUT_H}:flags=lanczos",
        "-c:v", "libvpx-vp9",
        "-pix_fmt", "yuva420p",
        "-b:v", "0", "-crf", "26",
        "-deadline", "good", "-cpu-used", "3",
        "-auto-alt-ref", "0",
        "-an", out_path,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert proc.stdin is not None
    t0 = time.perf_counter()
    try:
        for i in range(n_frames):
            t = i / FPS
            u = i / n_frames
            rgba_f = frame_fn(t, u, duration)
            rgba_u8 = np.clip(np.round(rgba_f), 0.0, 255.0).astype(np.uint8)
            proc.stdin.write(rgba_u8.tobytes())
    finally:
        proc.stdin.close()
        rc = proc.wait()
        if rc != 0:
            raise RuntimeError(f"ffmpeg failed on {rig.spec.name}/{name} with exit code {rc}")
    dt = time.perf_counter() - t0
    kb = os.path.getsize(out_path) / 1024.0
    print(f"  [ok] {rig.spec.name}/{name:15s} ({n_frames:3d}f, {kb:5.1f} KB, {dt:.2f}s)", flush=True)


def build_character(spec: CharacterRigSpec) -> None:
    out_dir = os.path.join(ROOT, "desktop", "public", "videos", spec.name)
    stand_path = os.path.join(out_dir, "anchor_stand.png")
    sit_path = os.path.join(out_dir, "anchor_sit.png")
    os.makedirs(out_dir, exist_ok=True)

    stand = np.array(Image.open(stand_path).convert("RGBA"))
    sit = np.array(Image.open(sit_path).convert("RGBA"))
    rig = CharacterRig(spec, stand, sit)

    jobs: list[tuple[str, float, object]] = []
    clips: list[str] = []

    def add(name: str, duration: float, fn) -> None:
        jobs.append((name, duration, fn))
        clips.append(name)

    print(f"Synthesizing 18 Pixar-style transparent WebM clips for {spec.name} (6x parallel)...", flush=True)

    add(
        "idle",
        4.0,
        lambda t, u, d: rig.render_standing(
            breath=math.sin(2.0 * math.pi * u),
            head_roll_deg=0.45 * math.sin(2.0 * math.pi * u),
            blink_r=max(blink_pulse(t, 1.15), blink_pulse(t, 3.10)),
            blink_l=max(blink_pulse(t, 1.15), blink_pulse(t, 3.10)),
        ),
    )

    def talk_fn(t: float, u: float, d: float) -> np.ndarray:
        env = math.sin(math.pi * u) ** 0.30
        syl_beat = abs(math.sin(math.pi * 9.0 * u)) ** 0.72
        vowel_mod = 0.75 + 0.25 * math.sin(2.0 * math.pi * 3.0 * u + 0.5)
        m_open = max(0.0, min(0.92, (0.20 + 0.72 * syl_beat * vowel_mod) * env))
        m_width = 0.28 * math.sin(2.0 * math.pi * 4.0 * u + 0.4) * env
        b_lift = (1.8 + 2.2 * max(0.0, math.sin(2.0 * math.pi * 2.0 * u))) * env
        bl = blink_pulse(t, 1.75)
        return rig.render_standing(
            mouth_open=m_open,
            smile=0.12 * env,
            mouth_width=m_width,
            show_teeth=0.62,
            brow_r_lift=b_lift,
            brow_l_lift=b_lift,
            head_nod_px=1.0 * math.sin(2.0 * math.pi * 2.0 * u) * env,
            breath=math.sin(2.0 * math.pi * u),
            blink_r=bl,
            blink_l=bl,
        )

    add("talking", 3.5, talk_fn)

    def listen_fn(t: float, u: float, d: float) -> np.ndarray:
        env = math.sin(math.pi * u) ** 0.55
        nod = 3.2 * (smooth_bell(t, 0.7, 1.35) + 0.8 * smooth_bell(t, 2.0, 2.65))
        bl = max(blink_pulse(t, 1.05), blink_pulse(t, 2.75))
        return rig.render_standing(
            head_roll_deg=2.2 * env,
            head_nod_px=nod,
            upper_scale=1.0 + 0.016 * env,
            brow_r_lift=2.2 * env,
            brow_l_lift=2.2 * env,
            smile=0.22 * env,
            breath=math.sin(2.0 * math.pi * u),
            blink_r=bl,
            blink_l=bl,
        )

    add("listening", 3.5, listen_fn)

    def think_fn(t: float, u: float, d: float) -> np.ndarray:
        env = smooth_plateau(t, 0.0, 0.55, 2.95, 3.5)
        bl = max(blink_pulse(t, 0.50), blink_pulse(t, 2.95))
        return rig.render_standing(
            head_roll_deg=-2.8 * env,
            head_nod_px=-1.8 * env,
            brow_r_lift=-2.2 * env,
            brow_l_lift=4.4 * env,
            smirk_lr=-0.35 * env,
            gaze_x=-2.4 * env,
            gaze_y=-1.6 * env,
            breath=math.sin(2.0 * math.pi * u),
            blink_r=bl,
            blink_l=bl,
        )

    add("thinking", 3.5, think_fn)

    add(
        "walk",
        1.2,
        lambda t, u, d: rig.render_standing(
            stride_phase=2.0 * math.pi * u,
            blink_r=blink_pulse(t, 0.60, 0.11),
            blink_l=blink_pulse(t, 0.60, 0.11),
        ),
    )

    def sit_down_fn(t: float, u: float, d: float) -> np.ndarray:
        p = smoothstep01(u)
        if p < 0.25:
            k = p / 0.25
            return rig.render_standing(
                body_bob_y=95.0 * (k ** 1.4),
                torso_bow=0.35 * k,
                blink_r=blink_pulse(u, 0.30, 0.22),
                blink_l=blink_pulse(u, 0.30, 0.22),
            )
        if p > 0.78:
            k = (1.0 - p) / 0.22
            return rig.render_sitting(
                body_offset_y=-55.0 * (k ** 1.4),
                head_nod_px=4.0 * k,
            )
        alpha = smoothstep01((p - 0.25) / 0.53)
        f_st = rig.render_standing(
            body_bob_y=95.0 + 135.0 * alpha,
            torso_bow=0.35,
            blink_r=0.8 * (1.0 - abs(2.0 * alpha - 1.0)),
            blink_l=0.8 * (1.0 - abs(2.0 * alpha - 1.0)),
        )
        f_si = rig.render_sitting(
            body_offset_y=-140.0 * (1.0 - alpha),
            blink=0.8 * (1.0 - abs(2.0 * alpha - 1.0)),
        )
        st_pm = f_st[..., :3] * (f_st[..., 3:4] / 255.0)
        si_pm = f_si[..., :3] * (f_si[..., 3:4] / 255.0)
        out_a = f_st[..., 3:4] * (1.0 - alpha) + f_si[..., 3:4] * alpha
        out_pm = st_pm * (1.0 - alpha) + si_pm * alpha
        out_rgb = np.where(out_a > 1.0, out_pm / np.maximum(out_a / 255.0, 1e-3), 0.0)
        return np.dstack([out_rgb, out_a])

    add("sit_down", 1.25, sit_down_fn)

    def sit_focus_fn(t: float, u: float, d: float) -> np.ndarray:
        glance = smooth_plateau(t, 0.85, 1.45, 2.85, 3.50)
        bl = max(blink_pulse(t, 0.85), blink_pulse(t, 3.35))
        # Aria gently writes fountain-pen strokes in her leather journal; Oliver glances at his pocket watch
        pen_x = 3.2 * math.sin(2.0 * math.pi * 2.2 * t) * glance if spec.writes_notes else 0.0
        pen_y = (1.8 * math.cos(2.0 * math.pi * 4.4 * t) - 1.5) * glance if spec.writes_notes else -2.2 * glance
        return rig.render_sitting(
            breath=math.sin(2.0 * math.pi * u),
            head_roll_deg=2.6 * glance,
            head_nod_px=5.5 * glance,
            prop_bob_x=pen_x,
            prop_bob_y=pen_y,
            blink=bl,
        )

    add("sitting_focus", 4.5, sit_focus_fn)
    add("stand_up", 1.15, lambda t, u, d: sit_down_fn((1.0 - u) * 1.25, 1.0 - u, 1.25))

    def flirty_wink_fn(t: float, u: float, d: float) -> np.ndarray:
        pose = smooth_plateau(t, 0.12, 0.48, 1.72, 2.28)
        wink = smooth_plateau(t, 0.46, 0.62, 1.38, 1.62)
        brow_bounce = 5.8 * smooth_bell(t, 0.25, 0.62) + 6.4 * smooth_bell(t, 0.60, 1.05) + 2.5 * pose
        brow_cap = min(6.8, brow_bounce)
        return rig.render_standing(
            blink_r=wink,
            squint_r=0.58 * wink,
            squint_l=0.18 * pose,
            brow_r_lift=0.82 * brow_cap,
            brow_l_lift=brow_cap,
            smile=0.28 * pose,
            smirk_lr=0.88 * pose,
            head_roll_deg=3.0 * pose,
            upper_scale=1.0 + 0.012 * pose,
        )

    add("flirty_wink", 2.4, flirty_wink_fn)

    def cheeky_smirk_fn(t: float, u: float, d: float) -> np.ndarray:
        pose = smooth_plateau(t, 0.12, 0.50, 1.65, 2.20)
        bl = blink_pulse(t, 0.32, 0.11)
        return rig.render_standing(
            head_roll_deg=-3.2 * pose,
            brow_r_lift=-1.6 * pose,
            brow_l_lift=6.6 * pose,
            smirk_lr=0.95 * pose,
            smile=0.22 * pose,
            squint_r=0.32 * pose,
            blink_r=bl,
            blink_l=bl,
            breath=0.6 * pose,
        )

    add("cheeky_smirk", 2.3, cheeky_smirk_fn)

    def warm_laugh_fn(t: float, u: float, d: float) -> np.ndarray:
        pose = smooth_plateau(t, 0.10, 0.42, 1.85, 2.40)
        chuckle = math.sin(2.0 * math.pi * 4.6 * t) * smooth_bell(t, 0.20, 2.15)
        return rig.render_standing(
            mouth_open=(0.76 + 0.16 * max(0.0, chuckle)) * pose,
            smile=0.86 * pose,
            mouth_width=0.34 * pose,
            show_teeth=0.92,
            blink_r=0.18 * pose,
            blink_l=0.18 * pose,
            squint_r=0.68 * pose,
            squint_l=0.68 * pose,
            brow_r_lift=4.6 * pose,
            brow_l_lift=4.6 * pose,
            head_roll_deg=2.2 * pose,
            head_nod_px=-2.5 * chuckle,
            breath=0.8 * chuckle,
            body_bob_y=-2.8 * abs(chuckle),
        )

    add("warm_laugh", 2.5, warm_laugh_fn)

    def flattered_fn(t: float, u: float, d: float) -> np.ndarray:
        pose = smooth_plateau(t, 0.12, 0.55, 1.75, 2.30)
        bl = max(blink_pulse(t, 0.48, 0.14), blink_pulse(t, 0.85, 0.14))
        return rig.render_standing(
            head_roll_deg=3.2 * pose,
            head_nod_px=4.5 * pose,
            head_turn_px=-2.5 * pose,
            smile=0.65 * pose,
            brow_inner_lift=3.2 * pose,
            squint_r=0.38 * pose,
            squint_l=0.38 * pose,
            blink_r=bl,
            blink_l=bl,
            blush=0.90 * pose,
        )

    add("flattered", 2.4, flattered_fn)

    def bow_fn(t: float, u: float, d: float) -> np.ndarray:
        bow = smooth_plateau(t, 0.15, 0.78, 1.55, 2.30)
        after_smile = smooth_bell(t, 1.65, 2.50)
        return rig.render_standing(
            torso_bow=0.88 * bow,
            head_nod_px=9.5 * bow,
            blink_r=0.96 * bow,
            blink_l=0.96 * bow,
            smile=0.38 * bow + 0.55 * after_smile,
            brow_r_lift=2.5 * after_smile,
            brow_l_lift=2.5 * after_smile,
        )

    add("gentleman_bow", 2.6, bow_fn)

    def cheer_fn(t: float, u: float, d: float) -> np.ndarray:
        pose = smooth_plateau(t, 0.10, 0.40, 1.90, 2.40)
        pump = abs(math.sin(2.0 * math.pi * 3.2 * t)) * smooth_bell(t, 0.15, 2.20)
        bl = blink_pulse(t, 2.10, 0.12)
        return rig.render_standing(
            mouth_open=0.88 * pose,
            smile=0.90 * pose,
            mouth_width=0.38 * pose,
            show_teeth=0.95,
            brow_r_lift=5.5 * pose,
            brow_l_lift=5.5 * pose,
            squint_r=0.55 * pose,
            squint_l=0.55 * pose,
            blink_r=bl,
            blink_l=bl,
            body_bob_y=-7.0 * pump,
            hands_bounce_y=-11.0 * pump,
            upper_scale=1.0 + 0.018 * pose,
        )

    add("proud_cheer", 2.5, cheer_fn)

    def symp_fn(t: float, u: float, d: float) -> np.ndarray:
        pose = smooth_plateau(t, 0.12, 0.55, 1.85, 2.40)
        nod = 3.8 * (smooth_bell(t, 0.65, 1.25) + 0.85 * smooth_bell(t, 1.35, 1.95))
        bl = blink_pulse(t, 0.55, 0.14)
        return rig.render_standing(
            head_roll_deg=3.4 * pose,
            head_nod_px=nod,
            brow_inner_lift=5.2 * pose,
            brow_r_lift=-1.4 * pose,
            brow_l_lift=-1.4 * pose,
            smile=0.18 * pose,
            upper_scale=1.0 + 0.015 * pose,
            blink_r=bl,
            blink_l=bl,
        )

    add("sympathetic", 2.5, symp_fn)

    def surp_fn(t: float, u: float, d: float) -> np.ndarray:
        pop = smooth_plateau(t, 0.08, 0.26, 1.15, 1.65)
        recov = smooth_bell(t, 1.25, 2.02)
        bl = max(blink_pulse(t, 1.32, 0.10), blink_pulse(t, 1.62, 0.10))
        return rig.render_standing(
            brow_r_lift=6.8 * pop,
            brow_l_lift=6.8 * pop,
            mouth_open=0.64 * pop,
            mouth_width=-0.30 * pop,
            smile=0.45 * recov,
            show_teeth=0.35,
            upper_scale=1.0 - 0.018 * pop,
            head_nod_px=-3.5 * pop,
            blink_r=bl,
            blink_l=bl,
        )

    add("surprised", 2.1, surp_fn)

    def caught_fn(t: float, u: float, d: float) -> np.ndarray:
        pose = smooth_plateau(t, 0.12, 0.45, 1.85, 2.40)
        shake = math.sin(2.0 * math.pi * 1.6 * (t - 0.35)) * smooth_bell(t, 0.35, 1.95)
        return rig.render_standing(
            brow_r_lift=-2.4 * pose,
            brow_l_lift=6.8 * pose,
            blink_r=0.22 * pose,
            squint_r=0.42 * pose,
            smirk_lr=0.72 * pose,
            head_roll_deg=2.4 * shake,
            head_turn_px=4.2 * shake,
        )

    add("caught_you", 2.5, caught_fn)

    def yawn_fn(t: float, u: float, d: float) -> np.ndarray:
        drowsy = smooth_plateau(t, 0.10, 0.55, 2.35, 2.90)
        yawn = smooth_plateau(t, 0.45, 0.95, 1.85, 2.40)
        return rig.render_standing(
            blink_r=0.45 * drowsy + 0.50 * yawn,
            blink_l=0.45 * drowsy + 0.50 * yawn,
            mouth_open=0.92 * yawn,
            mouth_width=-0.32 * yawn,
            smile=-0.12 * yawn,
            show_teeth=0.22,
            head_roll_deg=2.5 * drowsy,
            head_nod_px=-3.5 * yawn + 2.5 * (drowsy - yawn),
            breath=1.2 * yawn,
        )

    add("sleepy_yawn", 3.0, yawn_fn)

    t_all = time.perf_counter()
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = [pool.submit(encode_clip, rig, out_dir, name, dur, fn) for (name, dur, fn) in jobs]
        for fut in futs:
            fut.result()

    manifest = {
        "anchors": {
            "stand": "anchor_stand.png",
            "sit": "anchor_sit.png",
        },
        "clips": clips,
    }
    manifest_path = os.path.join(out_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"Wrote {manifest_path} with {len(clips)} clips in {time.perf_counter() - t_all:.1f}s.", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--character", choices=["oliver", "aria", "all"], default="all")
    args = ap.parse_args()

    if args.character in ("oliver", "all"):
        build_character(OLIVER_SPEC)
    if args.character in ("aria", "all"):
        build_character(ARIA_SPEC)


if __name__ == "__main__":
    main()
