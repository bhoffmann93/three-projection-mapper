# Examples

This folder contains example code showing how to use the three-projection-mapper library.

## ContentManager.ts

**This is example code, not part of the library!**

`ContentManager` is a helper class that creates a simple 3D scene for demonstration purposes. It includes:
- A rotating cube
- Projector camera setup (Acer X1383WH)
- Floor grid
- Lighting

### Usage

Copy this pattern for your own content:

```typescript
import { ContentManager } from '../examples/ContentManager';

const content = new ContentManager();

// Access the scene and camera
content.scene; // THREE.Scene
content.camera; // THREE.PerspectiveCamera
content.cube; // THREE.Mesh

// Update animation
content.update();

// Render to render target
content.render(renderer, renderTarget);
```

### Creating Your Own Content

Don't import `ContentManager` - instead, create your own scene:

```typescript
import * as THREE from 'three';

// Your own scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1280/800, 0.1, 1000);

// Your content
const geometry = new THREE.TorusKnotGeometry();
const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// In your render loop
function animate() {
  mesh.rotation.x += 0.01;

  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  renderer.setRenderTarget(null);
  mapper.render();
}
```

## Other Example Files

- `createContentScene.ts` - Factory function for creating demo scene
- `createProjectorCamera.ts` - Factory function for Acer projector camera setup

These are also **example code only** - feel free to copy and modify for your needs!
