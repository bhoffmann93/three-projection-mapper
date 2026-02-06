# Three.js Projection Mapping

A projection mapping library for Three.js with interactive warp grid control. Easily add projection mapping capabilities to any Three.js project.

## Features

- **Bicubic warp mesh** - Smooth perspective correction using Catmull-Rom interpolation
- **Interactive control points** - Drag corners and grid points to adjust warping
- **Testcard overlay** - Built-in test pattern for projection alignment
- **Persistence** - Control point positions saved to localStorage
- **Optional GUI** - Tweakpane-based interface for calibration
- **Minimal dependencies** - Only requires Three.js and convex-hull

## Installation

```bash
npm install three-projection-mapping
```

## Quick Start

```typescript
import * as THREE from 'three';
import { ProjectionMapper, ProjectionMapperGUI } from 'three-projection-mapping';

// Create your renderer
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Create a render target for your content
const renderTarget = new THREE.WebGLRenderTarget(
  window.innerWidth * devicePixelRatio,
  window.innerHeight * devicePixelRatio,
);

// Your scene (what you want to project)
const myScene = new THREE.Scene();
const myCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// Add content to your scene...
const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial());
myScene.add(cube);

// Create the projection mapper
const mapper = new ProjectionMapper(renderer, renderTarget.texture);

// Optional: Add GUI for calibration
const gui = new ProjectionMapperGUI(mapper);

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Render your content to the render target
  renderer.setRenderTarget(renderTarget);
  renderer.render(myScene, myCamera);

  // Render the projection mapped output
  mapper.render();
}

animate();
```

## API Reference

### ProjectionMapper

Main class for projection mapping.

#### Constructor

```typescript
new ProjectionMapper(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, config?: ProjectionMapperConfig)
```

**Config Options:**

- `width` - Width of projection surface in world units (default: 60)
- `height` - Height of projection surface (default: 60)
- `segments` - Mesh segments for smooth warping (default: 50)
- `gridControlPoints` - Grid density for fine control (default: { x: 5, y: 5 })
- `antialias` - Enable SMAA anti-aliasing (default: true)
- `fov` - Camera field of view (default: 42)
- `cameraDistance` - Camera Z position (default: 85)

#### Methods

| Method                            | Description                              |
| --------------------------------- | ---------------------------------------- |
| `render()`                        | Render the projection mapped output      |
| `setTexture(texture)`             | Change the input texture                 |
| `setShowTestCard(show)`           | Toggle testcard display                  |
| `resize(width, height)`           | Handle window resize                     |
| `setControlsVisible(visible)`     | Show/hide all control points             |
| `setGridPointsVisible(visible)`   | Show/hide grid points                    |
| `setCornerPointsVisible(visible)` | Show/hide corner points                  |
| `setOutlineVisible(visible)`      | Show/hide outline                        |
| `setGridLinesVisible(visible)`    | Show/hide grid lines                     |
| `setGridSize(x, y)`               | Change grid control point density (2-10) |
| `reset()`                         | Reset warp to default                    |
| `getWarper()`                     | Get the internal MeshWarper              |
| `dispose()`                       | Clean up resources                       |

### ProjectionMapperGUI

Optional GUI for calibration.

```typescript
const gui = new ProjectionMapperGUI(mapper, 'My Projection');

gui.toggle(); // Toggle visibility
gui.show(); // Show GUI
gui.hide(); // Hide GUI
gui.dispose(); // Clean up
```

## Keyboard Shortcuts (Example)

| Key | Action          |
| --- | --------------- |
| G/P | Toggle GUI      |
| T   | Toggle testcard |
| H   | Hide controls   |
| S   | Show controls   |

## Development

```bash
npm install
npm start          # Dev server at http://localhost:8080
npm run build      # Production build
npm run build:lib  # Build library
npm test           # Run tests
```

## How It Works

The library uses a deformable mesh with bicubic interpolation to warp any texture for projection mapping. It includes:

1. **Corner control points** (4) - Define the outer quad for perspective correction
2. **Grid control points** (configurable) - Internal points for fine adjustments
3. **Perspective homography** - Automatic transformation when corners are moved
4. **Bicubic Catmull-Rom interpolation** - Smooth warping between control points

## License

AGPL-3.0-or-later

The bicubic warp algorithm is adapted from [Omnidome](https://github.com/WilstonOreo/omnidome) by Michael Winkelmann, licensed under AGPL.

Perspective Transform adapted from https://github.com/jlouthan/perspective-transform

Loading is inspired by https://github.com/jdeboi/p5.mapper/blob/main/src/ProjectionMapper.ts
