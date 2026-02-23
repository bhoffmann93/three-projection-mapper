/**
 * ContentManager - Single source of truth for scene content
 * Both controller and projector windows instantiate this class
 */

import * as THREE from 'three';

export class ContentManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public cube: THREE.Mesh;
  private lensShiftY: number;

  constructor() {
    // Create scene
    this.scene = new THREE.Scene();

    // Create camera (Acer X1383WH settings)
    const distToSurface = 1.5;
    const lensCenterY = 0.05;
    const throwRatio = 1.65;
    const physicalTilt = 0;
    this.lensShiftY = 1.0;
    const aspect = 1280 / 800;

    const fovH = 2 * Math.atan(1 / (2 * throwRatio));
    const fovV = 2 * Math.atan(Math.tan(fovH / 2) / aspect);
    const fovDegrees = fovV * (180 / Math.PI);

    this.camera = new THREE.PerspectiveCamera(fovDegrees, aspect, 0.1, 1000);
    this.camera.position.set(0.0, lensCenterY, distToSurface);
    this.camera.rotation.x = THREE.MathUtils.degToRad(physicalTilt);
    this.camera.updateProjectionMatrix();
    this.camera.projectionMatrix.elements[9] = this.lensShiftY;

    // Create cube
    const cubeSize = 0.2;
    const cubePositionY = 0.17;
    const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    cubeGeometry.translate(0, -cubeSize / 2, 0);
    const material = new THREE.MeshNormalMaterial();
    this.cube = new THREE.Mesh(cubeGeometry, material);
    this.cube.position.set(0, cubePositionY, 0);
    this.cube.rotation.set(Math.PI, Math.PI * 0.25, 0);
    this.scene.add(this.cube);

    // Add lights
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0x404040));

    // Add floor grid
    const GRID_SIZE = 2.0;
    const GRID_DIVISIONS = 20;
    const COLOR_AXIS = 0xff0000;
    const COLOR_LINES = 0xffffff;
    const floorGrid = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, COLOR_AXIS, COLOR_LINES);
    floorGrid.position.set(0, 0, 0);
    this.scene.add(floorGrid);
  }

  /**
   * Update animation - call this every frame
   */
  update(): void {
    // this.cube.rotation.x += 0.01;
    // this.cube.rotation.y += 0.01;
  }

  /**
   * Render the scene to a render target
   */
  render(renderer: THREE.WebGLRenderer, renderTarget: THREE.WebGLRenderTarget): void {
    renderer.setRenderTarget(renderTarget);
    renderer.render(this.scene, this.camera);

    // Reapply lens shift
    this.camera.projectionMatrix.elements[9] = this.lensShiftY;
  }

  /**
   * Handle window resize
   */
  resize(): void {
    this.camera.aspect = 1280 / 800;
    this.camera.updateProjectionMatrix();
    this.camera.projectionMatrix.elements[9] = this.lensShiftY;
  }
}
