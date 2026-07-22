# Plan: Multi-Surface UX + Per-Surface Masks

Status: planned, not started. Written 2026-07-22.
Builds on `multiple-meshes-plan.md` (implemented on branch `multiple-meshes`).

Goal: make multi-surface *usable*. Today selection lives in a Tweakpane
"Surfaces" folder, masks (edge feather + polygon) bind to the first surface
only, and uv rects are four number sliders. The reference UX is MadMapper /
Resolume: click a surface to select it, drag its body to move it, masks belong
to the surface, and the input crop is edited visually.

Guiding split: the **library** owns canvas interaction and per-surface state;
the **built-in GUI** is a calibration harness that mirrors canvas selection;
anything resembling an app panel (input view / uv sampler) is an **addon** a
host app can use, replace, or ignore.

---

## Phase A — Canvas selection + surface dragging

The folder stops being the primary way to select.

- `ProjectionMapper` gets a pointer handler on `renderer.domElement`:
  - Raycast against surface meshes on pointerdown. Hit topmost surface →
    `setActiveSurface(id)`. Handles appear on it.
  - Drag on the surface *body* (mesh hit, no handle hit — handles keep
    priority via their existing DragControls) → translate the whole surface.
  - Click on empty space → keep selection (deselect-on-miss feels hostile
    mid-calibration; revisit).
- `MeshWarper.translate(dx, dy)` / `setPosition(x, y)` / `getCenter()`:
  already implemented (added for the multi-surface example) — body-drag just
  needs to call `translate` from the pointer handler. `resetToDefault()`
  already preserves the surface's centroid (`keepPosition` default true).
- Visibility model changes from "inactive = invisible" to:
  - active: outline + handles (respecting the existing grid/corner toggles)
  - inactive: dimmed outline only (new `WARP_HANDLE_STYLE.inactiveOutline*`
    constants), no handles, raycastable for selection
  - `setControlsVisible(false)` / projector mode still hides everything and
    disables the pointer handler (`setDragEnabled(false)` gates it too).
- Hover feedback: brighten outline of the surface under the cursor.
- New callback `onActiveSurfaceChanged(id)` so GUI + host apps can react
  (extends `onSurfacesChanged`, which stays for list changes).
- Sync: selection is controller-local, nothing to broadcast.

GUI after Phase A: the Surfaces folder keeps Add/Remove and the per-surface
fields (uv rect numbers, grid size, warp mode) and its Active list stays in
sync both ways — but clicking the canvas is the primary path. No new folder
structure needed; sub-folders only, no separators.

## Phase B — Per-surface masks (the structural fix)

Masks move from mapper-global into `WarpSurface`.

- `WarpSurface` owns an optional `MaskPlane` + optional `PolygonMask`,
  each synced to *its* warper's homography in `ProjectionMapper.render()`.
- Edge feather:
  - `maskEnabled` / `feather` leave `ImageSettings` (image adjust stays
    global: tonemap/levels/gamma/contrast/sat/hue). New per-surface API:
    `surface.setEdgeFeather(enabled, amount)`.
  - Facade back-compat: `mapper.setImageSettings({ maskEnabled, feather })`
    keeps working and routes to the active surface; `getImageSettings()`
    reads from it. Deprecate in the docstring.
- Polygon mask:
  - `mapper.addPolygonMask()` → `surface.addPolygonMask()`; nodes stay in the
    surface's UV space and transform through that surface's perspective.
  - Persistence: polygon storage key gains the surface namespace suffix,
    same scheme as warp points (`polygon-mask-nodes:surface-<id>`, default
    surface keeps the legacy key). Feather/invert/enabled move from GUI
    settings into the same per-surface record.
  - Only the active surface's polygon handles are visible/draggable,
    mirroring warp handles.
- GUI: the Masks folder acts on the active surface and re-syncs on selection
  change (same pattern as grid size / warp mode / uv rect today).
- Sync: `IMAGE_SETTINGS_CHANGED` drops feather fields; new
  `EDGE_MASK_CHANGED { surfaceId, enabled, feather }`; the three
  `POLYGON_MASK_*` events gain `surfaceId`; `SurfaceSyncState` gains
  `edgeMask` + `polygonMask`. Absent `surfaceId` = first surface, as before.
- Explicit non-goal: a global output mask (viewport-wide blackout). If ever
  wanted it is a separate background layer, not a surface concern.

## Phase C — UV sampler addon (input view)

Host apps will build an input panel showing the source texture with draggable
crop rects (MadMapper's left pane). The library shouldn't own that panel, but
should ship a minimal reference implementation as an addon:

- `addons/UvRectEditor`: a DOM overlay with a small canvas that
  1. draws the shared input texture (readback via a tiny render target blit,
     throttled — this is a preview, not a live monitor),
  2. draws one rect per surface from `surface.getUvRect()`, active highlighted,
  3. drag body = move rect (offset), drag corners = resize (scale),
     click rect = `setActiveSurface`,
  4. writes back via `mapper.setUvRect(...)` so persistence + sync
     (`UV_RECT_CHANGED`) come for free.
- The Tweakpane numeric bindings stay as the fallback/precision path.
- `examples/multi-surface` adopts the editor; that example is the acceptance
  test for the whole plan: click surfaces on canvas, drag them apart, feather
  one of them, crop via the input view.

## API summary after all phases

- Selection: click surface on canvas; `onActiveSurfaceChanged`.
- Move: drag surface body; corners/grid warp as today.
- Per surface: warp, grid size, warp mode, uv rect, edge feather, polygon mask.
- Global: image adjust, test card, white-out, zoom/camera offset, output AA.
- Host-app extension points: `getSurfaces`/`getSurface`/`setActiveSurface`,
  `onSurfacesChanged`/`onActiveSurfaceChanged`, `setUvRect`, per-surface mask
  API, `UvRectEditor` as reference UI.

## Order + risk

A → B → C. A is pure interaction, no storage/sync changes. B is the real
refactor (touches persistence, sync payloads, ImageSettings shape — bump
`STORAGE_VERSION`). C is isolated addon work.

Open questions:
- Deselect on empty-canvas click, or only via GUI list? (Plan says keep
  selection; MadMapper deselects — decide when trying it.)
- Surface naming/reordering (z-order for overlaps) — not planned yet; ids
  are enough until an install needs it.
