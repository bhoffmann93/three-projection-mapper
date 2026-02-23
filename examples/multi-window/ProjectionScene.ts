/**
 * ProjectionScene - Encapsulates 3D Scene Logic
 *
 * Single Responsibility: Manages the 3D content (scene, camera, objects, animation)
 * This is USER CODE, not framework code. Both controller and projector
 * instantiate this class to ensure they render identical content.
 *
 * This class hides implementation details and provides a clean interface.
 */

import * as THREE from 'three';

export interface ProjectionSceneConfig {
  /** Render target dimensions */
  width: number;
  height: number;
  /** Camera aspect ratio */
  aspect?: number;
  /** Projector throw ratio (default: 1.65 for Acer X1383WH) */
  throwRatio?: number;
  /** Lens shift Y offset (default: 1.0 for Acer) */
  lensShiftY?: number;
}

/**
 * Encapsulates all 3D scene logic for projection mapping.
 * Hides complexity, exposes simple interface.
 */
export class ProjectionScene {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderTarget: THREE.WebGLRenderTarget;

  private readonly cube: THREE.Mesh;
  private readonly lensShiftY: number;

  constructor(config: ProjectionSceneConfig) {
    const {
      width,
      height,
      aspect = 1280 / 800,
      throwRatio = 1.65,
      lensShiftY = 1.0,
    } = config;

    this.lensShiftY = lensShiftY;

    // Initialize scene
    this.scene = this.createScene();
    this.camera = this.createCamera(aspect, throwRatio, lensShiftY);
    this.cube = this.createCube();
    this.scene.add(this.cube);
    this.addLights();
    this.addGrid();

    // Create render target
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
  }

  /**
   * Update animation (called once per frame)
   */
  public animate(): void {
    this.cube.rotation.y += 0.01;
  }

  /**
   * Render scene to render target
   * Handles lens shift reapplication after render
   */
  public render(renderer: THREE.WebGLRenderer): void {
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);

    // Reapply lens shift (needed after every render)
    this.camera.projectionMatrix.elements[9] = this.lensShiftY;
  }

  /**
   * Get the render target texture for projection mapping
   */
  public getTexture(): THREE.Texture {
    return this.renderTarget.texture;
  }

  /**
   * Update camera aspect ratio (for resize)
   */
  public updateCameraAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera.projectionMatrix.elements[9] = this.lensShiftY;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.renderTarget.dispose();
    this.cube.geometry.dispose();
    if (this.cube.material instanceof THREE.Material) {
      this.cube.material.dispose();
    }
  }

  // ========== Private: Pull Complexity Downward ==========

  private createScene(): THREE.Scene {
    return new THREE.Scene();
  }

  private createCamera(aspect: number, throwRatio: number, lensShiftY: number): THREE.PerspectiveCamera {
    const fovV = 2 * Math.atan(Math.tan(Math.atan(1 / (2 * throwRatio))) / aspect);
    const camera = new THREE.PerspectiveCamera(fovV * (180 / Math.PI), aspect, 0.1, 1000);
    camera.position.set(0, 0.05, 1.5);
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[9] = lensShiftY;
    return camera;
  }

  private createCube(): THREE.Mesh {
    const cubeSize = 0.2;
    const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    geometry.translate(0, -cubeSize / 2, 0); // Pivot at bottom

    const cube = new THREE.Mesh(geometry, new THREE.MeshNormalMaterial());
    cube.position.set(0, 0.17, 0);
    cube.rotation.set(Math.PI, Math.PI * 0.25, 0);

    return cube;
  }

  private addLights(): void {
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0x404040));
  }

  private addGrid(): void {
    const grid = new THREE.GridHelper(2.0, 20, 0xff0000, 0xffffff);
    this.scene.add(grid);
  }
}
