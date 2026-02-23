# Three.js Projection Mapping

A projection mapping library for Three.js with interactive warp grid control and multi-window synchronization. Easily add projection mapping capabilities to any Three.js project.

## Features

- **Bicubic warp mesh** - Smooth perspective correction using Catmull-Rom interpolation
- **Interactive control points** - Drag corners and grid points to adjust warping
- **Multi-window sync** - Separate controller and projector windows with real-time sync
- **Testcard overlay** - Built-in test pattern for projection alignment
- **Persistence** - Control point positions saved to localStorage
- **Type-safe events** - BroadcastChannel IPC with strict TypeScript types
- **Optional GUI** - Tweakpane-based interface for calibration
- **Production-ready** - Clean architecture with zero redundant dependencies

## Installation

```bash
npm install three-projection-mapping
```

## Quick Start

### Single Window

```typescript
import * as THREE from 'three';
import { ProjectionMapper, ProjectionMapperGUI, GUI_ANCHOR } from 'three-projection-mapping';

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1280 / 800, 0.1, 1000);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(),
  new THREE.MeshNormalMaterial()
);
scene.add(cube);

const renderTarget = new THREE.WebGLRenderTarget(1280, 800);
const mapper = new ProjectionMapper(renderer, renderTarget.texture);
const gui = new ProjectionMapperGUI(mapper, 'Projection Mapper', GUI_ANCHOR.LEFT);

function animate() {
  requestAnimationFrame(animate);

  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  renderer.setRenderTarget(null);
  mapper.render();
}

animate();
```

### Multi-Window (Controller + Projector)

For professional projection mapping setups, use two browser windows:
- **Controller Window**: Full GUI for calibration, drag controls, preview
- **Projector Window**: Output-only display (fullscreen on projector hardware)

State automatically syncs between windows via BroadcastChannel (no server required).

**Step 1: Encapsulate your scene in a class:**

```typescript
// ProjectionScene.ts
import * as THREE from 'three';

export class ProjectionScene {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderTarget: THREE.WebGLRenderTarget;

  private cube: THREE.Mesh;

  constructor(config: { width: number; height: number }) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, config.width / config.height, 0.1, 1000);

    this.cube = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshNormalMaterial()
    );
    this.scene.add(this.cube);

    this.renderTarget = new THREE.WebGLRenderTarget(config.width, config.height);
  }

  public animate(): void {
    this.cube.rotation.y += 0.01;
  }

  public render(renderer: THREE.WebGLRenderer): void {
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);
  }

  public getTexture(): THREE.Texture {
    return this.renderTarget.texture;
  }
}
```

**Step 2: Controller window (calibration & control):**

```typescript
// controller.ts
import * as THREE from 'three';
import { ProjectionMapper, ProjectionMapperGUI, GUI_ANCHOR } from 'three-projection-mapping';
import { WindowSync, WINDOW_SYNC_MODE } from 'three-projection-mapping/addons';
import { ProjectionScene } from './ProjectionScene';

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const projectionScene = new ProjectionScene({ width: 1280, height: 800 });
const mapper = new ProjectionMapper(renderer, projectionScene.getTexture());
const sync = new WindowSync(mapper, { mode: WINDOW_SYNC_MODE.CONTROLLER });

const gui = new ProjectionMapperGUI(mapper, {
  title: 'Controller',
  anchor: GUI_ANCHOR.LEFT,
  eventChannel: sync.getEventChannel(),
  windowManager: sync.getWindowManager(),
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'o') sync.openProjectorWindow();
});

function animate() {
  requestAnimationFrame(animate);
  projectionScene.animate();
  projectionScene.render(renderer);
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();
```

**Step 3: Projector window (output-only):**

```typescript
// projector.ts
import * as THREE from 'three';
import { ProjectionMapper } from 'three-projection-mapping';
import { WindowSync, WINDOW_SYNC_MODE } from 'three-projection-mapping/addons';
import { ProjectionScene } from './ProjectionScene';

const renderer = new THREE.WebGLRenderer();
renderer.setSize(1280, 800);
document.body.appendChild(renderer.domElement);

const projectionScene = new ProjectionScene({ width: 1280, height: 800 });
const mapper = new ProjectionMapper(renderer, projectionScene.getTexture());
const sync = new WindowSync(mapper, { mode: WINDOW_SYNC_MODE.PROJECTOR });

function animate() {
  requestAnimationFrame(animate);
  projectionScene.animate();
  projectionScene.render(renderer);
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();
```

**What WindowSync does automatically:**
- **Controller mode**: Broadcasts all state changes (warp points, settings, testcard) to projector
- **Projector mode**: Hides all controls, disables drag, sets scale to 1.0, receives updates from controller

**See full example:** `/examples/multi-window/`

## API Reference

### ProjectionMapper

Main class for projection mapping.

#### Constructor

```typescript
new ProjectionMapper(
  renderer: THREE.WebGLRenderer,
  inputTexture: THREE.Texture,
  config?: ProjectionMapperConfig
)
```

**Config Options:**

```typescript
interface ProjectionMapperConfig {
  resolution?: { width: number; height: number };  // Default: { width: 1920, height: 1080 }
  segments?: number;                               // Mesh segments (default: 50)
  gridControlPoints?: { x: number; y: number };   // Grid density (default: { x: 5, y: 5 })
  antialias?: boolean;                            // Enable SMAA (default: true)
  planeScale?: number;                            // Plane fill factor (default: 0.9)
}
```

#### Methods

| Method | Description |
|--------|-------------|
| `render()` | Render the projection mapped output |
| `setTexture(texture)` | Change the input texture |
| `setShowTestCard(show)` | Toggle testcard display |
| `resize(width, height)` | Handle window resize |
| `setControlsVisible(visible)` | Show/hide all control points |
| `setGridPointsVisible(visible)` | Show/hide grid points |
| `setCornerPointsVisible(visible)` | Show/hide corner points |
| `setOutlineVisible(visible)` | Show/hide outline |
| `setGridSize(x, y)` | Change grid density (2-10) |
| `setPlaneScale(scale)` | Set plane fill factor (0-1) |
| `getWarper()` | Get the internal MeshWarper |
| `dispose()` | Clean up resources |

### ProjectionMapperGUI

Optional GUI for single-window calibration.

```typescript
import { ProjectionMapperGUI, GUI_ANCHOR } from 'three-projection-mapping';

const gui = new ProjectionMapperGUI(
  mapper,
  'My Projection',
  GUI_ANCHOR.LEFT  // or GUI_ANCHOR.RIGHT
);

gui.toggle();
gui.show();
gui.hide();
gui.dispose();
```

### Multi-Window Mode

For multi-window projection setups, pass `eventChannel` and `windowManager` to enable event broadcasting and projector window controls. WindowSync automatically handles internal state synchronization.

```typescript
import { ProjectionMapperGUI, GUI_ANCHOR } from 'three-projection-mapping';
import { WindowSync } from 'three-projection-mapping/addons';

const sync = new WindowSync(mapper, { mode: 'controller' });

const gui = new ProjectionMapperGUI(mapper, {
  title: 'Controller',
  anchor: GUI_ANCHOR.LEFT,
  eventChannel: sync.getEventChannel(),
  windowManager: sync.getWindowManager(),
});
```

### WindowSync

Multi-window synchronization addon.

```typescript
import { WindowSync, WINDOW_SYNC_MODE } from 'three-projection-mapping/addons';

// Controller
const sync = new WindowSync(mapper, { mode: WINDOW_SYNC_MODE.CONTROLLER });
sync.openProjectorWindow();
sync.onProjectorReady(() => console.log('Connected!'));

// Projector
const sync = new WindowSync(mapper, { mode: WINDOW_SYNC_MODE.PROJECTOR });
```

#### Methods

| Method | Description |
|--------|-------------|
| `openProjectorWindow()` | Open projector window (controller only) |
| `closeProjectorWindow()` | Close projector window |
| `onProjectorReady(callback)` | Called when projector connects |
| `getEventChannel()` | Get IPC event channel |
| `getWindowManager()` | Get window manager |
| `destroy()` | Clean up resources |

### MeshWarper

Low-level warp mesh (advanced usage).

```typescript
const warper = mapper.getWarper();

warper.setDragEnabled(false);           // Disable drag interaction
warper.setWarpMode(WARP_MODE.bicubic);  // Set warp mode
warper.setShouldWarp(true);             // Enable/disable warping
```

## Keyboard Shortcuts

Default shortcuts in examples:

| Key | Action |
|-----|--------|
| G/P | Toggle GUI |
| T | Toggle testcard |
| H | Toggle warp UI |
| O | Open projector window (controller) |

## Project Structure

```
examples/
├── single-window/
│   ├── index.html
│   └── main.ts
└── multi-window/
    ├── controller.html
    ├── controller.ts
    ├── projector.html
    ├── projector.ts
    └── ProjectionScene.ts

src/
├── core/              # Main classes
│   ├── ProjectionMapper.ts
│   ├── ProjectionMapperGUI.ts
│   └── ProjectorCamera.ts
├── warp/              # Warp mesh & geometry
│   ├── MeshWarper.ts
│   └── geometry.ts
├── utils/             # Utilities
│   └── projection.ts
├── addons/            # Extensions
│   └── WindowSync.ts
├── ipc/               # Type-safe event system
│   ├── EventChannel.ts
│   ├── EventTypes.ts
│   └── EventPayloads.ts
└── windows/           # Window management
    └── WindowManager.ts
```

## Development

```bash
npm install
npm start          # Dev server at http://localhost:8080
npm run build      # Production build
npm run build:lib  # Build library for distribution
npm test           # Run tests with Vitest
```

## How It Works

The library uses a deformable mesh with bicubic interpolation to warp any texture for projection mapping:

1. **Corner control points (4)** - Define the outer quad for perspective correction
2. **Grid control points (configurable)** - Internal points for fine adjustments
3. **Perspective homography** - Automatic transformation when corners are moved
4. **Bicubic Catmull-Rom interpolation** - Smooth warping between control points
5. **BroadcastChannel IPC** - Real-time sync between controller and projector windows

## Architecture Principles

- **Single Responsibility** - Each module has one clear purpose
- **Information Hiding** - Implementation details are private
- **Type Safety** - Strict TypeScript with no magic strings
- **Zero Redundant Comments** - Self-documenting code with clear naming
- **Decoupled Architecture** - Clean separation between core, warp, GUI, and addons

## License

AGPL-3.0-or-later

The bicubic warp algorithm is adapted from [Omnidome](https://github.com/WilstonOreo/omnidome) by Michael Winkelmann, licensed under AGPL.

Perspective Transform adapted from https://github.com/jlouthan/perspective-transform
