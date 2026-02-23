# How to Use This Library (Simple Guide)

## What This Library Does

**Warps a Three.js texture onto a surface using an interactive grid.**

That's it! You provide a texture, it warps it.

---

## Core Concept

```
Your Scene → Render to Texture → ProjectionMapper → Warped Output
```

---

## Basic Usage (Single Window)

See `src/example.ts` for a complete working example.

### Step 1: Create Your Scene (Normal Three.js)

```typescript
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer();
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1280/800, 0.1, 1000);

// Your content
const mesh = new THREE.Mesh(
  new THREE.TorusKnotGeometry(),
  new THREE.MeshNormalMaterial()
);
scene.add(mesh);
```

### Step 2: Create Render Target

```typescript
// This is where you render your scene before warping
const renderTarget = new THREE.WebGLRenderTarget(1280, 800);
```

### Step 3: Create ProjectionMapper

```typescript
import { ProjectionMapper } from 'three-projection-mapper';

const mapper = new ProjectionMapper(renderer, renderTarget.texture);
```

### Step 4: Render Loop

```typescript
function animate() {
  requestAnimationFrame(animate);

  // Animate your content
  mesh.rotation.x += 0.01;

  // Step A: Render your scene to the render target
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  // Step B: Render warped output to screen
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();
```

**Done! You now have interactive warp controls.**

---

## Add GUI (Optional)

```typescript
import { ProjectionMapperGUI } from 'three-projection-mapper';

const gui = new ProjectionMapperGUI(mapper);

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'g') gui.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'h') gui.toggleWarpUI();
});
```

---

## Multi-Window Setup (Controller + Projector)

See `src/controller.ts` and `src/projector.ts` for complete working examples.

### Controller Window

```typescript
import { ProjectionMapper } from 'three-projection-mapper';
import { WindowSync } from 'three-projection-mapper/addons';

// Your scene setup (same as above)
const scene = new THREE.Scene();
// ... add your content ...

const mapper = new ProjectionMapper(renderer, renderTarget.texture);

// Add multi-window sync
const sync = new WindowSync(mapper, { mode: 'controller' });

// Open projector window
sync.openProjectorWindow();

// Same render loop as before
function animate() {
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  renderer.setRenderTarget(null);
  mapper.render();

  requestAnimationFrame(animate);
}
```

### Projector Window

```typescript
import { ProjectionMapper } from 'three-projection-mapper';
import { WindowSync } from 'three-projection-mapper/addons';

// SAME scene setup as controller (copy the exact same code)
const scene = new THREE.Scene();
// ... add SAME content ...

const mapper = new ProjectionMapper(renderer, renderTarget.texture);

// Receive updates from controller
const sync = new WindowSync(mapper, { mode: 'projector' });

// SAME render loop
function animate() {
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  renderer.setRenderTarget(null);
  mapper.render();

  requestAnimationFrame(animate);
}
```

**Key Point:** Both windows render the same scene independently. WindowSync only syncs the warp settings (grid points, corner points, etc.).

---

## Classes Explained

| Class | What It Does | Do You Need It? |
|-------|--------------|-----------------|
| `ProjectionMapper` | Core warping functionality | ✅ YES (always) |
| `ProjectionMapperGUI` | Optional GUI controls | ⚠️ Optional |
| `WindowSync` | Multi-window synchronization | ⚠️ Only for multi-window |
| `MeshWarper` | Low-level warp mesh | ⚠️ Advanced usage only |

---

## Common Issues

### "Points don't update on projector"
- Both windows must render the SAME content
- WindowSync only syncs warp settings, not your scene
- Check browser console for connection logs

### "I want to use my own scene"
- Just create your scene directly in your code
- No wrapper classes needed
- See `src/example.ts` for reference

---

## Real-World Example

```typescript
import * as THREE from 'three';
import { ProjectionMapper, ProjectionMapperGUI } from 'three-projection-mapper';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

// Setup
const renderer = new THREE.WebGLRenderer();
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1280/800, 0.1, 1000);
camera.position.z = 5;

// Load your model
const loader = new GLTFLoader();
loader.load('model.glb', (gltf) => {
  scene.add(gltf.scene);
});

// Render target
const renderTarget = new THREE.WebGLRenderTarget(1280, 800);

// Projection mapper
const mapper = new ProjectionMapper(renderer, renderTarget.texture);
const gui = new ProjectionMapperGUI(mapper);

// Render loop
function animate() {
  requestAnimationFrame(animate);

  // Render your scene
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  // Render warped output
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();
```

**That's all you need!** 🎉
