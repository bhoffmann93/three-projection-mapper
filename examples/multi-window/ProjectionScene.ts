import * as THREE from 'three';
import { ProjectorCamera } from '../../src/core/ProjectorCamera';

export interface ProjectionSceneConfig {
  width: number;
  height: number;
  aspect?: number;
  throwRatio?: number;
  lensShiftY?: number;
}

export class ProjectionScene {
  public readonly scene: THREE.Scene;
  public readonly camera: ProjectorCamera;
  public readonly renderTarget: THREE.WebGLRenderTarget;

  private readonly cube: THREE.Mesh;
  private readonly lensShiftY: number;

  constructor(config: ProjectionSceneConfig) {
    const {
      width,
      height,
      aspect = 1280 / 800,
      throwRatio = 1.65, // Acer X1383WH
      lensShiftY = 1.0, // Acer X1383WH has 100% vertical offset
    } = config;

    this.lensShiftY = lensShiftY;

    this.scene = this.createScene();
    this.camera = this.createCamera(aspect, throwRatio, lensShiftY);
    this.cube = this.createCube();
    this.scene.add(this.cube);
    this.addLights();
    this.addGrid();

    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
  }

  public animate(): void {
    // this.cube.rotation.y += 0.01;
    // this.cube.rotation.x += 0.01;
    this.cube.position.y = 0.27 + Math.sin(performance.now() * 0.001) * 0.1;
  }

  public render(renderer: THREE.WebGLRenderer): void {
    renderer.setRenderTarget(this.renderTarget);
    renderer.render(this.scene, this.camera);

    this.camera.updateProjectionMatrix();
  }

  public getTexture(): THREE.Texture {
    return this.renderTarget.texture;
  }

  public updateCameraAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera.projectionMatrix.elements[9] = this.lensShiftY;
  }

  public dispose(): void {
    this.renderTarget.dispose();
    this.cube.geometry.dispose();
    if (this.cube.material instanceof THREE.Material) {
      this.cube.material.dispose();
    }
  }

  private createScene(): THREE.Scene {
    return new THREE.Scene();
  }

  private createCamera(aspect: number, throwRatio: number, lensShiftY: number): ProjectorCamera {
    const camera = new ProjectorCamera(throwRatio, lensShiftY, aspect, 0.1, 1000);
    camera.position.set(0, 0.05, 1.5);
    camera.updateProjectionMatrix();
    return camera;
  }

  private createCube(): THREE.Mesh {
    const cubeSize = 0.2;
    const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);

    const cube = new THREE.Mesh(geometry, new THREE.MeshNormalMaterial());
    cube.position.set(0, 0.17 + cubeSize / 2, 0);
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
