/**
 * Shared content scene factory
 * Creates the user's 3D content (cube, lights, floor grid)
 * Used across example, controller, and projector windows
 */

import * as THREE from 'three';

export interface ContentSceneConfig {
  cubeSize?: number;
  cubePositionY?: number;
  gridSize?: number;
  gridDivisions?: number;
}

export interface ContentSceneResult {
  scene: THREE.Scene;
  cube: THREE.Mesh;
}

export function createContentScene(config: ContentSceneConfig = {}): ContentSceneResult {
  const { cubeSize = 0.2, cubePositionY = 0.17, gridSize = 2.0, gridDivisions = 20 } = config;

  const scene = new THREE.Scene();

  // Create cube
  const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
  cubeGeometry.translate(0, -cubeSize / 2, 0); // Pivot at bottom
  const material = new THREE.MeshNormalMaterial();
  const cube = new THREE.Mesh(cubeGeometry, material);
  cube.position.set(0, cubePositionY, 0);
  cube.rotation.set(Math.PI, Math.PI * 0.25, 0);
  scene.add(cube);

  // Lights
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(1, 1, 1);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040));

  // Floor grid
  const COLOR_AXIS = 0xff0000; // Red for center intersecting lines
  const COLOR_LINES = 0xffffff; // White for grid lines
  const floorGrid = new THREE.GridHelper(gridSize, gridDivisions, COLOR_AXIS, COLOR_LINES);
  floorGrid.position.set(0, 0, 0);
  scene.add(floorGrid);

  return { scene, cube };
}
