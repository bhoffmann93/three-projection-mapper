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

// 2. Create mapper with your render target texture
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

- `G` / `P` - Toggle GUI panel
- `T` - Toggle testcard
- `W` - Hide all controls
- `S` - Show all controls
