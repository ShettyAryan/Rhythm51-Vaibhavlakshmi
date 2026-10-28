"""
Generates clearly-labelled DEMO content for development:

  * synthetic equirectangular panoramas ray-cast from simple box rooms
    (watermarked "DEMO PANORAMA - NOT PROPERTY IMAGERY"),
  * matching demo floor plan / site plan images,
  * a hero image and logo extracted from the supplied brochure PDF (if present),
  * a small floor-plan PDF made from the brochure's layout pages (if present),
  * seed/demo/manifest.json describing rooms, access points and hotspots.

Hotspot yaw/pitch values are computed geometrically from the same layout used to
render the panoramas, so they land exactly on the doors/positions they describe.
The conventions match lib/tour/geometry.ts:
  yaw 0 = image centre column, positive = turn right; pitch 0 = horizon, + up.
  plan bearing = yaw + heading_offset (+ plan orientation offset, 0 here).

Usage:  python scripts/generate-demo-assets.py
Requires: numpy, Pillow; PyMuPDF (fitz) for the brochure-derived assets.
"""

import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "seed", "demo")
BROCHURE = os.path.join(ROOT, "references", "Rhythm 51 brochure.pdf")
W, H = 4096, 2048
CAM_H = 1.5


def font(size, bold=False):
    for name in (["arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["arial.ttf", "DejaVuSans.ttf"]):
        for base in ["C:/Windows/Fonts", "/usr/share/fonts/truetype/dejavu", "/Library/Fonts"]:
            p = os.path.join(base, name)
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def norm_yaw(a):
    a = ((a % 360) + 360) % 360
    return a - 360 if a > 180 else a


# ---------------------------------------------------------------------------
# Layouts (metres; plan x to the right, plan y DOWN; bearing 0 = plan up)
# ---------------------------------------------------------------------------

APARTMENT = {
    "plan": {"file": "plan-apartment.png", "name": "Demo Apartment Layout", "ppm": 110, "size": (9.0, 9.0), "margin": 0.8},
    "groups": [
        {"key": "living", "name": "Living Room", "box": (0, 0, 6, 5), "wall": (236, 226, 212), "floor": (176, 140, 104),
         "windows": [("N", 1.0, 5.0)]},
        {"key": "kitchen", "name": "Kitchen", "box": (6, 0, 9, 3), "wall": (230, 222, 214), "floor": (205, 200, 192),
         "windows": [("N", 6.8, 8.4)]},
        {"key": "bath", "name": "Bathroom", "box": (6, 3, 9, 5), "wall": (214, 222, 226), "floor": (190, 196, 200),
         "windows": [("E", 3.6, 4.4)]},
        {"key": "master", "name": "Master Bedroom", "box": (0, 5, 5, 9), "wall": (226, 214, 214), "floor": (160, 124, 96),
         "windows": [("S", 1.5, 3.5), ("W", 6.0, 8.0)]},
        {"key": "bed2", "name": "Bedroom 2", "box": (5, 5, 9, 9), "wall": (222, 226, 214), "floor": (168, 132, 100),
         "windows": [("S", 6.0, 8.0)]},
    ],
    # door: (groupA, groupB, axis, fixed coordinate, centre along wall)
    "doors": [
        ("living", "kitchen", "x", 6.0, 1.5),
        ("living", "bath", "x", 6.0, 4.3),
        ("living", "master", "y", 5.0, 2.5),
        ("living", "bed2", "y", 5.0, 5.5),
        ("living", None, "x", 0.0, 3.6),  # entrance door (no hotspot)
    ],
    "aps": [
        {"key": "living-entrance", "group": "living", "name": "Entrance View", "pos": (1.0, 3.6), "heading": 90, "initialYaw": 0},
        {"key": "living-balcony", "group": "living", "name": "Balcony View", "pos": (3.5, 1.0), "heading": -30, "initialYaw": 30},
        {"key": "living-dining", "group": "living", "name": "Dining View", "pos": (4.6, 3.8), "heading": 180, "initialYaw": 90},
        {"key": "kitchen-entrance", "group": "kitchen", "name": "Entrance View", "pos": (7.0, 1.5), "heading": 0, "initialYaw": 90},
        {"key": "bath-entrance", "group": "bath", "name": "Entrance View", "pos": (6.9, 4.2), "heading": 90, "initialYaw": 0},
        {"key": "master-entrance", "group": "master", "name": "Entrance View", "pos": (2.5, 5.8), "heading": 180, "initialYaw": 0},
        {"key": "master-window", "group": "master", "name": "Window View", "pos": (2.0, 7.9), "heading": 45, "initialYaw": 135},
        {"key": "bed2-entrance", "group": "bed2", "name": "Entrance View", "pos": (5.9, 5.9), "heading": -90, "initialYaw": -90},
    ],
    "height": 2.8,
}

AMENITIES = {
    "plan": {"file": "plan-site.png", "name": "Demo Site Plan", "ppm": 40, "size": (26.0, 20.0), "margin": 1.5},
    "groups": [
        {"key": "lobby", "name": "Entrance Lobby", "box": (0, 0, 10, 6), "wall": (232, 220, 200), "floor": (214, 206, 196),
         "windows": [("N", 2.0, 8.0)]},
        {"key": "pool", "name": "Swimming Pool", "box": (10, 0, 26, 10), "wall": (120, 150, 110), "floor": (210, 200, 180),
         "open": True, "water": (12.5, 2.5, 23.5, 7.5)},
        {"key": "gym", "name": "Gymnasium", "box": (0, 6, 10, 14), "wall": (70, 70, 76), "floor": (60, 60, 64),
         "windows": [("W", 9.0, 13.0)]},
        {"key": "garden", "name": "Landscaped Garden", "box": (10, 12, 26, 20), "wall": (96, 136, 92), "floor": (110, 150, 90),
         "open": True},
    ],
    "doors": [
        ("lobby", "pool", "x", 10.0, 3.0),
        ("lobby", "gym", "y", 6.0, 5.0),
        ("pool", "garden", "y", 10.0, 18.0),
        ("gym", "garden", "x", 10.0, 12.0),
    ],
    "aps": [
        {"key": "lobby-entrance", "group": "lobby", "name": "Entrance View", "pos": (5.0, 4.5), "heading": 0, "initialYaw": 0},
        {"key": "pool-deck", "group": "pool", "name": "Pool Deck", "pos": (11.5, 3.0), "heading": 90, "initialYaw": 0},
        {"key": "pool-cabana", "group": "pool", "name": "Cabana View", "pos": (24.5, 8.8), "heading": -60, "initialYaw": -30},
        {"key": "gym-entrance", "group": "gym", "name": "Entrance View", "pos": (5.0, 9.2), "heading": 180, "initialYaw": 0},
        {"key": "garden-path", "group": "garden", "name": "Garden Path", "pos": (14.0, 16.0), "heading": 30, "initialYaw": 60},
    ],
    "height": 3.6,
}


def door_point(door):
    _, _, axis, fixed, centre = door
    return (fixed, centre) if axis == "x" else (centre, fixed)


def yaw_pitch_to(cam, heading, target, target_z):
    dx, dy = target[0] - cam[0], target[1] - cam[1]
    bearing = math.degrees(math.atan2(dx, -dy))
    dist = math.hypot(dx, dy)
    pitch = math.degrees(math.atan2(target_z - CAM_H, dist))
    return round(norm_yaw(bearing - heading), 2), round(pitch, 2)


# ---------------------------------------------------------------------------
# Panorama renderer
# ---------------------------------------------------------------------------

def render_panorama(layout, ap, group, labels):
    x0, y0, x1, y1 = group["box"]
    open_air = group.get("open", False)
    wall_h = 1.1 if open_air else layout["height"]
    cx, cy = ap["pos"]

    u = (np.arange(W) + 0.5) / W
    v = (np.arange(H) + 0.5) / H
    yaw = np.radians((u - 0.5) * 360)[None, :]
    pitch = np.radians((0.5 - v) * 180)[:, None]
    bearing = yaw + math.radians(ap["heading"])
    cp = np.cos(pitch)
    dx = np.sin(bearing) * cp           # plan x (east)
    dy = -np.cos(bearing) * cp          # plan y (down = south)
    dz = np.broadcast_to(np.sin(pitch), dx.shape)

    big = 1e9
    with np.errstate(divide="ignore", invalid="ignore"):
        tx = np.where(dx > 0, (x1 - cx) / dx, np.where(dx < 0, (x0 - cx) / dx, big))
        ty = np.where(dy > 0, (y1 - cy) / dy, np.where(dy < 0, (y0 - cy) / dy, big))
        tf = np.where(dz < 0, -CAM_H / dz, big)
        tc = np.where(dz > 0, (layout["height"] - CAM_H) / dz, big) if not open_air else np.full(dx.shape, big)
    t_wall = np.minimum(tx, ty)
    t = np.minimum(np.minimum(t_wall, tf), tc)
    hx, hy, hz = cx + dx * t, cy + dy * t, CAM_H + dz * t

    img = np.zeros((H, W, 3), dtype=np.float32)
    floor = (tf <= t_wall) & (tf <= tc)
    ceil = (tc < t_wall) & (tc < tf) & ~floor
    wall = ~floor & ~ceil
    wall_hit_x = (tx <= ty) & wall

    # Floor: base colour + 0.5 m grid
    fcol = np.array(group["floor"], dtype=np.float32)
    grid = ((np.abs((hx * 2) - np.round(hx * 2)) < 0.03) | (np.abs((hy * 2) - np.round(hy * 2)) < 0.03))
    img[floor] = fcol
    img[floor & grid] = fcol * 0.82
    if "water" in group:
        wx0, wy0, wx1, wy1 = group["water"]
        water = floor & (hx > wx0) & (hx < wx1) & (hy > wy0) & (hy < wy1)
        ripple = 0.08 * np.sin(hx * 6) * np.sin(hy * 5)
        img[water] = np.stack([60 + 0 * hx, 150 + 0 * hx, 200 + 0 * hx], -1)[water] * (1 + ripple[water, None])

    # Ceiling
    img[ceil] = np.array([246, 243, 238], dtype=np.float32)

    # Walls: per-direction shading; above wall height becomes sky for open-air spaces
    wcol = np.array(group["wall"], dtype=np.float32)
    shade = np.where(wall_hit_x, np.where(dx > 0, 0.92, 0.97), np.where(dy > 0, 0.88, 1.0))
    img[wall] = (wcol[None, :] * shade[wall][:, None])
    baseboard = wall & (hz < 0.1)
    img[baseboard] = wcol * 0.7
    if open_air:
        sky = wall & (hz > wall_h)
        sky_t = np.clip(np.broadcast_to(pitch, dx.shape)[sky] / (math.pi / 2), 0, 1)
        img[sky] = np.stack([150 + 70 * sky_t, 190 + 50 * sky_t, 230 + 20 * sky_t], -1)
        # distant tower silhouettes for scale
        towers = wall & (hz > wall_h) & (np.broadcast_to(pitch, dx.shape) < np.radians(12)) & (
            (np.sin(np.broadcast_to(yaw, dx.shape) * 9) > 0.55))
        img[towers] = np.array([200, 196, 205], dtype=np.float32)

    # Windows
    for side, a, b in group.get("windows", []):
        if side in ("N", "S"):
            fixed = y0 if side == "N" else y1
            m = wall & ~wall_hit_x & (np.abs(hy - fixed) < 1e-3) & (hx > a) & (hx < b) & (hz > 0.9) & (hz < 2.4)
        else:
            fixed = x0 if side == "W" else x1
            m = wall & wall_hit_x & (np.abs(hx - fixed) < 1e-3) & (hy > a) & (hy < b) & (hz > 0.9) & (hz < 2.4)
        pv = np.broadcast_to(pitch, dx.shape)[m]
        img[m] = np.stack([170 + 40 * np.sin(pv), 205 + 20 * np.sin(pv), 235 + 0 * pv], -1)
        # mullions
        along = hx if side in ("N", "S") else hy
        mull = m & (np.abs((along * 1.0) - np.round(along * 1.0)) < 0.025)
        img[mull] = np.array([90, 70, 60], dtype=np.float32)

    # Doors (dark wood with gold frame) on this room's walls
    for door in layout["doors"]:
        ga, gb, axis, fixed, centre = door
        if group["key"] not in (ga, gb):
            continue
        half = door_half(layout, door)
        top = 2.1
        if axis == "x":
            on = wall & wall_hit_x & (np.abs(hx - fixed) < 1e-3)
            along = hy
        else:
            on = wall & ~wall_hit_x & (np.abs(hy - fixed) < 1e-3)
            along = hx
        frame = on & (np.abs(along - centre) < half + 0.06) & (hz < top + 0.06)
        leaf = on & (np.abs(along - centre) < half) & (hz < top)
        img[frame] = np.array([199, 165, 106], dtype=np.float32)
        img[leaf] = np.array([86, 22, 59], dtype=np.float32) if gb is not None else np.array([60, 40, 30], dtype=np.float32)

    # Simple distance falloff for depth
    fall = np.clip(1.08 - 0.025 * np.minimum(t, 30), 0.7, 1.08)
    img *= fall[..., None]
    img = np.clip(img, 0, 255).astype(np.uint8)
    pil = Image.fromarray(img, "RGB")
    draw = ImageDraw.Draw(pil)

    # Compass-relative wall labels and door labels
    f_small = font(34, bold=True)
    f_big = font(52, bold=True)
    for text, yw, pt in labels:
        uu = (0.5 + norm_yaw(yw) / 360) * W
        vv = (0.5 - pt / 180) * H
        bbox = draw.textbbox((0, 0), text, font=f_small)
        tw = bbox[2] - bbox[0]
        for off in (-W, 0, W):
            draw.rounded_rectangle((uu - tw / 2 - 14 + off, vv - 26, uu + tw / 2 + 14 + off, vv + 26), 10, fill=(38, 33, 36))
            draw.text((uu - tw / 2 + off, vv - 20), text, font=f_small, fill=(250, 247, 240))

    # Watermark band every 90 degrees, low on the horizon
    wm = "DEMO PANORAMA - NOT PROPERTY IMAGERY"
    for k in range(3):
        uu = (k + 0.5) * W / 3
        vv = 0.5 * H + 130
        bbox = draw.textbbox((0, 0), wm, font=f_big)
        tw = bbox[2] - bbox[0]
        draw.text((uu - tw / 2, vv), wm, font=f_big, fill=(255, 255, 255), stroke_width=3, stroke_fill=(81, 21, 47))
    title = f"{group['name']} - {ap['name']}"
    bbox = draw.textbbox((0, 0), title, font=f_big)
    tw = bbox[2] - bbox[0]
    draw.text((W / 2 - tw / 2 + (ap["initialYaw"] / 360) * W, 0.5 * H - 260), title, font=f_big,
              fill=(255, 255, 255), stroke_width=3, stroke_fill=(81, 21, 47))
    return pil


def build_layout(layout, prefix):
    groups = {g["key"]: g for g in layout["groups"]}
    aps = layout["aps"]
    manifest_aps = []
    for ap in aps:
        g = groups[ap["group"]]
        hotspots, labels = [], []
        # Same-room viewpoints: hotspot on the floor where the other camera stands
        for other in aps:
            if other is ap or other["group"] != ap["group"]:
                continue
            yw, pt = yaw_pitch_to(ap["pos"], ap["heading"], other["pos"], 0.0)
            hotspots.append({"to": other["key"], "label": other["name"], "yaw": yw, "pitch": pt, "style": "ring"})
        # Doors to other rooms: hotspot at the door centre, ~1.1 m high
        for door in layout["doors"]:
            ga, gb, *_ = door
            if ap["group"] not in (ga, gb):
                continue
            pt_xy = door_point(door)
            other_group = gb if ga == ap["group"] else ga
            if other_group is None:
                yw, pt = yaw_pitch_to(ap["pos"], ap["heading"], pt_xy, 1.9)
                labels.append(("MAIN ENTRANCE", yw, pt + 6))
                continue
            dest = next(a for a in aps if a["group"] == other_group)
            yw, pt = yaw_pitch_to(ap["pos"], ap["heading"], pt_xy, 1.1)
            hotspots.append({"to": dest["key"], "label": groups[other_group]["name"], "yaw": yw, "pitch": pt, "style": "door"})
            labels.append((f"TO {groups[other_group]['name'].upper()}", yw, pt + 14))
        for compass, b in (("N", 0), ("E", 90), ("S", 180), ("W", 270)):
            labels.append((f"PLAN {compass}", norm_yaw(b - ap["heading"]), 32))
        img = render_panorama(layout, ap, g, labels)
        fname = f"pano-{prefix}-{ap['key']}.jpg"
        img.save(os.path.join(OUT, fname), quality=84, optimize=True, progressive=True)
        print("wrote", fname)
        pw, ph = plan_px_size(layout["plan"])
        m = layout["plan"]["margin"]
        ppm = layout["plan"]["ppm"]
        manifest_aps.append({
            "key": ap["key"], "group": ap["group"], "name": ap["name"], "panorama": fname,
            "initialYaw": ap["initialYaw"], "initialPitch": 0, "initialFov": 75,
            "headingOffset": ap["heading"],
            "marker": {"x": round((ap["pos"][0] + m) * ppm / pw, 5), "y": round((ap["pos"][1] + m) * ppm / ph, 5)},
            "hotspots": hotspots,
        })
    return manifest_aps


def plan_px_size(plan):
    w, h = plan["size"]
    return int((w + 2 * plan["margin"]) * plan["ppm"]), int((h + 2 * plan["margin"]) * plan["ppm"])


def render_plan(layout, title):
    plan = layout["plan"]
    pw, ph = plan_px_size(plan)
    ppm, m = plan["ppm"], plan["margin"]
    img = Image.new("RGB", (pw, ph), (250, 247, 240))
    d = ImageDraw.Draw(img)
    P = lambda x, y: ((x + m) * ppm, (y + m) * ppm)
    for g in layout["groups"]:
        x0, y0, x1, y1 = g["box"]
        fill = (232, 240, 226) if g.get("open") else (255, 255, 255)
        d.rectangle((*P(x0, y0), *P(x1, y1)), fill=fill, outline=(38, 33, 36), width=max(3, ppm // 18))
        if "water" in g:
            wx0, wy0, wx1, wy1 = g["water"]
            d.rectangle((*P(wx0, wy0), *P(wx1, wy1)), fill=(170, 210, 230), outline=(90, 140, 170), width=3)
        cxp, cyp = P((x0 + x1) / 2, (y0 + y1) / 2)
        f = font(max(18, ppm // 4), bold=True)
        bbox = d.textbbox((0, 0), g["name"].upper(), font=f)
        d.text((cxp - (bbox[2] - bbox[0]) / 2, cyp - 12), g["name"].upper(), font=f, fill=(81, 21, 47))
        for side, a, b in g.get("windows", []):
            if side in ("N", "S"):
                yy = y0 if side == "N" else y1
                d.line((*P(a, yy), *P(b, yy)), fill=(120, 170, 210), width=max(6, ppm // 10))
            else:
                xx = x0 if side == "W" else x1
                d.line((*P(xx, a), *P(xx, b)), fill=(120, 170, 210), width=max(6, ppm // 10))
    for door in layout["doors"]:
        ga, gb, axis, fixed, centre = door
        half = door_half(layout, door)
        if axis == "x":
            d.line((*P(fixed, centre - half), *P(fixed, centre + half)), fill=(199, 165, 106), width=max(8, ppm // 8))
        else:
            d.line((*P(centre - half, fixed), *P(centre + half, fixed)), fill=(199, 165, 106), width=max(8, ppm // 8))
    # North arrow + disclaimer
    nx, ny = pw - 60, 70
    d.polygon([(nx, ny - 40), (nx - 16, ny + 10), (nx + 16, ny + 10)], fill=(81, 21, 47))
    d.text((nx - 8, ny + 14), "N", font=font(24, True), fill=(81, 21, 47))
    d.text((24, ph - 40), f"{title} - DEMO LAYOUT, NOT THE PROPERTY'S PLAN", font=font(20, True), fill=(110, 100, 104))
    img.save(os.path.join(OUT, plan["file"]), optimize=True)
    print("wrote", plan["file"], pw, ph)
    return pw, ph


def door_half(layout, door):
    """Half-width of an opening: wide walkways into open-air spaces, standard doors elsewhere."""
    return 1.0 if any(layout_group_open(layout, k) for k in door[:2]) else 0.45


def layout_group_open(layout, key):
    if key is None:
        return False
    return next((g for g in layout["groups"] if g["key"] == key), {}).get("open", False)


def brochure_assets(manifest):
    if not os.path.exists(BROCHURE):
        print("brochure not found; skipping hero/logo/floor-plan PDF")
        return
    import fitz  # PyMuPDF

    doc = fitz.open(BROCHURE)
    # Hero: night entrance render (page 30), native raster resolution.
    page = doc[29]
    pix = page.get_pixmap(dpi=100)
    pix.save(os.path.join(OUT, "hero.jpg"), jpg_quality=90)
    manifest["hero"] = "hero.jpg"
    # Logo: white "Rhythm 51" wordmark on the cover, keyed to transparency.
    pix = doc[0].get_pixmap(dpi=300, clip=fitz.Rect(335, 508, 486, 586))
    rgb = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    arr = np.asarray(rgb).astype(np.float32)
    bg = np.array([86, 22, 59], dtype=np.float32)
    lum = np.clip((arr.mean(-1) - bg.mean()) / (255 - bg.mean()), 0, 1)
    rgba = np.dstack([np.full(arr.shape[:2], 255), np.full(arr.shape[:2], 255), np.full(arr.shape[:2], 255), lum * 255])
    Image.fromarray(rgba.astype(np.uint8), "RGBA").save(os.path.join(OUT, "logo.png"), optimize=True)
    manifest["logo"] = "logo.png"
    # Floor plan PDF: the brochure's layout pages (typical layout, podium, isometrics).
    out = fitz.open()
    out.insert_pdf(doc, from_page=30, to_page=34)
    out.save(os.path.join(OUT, "floor-plans.pdf"), garbage=4, deflate=True)
    manifest["floorPlanPdf"] = "floor-plans.pdf"
    manifest["brochurePdf"] = os.path.relpath(BROCHURE, ROOT).replace("\\", "/")
    print("wrote hero.jpg, logo.png, floor-plans.pdf")


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {"generatedBy": "scripts/generate-demo-assets.py", "tours": {}}
    for tour_type, layout, prefix, title in (
        ("rooms", APARTMENT, "apt", "Apartment"),
        ("amenities", AMENITIES, "amen", "Amenities"),
    ):
        pw, ph = render_plan(layout, title)
        aps = build_layout(layout, prefix)
        manifest["tours"][tour_type] = {
            "plan": {"file": layout["plan"]["file"], "name": layout["plan"]["name"], "width": pw, "height": ph},
            "groups": [{"key": g["key"], "name": g["name"]} for g in layout["groups"]],
            "accessPoints": aps,
        }
    brochure_assets(manifest)
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print("wrote manifest.json")


if __name__ == "__main__":
    sys.exit(main())
