# Content setup guide (for the builder's team)

Sign in at `/admin/login`. Everything below is done in the admin panel; no code
changes are needed. **Nothing you change is visible to visitors until you press
Publish** (Preview & Publish page), unless you enable "Publish changes
immediately" in Settings.

## 1. Prepare your files

| Asset | Format | Recommended size |
|-------|--------|------------------|
| 360° panoramas | Full 360°×180° equirectangular JPEG in a **2:1 or 16:9 frame** | 7680×4320 (16:9) or 8192×4096 (2:1); width ≤ 8192 for full sharpness on desktops; JPEG quality 90–95, sRGB, < 25 MB |
| Hero image | JPEG/WebP, landscape | ≥ 2400 px wide; keep the subject away from the bottom 25% (menu bar) |
| Logo | PNG/WebP with transparency | ~600 px wide, light-coloured (it sits on the hero) |
| Floor plan image (navigator) | PNG/WebP/JPEG | 1500–3000 px on the long side, high contrast, plan only (no big margins) |
| Floor plan PDF / brochure | PDF | Any size; large image-heavy PDFs still open quickly (pages load on demand) |

Panoramas: the system automatically makes 2048 px and 4096 px versions. Phones get
≤ 4096 px; desktops get the original if their GPU supports it. Do not upscale
small panoramas. Level the horizon when stitching (pitch 0 should be level).

## 2. Landing page — *Landing & Settings*

Set project name, developer, logo, hero image, headline (optional — turn off for an
image-only hero), overlay darkness, button labels, optional theme colours, and
optional About/contact details. *Public site online* controls whether visitors see
the site at all.

## 3. Documents — *Documents*

Choose the floor-plan PDF and the brochure PDF, set the title, whether a download
button is shown, and mark them *Published*. Note: "download" only hides/shows the
button — anyone viewing a PDF in a browser can technically save it.

## 4. Floor plans — *Floor Plans*

Create one plan per apartment type / floor, and a site plan for amenities:
type a name, choose the plan file (image **or PDF**) and press **Add plan**. A
PDF's first page becomes the plan image automatically; you can pick another page
later under *Or use a PDF page*.

On the plan page you can place and adjust every viewpoint directly:

* **Select** a viewpoint by clicking its dot or its name in the list.
* **Move** it by dragging the dot (or click anywhere on the plan to put it there).
  An unplaced viewpoint is placed the same way.
* **Turn its direction** by dragging the white handle at the tip of its cone, or
  type a *Direction* (0° = towards the top of the plan, 90° = right).
  Choose what turning changes:
  * *Alignment with the plan* — when the cone points the wrong way compared with
    what the panorama shows (this is the calibration).
  * *Starting direction* — where visitors face when they arrive.
* Press **Save changes** (unsaved changes are flagged at the bottom of the page).

## 5. Rooms and amenities — *Rooms* / *Amenities*

1. Add a room (e.g. "Living Room"). Use *Edit* to set its floor plan, thumbnail
   (optional) and *Published* status.
2. Add viewpoints to the room ("Entrance View", "Balcony View" …). Each opens the
   **viewpoint editor**.
3. Set the tour's *Starting viewpoint* (what "Explore Room" opens) and mark the
   tour *Published*.

## 6. Viewpoint editor

* **Panorama**: choose or upload the 360° image.
* **Initial view**: rotate the preview to the best opening view and press
  *Set initial view here* (also stores the zoom).
* **Hotspots**: choose a *Destination*, rotate so the crosshair is on the doorway
  or the spot on the floor where the other camera stood, and press
  *Add hotspot here* — or use *Click to place* and click in the panorama.
  Per hotspot you can change label (blank = destination name), style (ring /
  arrow / door), fine-tune yaw/pitch, *Look at* it, *Move to view centre*, or
  reposition by clicking. After saving, *Create return hotspot* (⇄) adds the way
  back in the destination viewpoint.
* **Floor plan position**: choose the plan, *Place position*, click where the
  camera stood. Then *Calibrate direction*: put a recognisable feature under the
  crosshair and click that same feature on the plan. Rotate the panorama to check
  the cone follows. Details: [COORDINATES.md](COORDINATES.md).
* Set **Published** and **Save changes**.

Draft viewpoints and rooms are never shown publicly, and hotspots that lead to
draft viewpoints are hidden automatically.

## 7. Check and publish — *Preview & Publish*

Open the previews (optionally "with drafts"), walk through every hotspot, then
press **Publish now**. The *Checks* list flags missing panoramas, unplaced
viewpoints, viewpoints without hotspots and hotspots leading to drafts.

## 8. Put it online without a server (static export)

After publishing, press *Export static site* on the Preview & Publish page. It
creates a `static-site` folder containing only the published tour. Upload the
folder's contents to Netlify, Cloudflare Pages, GitHub Pages or any web hosting
account. Repeat Publish → Export → upload after every change.

## Replacing files

Media Library → click a file → *Replace file*. All content using it updates (in
preview immediately, publicly after you publish). Files in use cannot be deleted;
the panel lists where each file is used.
