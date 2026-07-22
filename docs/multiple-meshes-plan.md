# Plan: Multiple Warp Surfaces (MadMapper/Resolume-style)

Status: implemented on branch `multiple-meshes` (Phases 1–4), 2026-07-22.
See `examples/multi-surface/` for a two-surface demo. Notes vs. the plan below:
`WarpSurface` composes `MeshWarper` (which already owned mesh/material/points/
persistence) rather than replacing it; the `storageNamespace` mechanism was
implemented directly instead of cherry-picked; the default surface keeps the
legacy un-namespaced storage key so existing calibrations survive; edge/polygon
masks follow the first surface (whole-view background mask still open);
`reset()` with no id resets all surfaces, `reset(surfaceId)` one.

Goal: several independently warped meshes ("surfaces") in one output window, each
sampling its own rectangle of the single shared input texture. The host app keeps
exactly one source pipeline and one buffer — all surfaces sample from it.

Decision so far: **wait** until a concrete install needs discrete multi-object
mapping. Single mesh + grid warp + masks covers continuous surfaces; the
`multiple-projectors` branch covers multi-projector. Only Phase 1 (UV rect) is
worth doing opportunistically — it is small, backwards compatible, and every
future direction (surfaces, slices, soft-edge) builds on it.

Dependency note: per-surface warp persistence should reuse the `storageNamespace`
mechanism that lives on the `multiple-projectors` branch (`MeshWarper` suffixes
its localStorage key). Merge or cherry-pick that before Phase 2.

---

## Phase 1 — UV rect sampling (small, independently useful)

Let a mapper display any crop of the input texture instead of always 0–1.

- `src/shaders/projection.frag`: add uniforms

  ```glsl
  uniform vec2 uUvRectOffset; // default (0.0, 0.0)
  uniform vec2 uUvRectScale;  // default (1.0, 1.0)
  ```

  and change the single sampling line in `main()`:

  ```glsl
  color = texture2D(uBuffer, uUvRectOffset + vUv * uUvRectScale).rgb;
  ```

  Everything else stays on `vUv` on purpose: test card, control lines, border
  lines are per-surface screen furniture and must not be cropped.

- `ProjectionMapper`: register the two uniforms with defaults (full rect →
  behavior identical to today) and expose

  ```ts
  setUvRect(offsetX: number, offsetY: number, scaleX: number, scaleY: number): void
  ```

- Aspect: the mapper's plane aspect still comes from the `resolution` config at
  construction. Callers showing a crop should pass the crop's resolution
  (`bufferResolution * uvRectScale`) as `resolution` to keep proportions true.
  Test-card aspect when unwarped uses `uBufferResolution` — pass the crop
  resolution there too (or leave as-is; cosmetic only).

- Consumer payoff: in web-mapper's soft-edge feature (branch
  `electron-multi-window`, commit `fe63eed`) this replaces the external
  `SliceCropPass` render-target copy entirely.

## Phase 2 — Extract `WarpSurface` (the core refactor)

Break `ProjectionMapper`'s one-mesh assumption. A `WarpSurface` owns what
`MeshWarper` + its slice of mapper state own today:

- warp mesh + material (warp.vert / projection.frag instance with its own
  uniforms: control points, grid size, warp mode, uv rect)
- control point state + drag handle meshes
- per-surface persistence via `storageNamespace` (`warp:surface-<id>`)

`ProjectionMapper` becomes the owner of `surfaces: WarpSurface[]` sharing one
scene, camera, renderer, and input texture. Single-surface API stays as a facade
delegating to `surfaces[0]` so existing consumers (web-mapper) compile unchanged.

Watch out for current screen-ownership assumptions: the mask plane covers the
whole view (must become background, not per-surface), zoom/camera offset are
mapper-global, and `reset()` / test card / white-out need a "which surface or
all" answer.

## Phase 3 — Selection + editing model

- One surface is "active"; only its handles are visible/draggable.
- DragControls today assumes all handles belong to the one mesh — either one
  DragControls fed only the active surface's handles (rebind on selection), or
  hit-testing to auto-select by click.
- `ProjectionMapperGUI`: surface list (add / remove / select), per-surface grid
  size, warp mode, uv rect controls.

## Phase 4 — Sync (multi-window)

Every warp event in `WindowSync` / `EventTypes` is implicitly "the one mapper":
`CORNER_POINTS_UPDATED`, `GRID_POINTS_UPDATED`, `GRID_SIZE_CHANGED`,
`WARP_MODE_CHANGED`, `RESET_WARP`. Each payload gains a `surfaceId`; full state
carries the surface list. Interacts with `syncWarp: false` windows from the
`multiple-projectors` branch — a slice window with local warp keeps local
surfaces.

## Explicit non-goals (for now)

- Per-surface effect chains — the host app keeps one buffer; if per-surface
  effects are ever wanted, they belong in the host's pipeline, not here.
- Per-surface input textures — one shared `uBuffer` only.
