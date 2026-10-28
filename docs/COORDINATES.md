# Coordinate conventions

All angles are stored in **degrees**. The single source of truth is
[`lib/tour/geometry.ts`](../lib/tour/geometry.ts); the viewer, admin editors and the
floor-plan navigator all use those functions, and they are covered by
`tests/unit/geometry.test.ts`.

## Panorama space (access points and hotspots)

| Value   | Range         | Meaning                                                                 |
|---------|---------------|-------------------------------------------------------------------------|
| `yaw`   | (-180, 180]   | 0 = the **centre column** of the equirectangular image. Positive = turn **right** (clockwise seen from above). |
| `pitch` | [-90, 90]     | 0 = horizon (middle row of the image). +90 = straight up.              |
| `fov`   | [30, 110]     | **Vertical** field of view of the camera. Portrait screens widen it slightly so the view isn't a keyhole. |

Texture mapping: `u = 0.5 + yaw / 360`, `v = 0.5 − pitch / 180` (v measured from the top).
So a point 3/4 of the way across the source image is at yaw +90; the left edge is yaw −180/180.

Hotspots are stored as (yaw, pitch) in this space. They are **never** stored as
screen pixels; every frame the viewer projects them onto the screen, so they stay
attached to the scene at any zoom, rotation or window size.

World space (three.js): camera at the origin, yaw 0 / pitch 0 looks down −Z,
yaw +90 looks down +X, pitch +90 looks up +Y. The panorama sphere is
`SphereGeometry.scale(−1, 1, 1).rotateY(−π/2)`, which places `u = 0.5` at −Z.

## Floor-plan space

| Value                  | Meaning |
|------------------------|---------|
| `marker_x`, `marker_y` | Normalised image coordinates in [0, 1], origin **top-left** of the plan image. They survive resizing and re-exports at a different resolution with the same framing. |
| bearing                | Degrees **clockwise from the plan image's "up"** direction (not compass north). |

## From camera yaw to the navigator cone

```
bearing = yaw + accessPoint.heading_offset + floorPlan.orientation_offset
```

* `heading_offset` (per access point): the plan bearing that panorama yaw 0 faces.
  Every 360° capture can start pointing in a different direction, so this is
  calibrated per panorama.
* `orientation_offset` (per floor plan): rotates every viewpoint on that plan at
  once — use it if you replace a plan image with one rotated by 90°, for example.
  It is usually 0.

Nothing assumes yaw 0 is north or that a plan's top is north.

The cone's angular width is the visitor's actual horizontal field of view.

### Calibrating `heading_offset` (admin → viewpoint editor → *Calibrate direction*)

1. Place the viewpoint's marker on the plan.
2. Rotate the panorama until a recognisable feature (a door, window, column) is
   under the centre crosshair.
3. Click *Calibrate direction*, then click the same feature on the plan.

The editor computes `heading_offset = bearing(marker → clicked point) − yaw − orientation_offset`.
The bearing is measured in pixel space (normalised deltas × image width/height),
so non-square plans are handled correctly. Verify by rotating the panorama: the
cone on the plan should sweep with the view.

### Reciprocal hotspots

*Create return hotspot* adds a hotspot in the destination that leads back. When
both viewpoints are placed on the same plan, its yaw is estimated as
`bearing(destination → source) − destination.heading_offset − orientation_offset`;
otherwise it is created at yaw 0 for you to position.
