/**
 * Shared Scene and Animation Code for Multi-Window Projection Mapping
 *
 * This file contains the scene setup and animation code that is used
 * by BOTH the controller and projector windows. This ensures DRY
 * (Don't Repeat Yourself) - the animation code is written once here
 * and imported by both windows.
 */

import * as THREE from 'three';

export interface SceneData {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cube: THREE.Mesh;
  renderTarget: THREE.WebGLRenderTarget;
  lensShiftY: number;
}

/**
 * Creates the projection scene with camera, cube, lights, and grid.
 * This is called by both controller and projector to create identical scenes.
 */
export function createProjectionScene(): SceneData {
  // Scene
  const scene = new THREE.Scene();

  // Camera (Acer X1383WH projector specs)
  const aspect = 1280 / 800;
  const throwRatio = 1.65;
  const fovV = 2 * Math.atan(Math.tan(Math.atan(1 / (2 * throwRatio))) / aspect);
  const camera = new THREE.PerspectiveCamera(fovV * (180 / Math.PI), aspect, 0.1, 1000);
  camera.position.set(0, 0.05, 1.5);
  camera.updateProjectionMatrix();

  // Apply lens shift for projector (Acer has 100% vertical offset)
  const lensShiftY = 1.0;
  camera.projectionMatrix.elements[9] = lensShiftY;

  // Cube
  const cubeSize = 0.2;
  const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
  cubeGeometry.translate(0, -cubeSize / 2, 0); // Pivot at bottom
  const cube = new THREE.Mesh(cubeGeometry, new THREE.MeshNormalMaterial());
  cube.position.set(0, 0.17, 0);
  cube.rotation.set(Math.PI, Math.PI * 0.25, 0);
  scene.add(cube);

  // Lights
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(1, 1, 1);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040));

  // Floor grid
  const grid = new THREE.GridHelper(2.0, 20, 0xff0000, 0xffffff);
  scene.add(grid);

  // Render target
  const renderTarget = new THREE.WebGLRenderTarget(1280, 800, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });

  return { scene, camera, cube, renderTarget, lensShiftY };
}

/**
 * Animates the scene (called in animation loop).
 * This is the ONLY place where animation code lives - no duplication!
 */
export function animateScene(sceneData: SceneData): void {
  sceneData.cube.rotation.y += 0.01;
}

/**
 * Renders the scene to the render target.
 * Handles lens shift reapplication after render.
 */
export function renderScene(
  renderer: THREE.WebGLRenderer,
  sceneData: SceneData
): void {
  renderer.setRenderTarget(sceneData.renderTarget);
  renderer.render(sceneData.scene, sceneData.camera);

  // Reapply lens shift (needed after every render)
  sceneData.camera.projectionMatrix.elements[9] = sceneData.lensShiftY;
}
