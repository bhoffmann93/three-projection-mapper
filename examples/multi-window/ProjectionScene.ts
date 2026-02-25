import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
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

  private readonly redLight: THREE.PointLight;
  private readonly blueLight: THREE.PointLight;
  private readonly lensShiftY: number;
  private model: THREE.Object3D | null = null;

  constructor(config: ProjectionSceneConfig) {
    const { width, height, aspect = 1920 / 1080, throwRatio = 1.65, lensShiftY = 1.0 } = config;

    this.lensShiftY = lensShiftY;

    this.scene = new THREE.Scene();
    this.camera = new ProjectorCamera(throwRatio, lensShiftY, aspect, 0.5, 500);
    this.camera.position.set(0, 1.7, 40);
    this.camera.updateProjectionMatrix();

    const { redLight, blueLight } = this.addLights();
    this.redLight = redLight;
    this.blueLight = blueLight;
    this.addGrid();
    this.loadModel();

    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
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
    if (this.model) {
      this.model.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          if (mesh.material instanceof THREE.Material) mesh.material.dispose();
        }
      });
    }
  }

  private addLights(): { redLight: THREE.PointLight; blueLight: THREE.PointLight } {
    const hemi = new THREE.HemisphereLight(
      new THREE.Color().setHSL(0.6, 0.4, 0.7),
      new THREE.Color().setHSL(0.25, 0.3, 0.15),
      1.25,
    );
    this.scene.add(hemi);

    const redLight = new THREE.PointLight(new THREE.Color().setHSL(0.0, 1.0, 0.5), 200, 40);
    this.scene.add(redLight);

    const blueLight = new THREE.PointLight(new THREE.Color().setHSL(0.62, 1.0, 0.5), 200, 40);
    this.scene.add(blueLight);

    return { redLight, blueLight };
  }

  private addGrid(): void {
    const grid = new THREE.GridHelper(200, 40, 0x334433, 0x445544);
    this.scene.add(grid);
  }

  private loadModel(): void {
    //@ts-ignore
    const base = import.meta.env.BASE_URL;
    const texLoader = new THREE.TextureLoader();
    const texBase = `${base}concrete_0019_1k_K4mRwL/concrete_0019`;

    function loadTex(suffix: string, colorSpace = THREE.NoColorSpace) {
      const t = texLoader.load(`${texBase}${suffix}`);
      t.colorSpace = colorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(10, 6);
      return t;
    }

    const concreteMat = new THREE.MeshStandardMaterial({
      //@ts-ignore
      map: loadTex('_color_1k.jpg', THREE.SRGBColorSpace),
      normalMap: loadTex('_normal_opengl_1k.png'),
      roughnessMap: loadTex('_roughness_1k.jpg'),
      roughness: 1.0,
      metalness: 0.1,
    });

    const loader = new OBJLoader();
    //@ts-ignore
    loader.load(`${base}bergi.obj`, (obj: THREE.Object3D) => {
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = concreteMat;
        }
      });
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const scale = 20 / Math.max(size.x, size.y, size.z);
      obj.scale.setScalar(scale);
      box.setFromObject(obj);
      obj.position.set(0, -box.min.y * 1.45, 0);
      obj.rotation.y -= Math.PI / 2.0;
      this.scene.add(obj);
      this.model = obj;
    });
  }

  public animate(t: number): void {
    this.redLight.position.set(-7 + Math.sin(t * 0.8) * 4, 5 + Math.cos(t * 1.1) * 3, 8);
    this.blueLight.position.set(7 + Math.sin(t * 0.8 + Math.PI) * 4, 6 + Math.cos(t * 1.1 + Math.PI) * 3, 8);
  }
}
