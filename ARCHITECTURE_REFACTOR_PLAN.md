# Architecture Refactoring Plan

**Date:** 2026-02-22
**Status:** Planned - Not Yet Implemented

## Core Design Principles

1. **Minimize complexity**: The primary goal of software design is to minimize complexity—anything that makes a system hard to understand and modify.
2. **Information hiding**: Each module should encapsulate design decisions that other modules don't need to know about, preventing information leakage across boundaries.
3. **Pull complexity downward**: It's better for a module to be internally complex if it keeps the interface simple for others. Don't expose complexity to callers.
4. **Favor exceptions over wrong results**: Raise errors for unknown edge cases rather than guessing.

---

## Current Architecture Problems

### 1. ❌ Violates "Minimize Complexity"

**ProjectionLibrary creates its own renderer:**
```typescript
// Line 38-44 in ProjectionLibrary.ts
this.renderer = new THREE.WebGLRenderer({...});
this.renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(this.renderer.domElement);
```

**Problem:** User likely already has a renderer in their app. Now they have to:
- Work around the library's renderer
- Manage two renderers
- Figure out which renderer to use when

**Solution:** Accept user's existing renderer as a parameter.

---

### 2. ❌ Violates "Information Hiding"

**ContentManager leaked into library:**
```typescript
// src/content/ContentManager.ts is used in controller/projector/example
const content = new ContentManager(); // Creates cube, camera, lights
```

**Problem:**
- Library "knows" about user content (cube, grid, camera)
- User can't easily substitute their own scene
- ContentManager is example code masquerading as library code

**Solution:** Library should only know about `Texture → Warped Output`. User's scene is opaque.

---

### 3. ❌ Violates "Pull Complexity Downward"

**Multi-window forced on user:**
```typescript
// User MUST understand these concepts to use library
this.windowManager = new WindowManager();
this.eventChannel = new EventChannel('projection-mapper-sync', this.config.mode);

// Awkward callback pattern
library.render((renderer, renderTarget) => {
  content.render(renderer, renderTarget);
});
```

**Problem:**
- Can't use library without window management
- User forced to understand BroadcastChannel, event types, mode concept
- Callback inversion makes code hard to follow

**Solution:** Multi-window should be optional addon. Core library should be dead simple.

---

## Proposed Better Architecture

### Layer 1: Core Warping (Zero Dependencies on Windows/IPC)

```typescript
// User's existing Three.js app
import * as THREE from 'three';
import { ProjectionMapper } from 'three-projection-mapper';

// User already has these
const renderer = new THREE.WebGLRenderer();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 16/10, 0.1, 1000);

// User adds their content
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(),
  new THREE.MeshNormalMaterial()
);
scene.add(cube);

// User creates render target for projection
const renderTarget = new THREE.WebGLRenderTarget(1280, 800);

// ✅ Simple library usage - just pass renderer and texture
const mapper = new ProjectionMapper(renderer, renderTarget.texture);

// User's animation loop (normal Three.js pattern)
function animate() {
  requestAnimationFrame(animate);

  cube.rotation.x += 0.01;

  // Render scene to texture
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  // Render warped output to screen
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();
```

**Benefits:**
- ✅ User controls renderer, camera, scene
- ✅ Library only knows about texture input
- ✅ No callback inversion
- ✅ Familiar Three.js pattern
- ✅ Zero dependencies on window management

---

### Layer 2: Multi-Window Sync (Optional Addon)

```typescript
import { ProjectionMapper, WindowSync } from 'three-projection-mapper';

const mapper = new ProjectionMapper(renderer, renderTarget.texture);

// ✅ Optional: Enable multi-window synchronization
const sync = new WindowSync(mapper);

sync.onProjectorReady(() => {
  console.log('Projector connected!');
});

// Open projector window
sync.openProjectorWindow();
```

**WindowSync handles:**
- BroadcastChannel IPC
- Event serialization
- Window lifecycle
- State synchronization

**User doesn't need to know about:**
- Event types
- Normalization
- BroadcastChannel API
- Controller vs projector modes

---

## Refactoring Checklist

### Phase 1: Split ProjectionLibrary

- [ ] Keep: `ProjectionMapper` (core warping, already exists)
- [ ] Remove: Renderer creation from ProjectionLibrary
- [ ] Remove: Render target creation from ProjectionLibrary
- [ ] Extract: Window/IPC logic → new `WindowSync` class
- [ ] Update: ProjectionMapper to accept optional renderer (backwards compatible)

### Phase 2: Remove ContentManager from Library

- [ ] Move `ContentManager.ts` to `/examples` folder
- [ ] Create clear examples showing the pattern
- [ ] Remove from library exports in `lib.ts`
- [ ] Add documentation that it's example code

### Phase 3: Simplify ProjectionMapper Constructor

**Before:**
```typescript
new ProjectionMapper(renderer, texture, { resolution, segments, gridControlPoints });
```

**After:**
```typescript
// Sensible defaults, optional config
new ProjectionMapper(renderer, texture);
new ProjectionMapper(renderer, texture, { gridControlPoints: { x: 7, y: 7 } });
```

- [ ] Review default values
- [ ] Make all config optional
- [ ] Add JSDoc with examples

### Phase 4: Create WindowSync Addon

```typescript
class WindowSync {
  constructor(mapper: ProjectionMapper, channelName = 'projection-sync');
  openProjectorWindow(url?: string): Window;
  closeProjectorWindow(): void;
  isConnected(): boolean;
  onProjectorReady(callback: () => void): void;
  onProjectorClose(callback: () => void): void;
}
```

- [ ] Create `src/addons/WindowSync.ts`
- [ ] Move BroadcastChannel logic from ProjectionLibrary
- [ ] Move WindowManager integration
- [ ] Add error handling and clear error messages
- [ ] Export from `three-projection-mapper/addons`

### Phase 5: Update Examples

- [ ] Update `example.ts` to use new simple API
- [ ] Update `controller.ts` to use WindowSync
- [ ] Update `projector.ts` to use WindowSync
- [ ] Create `/examples` folder with:
  - Basic usage (no windows)
  - Multi-window setup
  - Custom camera setup
  - Integration with existing app

### Phase 6: Documentation

- [ ] Update README.md with new API
- [ ] Add migration guide from old to new API
- [ ] Document WindowSync addon
- [ ] Add troubleshooting section
- [ ] API reference documentation

---

## NPM Usage Example (After Refactor)

### Installation
```bash
npm install three-projection-mapper
```

### Basic Usage (Single Window)
```typescript
import * as THREE from 'three';
import { ProjectionMapper } from 'three-projection-mapper';

// Your existing Three.js app
const renderer = new THREE.WebGLRenderer();
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1280/800, 0.1, 1000);

// Your content
const mesh = new THREE.Mesh(
  new THREE.TorusKnotGeometry(),
  new THREE.MeshStandardMaterial()
);
scene.add(mesh);

// Projection mapping setup
const projectionTarget = new THREE.WebGLRenderTarget(1280, 800);
const mapper = new ProjectionMapper(renderer, projectionTarget.texture);

// Optional: Add GUI
import { ProjectionMapperGUI } from 'three-projection-mapper';
const gui = new ProjectionMapperGUI(mapper);

// Render loop
function animate() {
  requestAnimationFrame(animate);

  mesh.rotation.x += 0.01;

  renderer.setRenderTarget(projectionTarget);
  renderer.render(scene, camera);

  renderer.setRenderTarget(null);
  mapper.render();
}

animate();
```

### Multi-Window Setup
```typescript
import { ProjectionMapper } from 'three-projection-mapper';
import { WindowSync } from 'three-projection-mapper/addons';

const mapper = new ProjectionMapper(renderer, projectionTarget.texture);

// Enable multi-window synchronization
const sync = new WindowSync(mapper);

sync.onProjectorReady(() => {
  console.log('Projector connected!');
});

sync.onProjectorClose(() => {
  console.log('Projector disconnected');
});

// Open projector window
document.getElementById('openProjector').addEventListener('click', () => {
  sync.openProjectorWindow();
});
```

---

## Architecture Violations → Fixes Summary

| Principle | Current Violation | Fix |
|-----------|------------------|-----|
| **Minimize Complexity** | Library creates renderer, forces window management | Accept user's renderer, make windows optional |
| **Information Hiding** | ContentManager in library, knows about user's scene | Remove ContentManager, only accept texture |
| **Pull Complexity Downward** | User must understand BroadcastChannel, modes, callbacks | Hide IPC in WindowSync addon, simple render() call |
| **Exceptions over Wrong Results** | Silent failures in window sync | Throw errors if sync fails, clear error messages |

---

## Migration Path

To maintain backwards compatibility during transition:

1. **Keep old API working** - Don't break existing code
2. **Add deprecation warnings** - Console.warn() for old patterns
3. **Provide migration guide** - Clear docs on how to update
4. **Semantic versioning** - Major version bump for breaking changes

Example deprecation:
```typescript
// Old API (deprecated but still works)
const library = new ProjectionLibrary({ mode: 'controller' });
// Console: "ProjectionLibrary is deprecated. Use ProjectionMapper + WindowSync instead."

// New API (preferred)
const mapper = new ProjectionMapper(renderer, texture);
const sync = new WindowSync(mapper);
```

---

## Benefits After Refactor

### For Library Users
- ✅ **Simpler**: Just 2 lines to get started
- ✅ **Flexible**: Works with existing Three.js setup
- ✅ **Optional features**: Only import what you need
- ✅ **Familiar patterns**: Standard Three.js workflow

### For Library Maintainers
- ✅ **Testable**: Core warping has no window dependencies
- ✅ **Modular**: Clear boundaries between components
- ✅ **Maintainable**: Each module has single responsibility
- ✅ **Extensible**: Easy to add new features without breaking existing code

---

## Next Steps

1. Review this plan with team/users
2. Create feature branch: `refactor/architecture-v2`
3. Implement Phase 1 (split ProjectionLibrary)
4. Write tests for new WindowSync class
5. Update examples
6. Beta release for testing
7. Documentation update
8. Official release with migration guide

---

## Notes

- Current implementation works but is overly complex
- Users are forced to understand internals they shouldn't need to know
- Library tries to do too much (renderer + windows + content)
- Core insight: **ProjectionMapper is already good** - just need to extract window logic and remove content assumptions
