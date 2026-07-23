# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Three.js Projection Mapping is a library for adding projection mapping capabilities to Three.js projects. It provides interactive warp grid control with bicubic interpolation for smooth perspective correction.

## Commands

```bash
npm start          # Dev server at http://localhost:8080
npm run build      # Production build
npm run build:lib  # Build library for distribution
npm test           # Run tests with Vitest
npm run preview    # Preview production build
```

## Architecture

### Core Components

1. **ProjectionMapper.ts** - Main entry point, wraps MeshWarper with a simple API
2. **ProjectionMapperGUI.ts** - Optional Tweakpane GUI for calibration
3. **MeshWarper.ts** - Core warp mesh with drag controls and bicubic interpolation
4. **perspective.ts** - Homography transform for 4-point perspective correction
5. **projection.frag** - Fragment shader with testcard for alignment

### Key Files

- `/src/ProjectionMapper.ts` - Library main class
- `/src/ProjectionMapperGUI.ts` - Optional GUI
- `/src/webgl/warp/MeshWarper.ts` - Warp grid implementation
- `/src/utils/perspective.ts` - Perspective transform math
- `/glsl/projection/projection.frag` - Post-processing shader
- `/glsl/vertex/bicubicGridWarp.vert` - Warp vertex shader

### Usage Pattern

```typescript
import { ProjectionMapper, ProjectionMapperGUI } from './lib';

// 1. Create renderer and content
const renderer = new THREE.WebGLRenderer();
const renderTarget = new THREE.WebGLRenderTarget(width, height);

// 2. Create mapper with your render target texture.
// Defaults to a single surface — pass multiSurface: true for the atlas case.
const mapper = new ProjectionMapper(renderer, renderTarget.texture);

// 3. Optional GUI
const gui = new ProjectionMapperGUI(mapper);

// 4. In animation loop:
renderer.setRenderTarget(renderTarget);
renderer.render(myScene, myCamera);
mapper.render();
```

## Exports

The library exports from `src/lib.ts`:
- `ProjectionMapper` - Main class
- `ProjectionMapperGUI` - Optional GUI
- `MeshWarper` - Low-level warp mesh (for advanced use)

## Runtime Shortcuts (Example App)

Wired by the examples, not the library — each is one call to a public method, so
the letter keys stay free for the host app:

- `G` / `P` - Toggle GUI panel (`gui.toggle()`)
- `T` - Toggle testcard (`gui.toggleTestCard()`)
- `W` - Toggle warp controls (`gui.toggleWarpUI()`)
- `O` - Open projector window (`sync.openProjectorWindow()`) — multi-window, multi-surface
- `I` - Toggle UV rect editor (`uvRectEditor.toggle()`) — multi-surface only

## Warp Point Keyboard Control

"Warp point" is the user-facing name for a corner or grid control point. Click one
to select it (it brightens and grows), then:

- `Arrows` - Nudge the selected warp point 1 screen pixel
- `Shift+Arrows` - Nudge 10 pixels
- `Tab` / `Shift+Tab` - Step to the next warp point, within the selected one's group
- `Esc` - Deselect the warp point

This is how a warp point gets outside the window, which dragging cannot do — the
pointer runs out of screen, and in single-window mode the view is the output, so
there is no zooming out to make room. Warp points pushed off screen get a
clickable marker on the window edge (`OffscreenHandleMarkers`) pointing at where
they went.

These keys are built into the library (`HandleKeyboard`, constructed by
`ProjectionMapper`) because they act on state only the mapper has: which point is
selected, and how far a screen pixel reaches at the current zoom. They stand down
while a Tweakpane input has focus, when Meta/Ctrl/Alt is held, on projector
windows, and while warp controls are hidden. Arrows stay free until a warp point
is selected; Tab does not — it is claimed page-wide whenever handles are visible,
since stepping to an off-screen point is the one way to reach it.

`mapper.setKeyboardEnabled(false)` hands all of them back to the host app. Handles
stay draggable; rebind through `getWarper()` (`selectNextHandle`,
`nudgeSelectedHandle`, `clearSelectedHandle`).
