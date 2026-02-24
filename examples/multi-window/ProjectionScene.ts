import * as THREE from 'three';
import { ProjectorCamera } from '../../src/core/ProjectorCamera';
import { calculateFovFromThrowRatio } from '../../src/utils/projection';

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

  constructor(config: ProjectionSceneConfig) {
    const {
      width,
      height,
      aspect = 1280 / 800,
      throwRatio = 1.55, // Acer X1383WH 1.55 – 1.70
      lensShiftY = 1.0, // Acer X1383WH has 100% vertical offset
    } = config;

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
    const time = performance.now() * 0.001;
    const speed = 2.0; // Geschwindigkeit des Wechsels

    // Bestimmt den Index (0 bis 5)
    const activeFace = Math.floor(time * speed) % 6;

    if (this.cube.material instanceof THREE.ShaderMaterial) {
      this.cube.material.uniforms.uActiveFace.value = activeFace;
    }

    // Deine bestehende Animation
    // this.cube.position.y = 0.27 + Math.sin(time) * 0.1;
    // this.cube.rotation.y += 0.01;
    // this.cube.rotation.x += 0.01;
    // this.cube.position.y = 0.27 + Math.sin(performance.now() * 0.001) * 0.05;
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
  }

  public setThrowRatio(throwRatio: number): void {
    this.camera.fov = calculateFovFromThrowRatio(throwRatio, this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  public setLensShiftY(lensShiftY: number): void {
    this.camera.lensShiftY = lensShiftY;
    this.camera.updateProjectionMatrix();
  }

  public setCameraPosition(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z);
  }

  public setCubePitch(rotX: number): void {
    this.cube.rotation.x = rotX;
  }

  public setCubeYaw(rotY: number): void {
    this.cube.rotation.y = rotY;
  }

  public setCameraRotation(rotX: number, rotY: number): void {
    this.camera.rotation.set(rotX, rotY, 0);
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

  private createCubeShader(): THREE.Mesh {
    const cubeSize = 0.2;
    // Non-indexed für eindeutige Face-Zuweisung pro Vertex
    let geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize).toNonIndexed();

    const vertexCount = geometry.attributes.position.count;
    const faceIndices = new Float32Array(vertexCount);

    // Jede Seite hat 6 Vertices (2 Dreiecke à 3 Punkte)
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        faceIndices[i * 6 + j] = i;
      }
    }

    geometry.setAttribute('aFaceIndex', new THREE.BufferAttribute(faceIndices, 1));

    const uniforms = {
      uActiveFace: { value: 0.0 },
      uHighlightColor: { value: new THREE.Color(0xffffff) },
      uBaseColor: { value: new THREE.Color(0x222222) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
      attribute float aFaceIndex;
      varying float vFaceIndex;
      varying vec3 vNormal;
      void main() {
        vFaceIndex = aFaceIndex;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
      fragmentShader: `
      varying float vFaceIndex;
      varying vec3 vNormal;
      uniform float uActiveFace;
      uniform vec3 uHighlightColor;
      uniform vec3 uBaseColor;

      void main() {
        // Vergleich mit Epsilon für Floating-Point Präzision
        float intensity = abs(vFaceIndex - uActiveFace) < 0.1 ? 1.0 : 0.2;
        
        // Simple Lambert-Beleuchtung kombiniert mit Face-Highlight
        float light = max(dot(vNormal, vec3(1.0, 1.0, 1.0)), 0.0);
        vec3 color = mix(uBaseColor, uHighlightColor, intensity);

        
        gl_FragColor = vec4(color * (light + 0.3), 1.0);
      }
    `,
    });

    const cube = new THREE.Mesh(geometry, material);
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
