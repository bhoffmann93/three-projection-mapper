/*
PolygonMask
-----------
A closed polygon mask with draggable anchor points. The mask is defined in UV space (0–1)
and evaluated as a signed distance field (SDF) in the fragment shader — it clips the texture,
not the screen geometry. The mask shape is therefore independent of the perspective warp.

Node ground truth is stored in UV space. Anchor spheres are displayed in world space,
repositioned each frame by applying the current perspective homography (corner warp only,
not the grid warp) to the flat UV→world position. This keeps handles visually glued to
the warped image without distorting the mask shape itself.

On drag: the dragged world position is inverse-transformed back to flat space before
converting to UV. This means storing UV = worldToUV(T⁻¹(draggedPos)). On the next frame,
updateTransformedPositions computes T(uvToWorld(UV)) = T(T⁻¹(draggedPos)) = draggedPos,
so there is no conflict between DragControls and the per-frame repositioning.

UV space (ground truth) → T (perspective homography) → World space (sphere display)
Fragment shader receives flat vUv → sdPolygon SDF → smoothstep mask → applied to color
*/
import * as THREE from 'three';
import { DragControls } from 'three/examples/jsm/controls/DragControls.js';

export interface UVPoint {
  u: number;
  v: number;
}

const STORAGE_KEY = 'polygon-mask';

const DEFAULT_NODES: UVPoint[] = [
  { u: 0.25, v: 0.25 },
  { u: 0.75, v: 0.25 },
  { u: 0.75, v: 0.75 },
  { u: 0.25, v: 0.75 },
];

export class PolygonMask {
  private _nodes: UVPoint[];
  private worldWidth: number;
  private worldHeight: number;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;

  private anchorObjects: THREE.Mesh[] = [];
  private outlineLine!: THREE.LineLoop;
  private outlinePositions!: Float32Array;
  private dragControls!: DragControls;

  private _inverseTransform: ((x: number, y: number) => THREE.Vector2) | null = null;

  public onChanged: () => void = () => {};

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    worldWidth: number,
    worldHeight: number,
    nodes?: UVPoint[],
  ) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;

    this._nodes = nodes ?? this.loadFromStorage() ?? [...DEFAULT_NODES];

    this.buildObjects();
    this.initDragControls();
  }

  get nodes(): UVPoint[] {
    return this._nodes;
  }

  private uvToWorld(uv: UVPoint): THREE.Vector2 {
    return new THREE.Vector2((uv.u - 0.5) * this.worldWidth, (uv.v - 0.5) * this.worldHeight);
  }

  private worldToUV(wx: number, wy: number): UVPoint {
    return { u: wx / this.worldWidth + 0.5, v: wy / this.worldHeight + 0.5 };
  }

  private buildObjects(): void {
    const geo = new THREE.SphereGeometry(1, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, depthTest: false });

    for (const node of this._nodes) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      const pos = this.uvToWorld(node);
      mesh.position.set(pos.x, pos.y, 0.02);
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      this.anchorObjects.push(mesh);
    }

    this.outlinePositions = new Float32Array(this._nodes.length * 3);
    const outlineGeo = new THREE.BufferGeometry();
    outlineGeo.setAttribute('position', new THREE.BufferAttribute(this.outlinePositions, 3));
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false });
    this.outlineLine = new THREE.LineLoop(outlineGeo, outlineMat);
    this.outlineLine.renderOrder = 2;
    this.scene.add(this.outlineLine);

    this.updateOutline();
  }

  private updateOutline(): void {
    for (let i = 0; i < this.anchorObjects.length; i++) {
      this.outlinePositions[i * 3] = this.anchorObjects[i].position.x;
      this.outlinePositions[i * 3 + 1] = this.anchorObjects[i].position.y;
      this.outlinePositions[i * 3 + 2] = this.anchorObjects[i].position.z;
    }
    (this.outlineLine.geometry as THREE.BufferGeometry).attributes.position.needsUpdate = true;
  }

  private initDragControls(): void {
    this.dragControls = new DragControls(this.anchorObjects, this.camera, this.renderer.domElement);
    this.dragControls.addEventListener('drag', this.handleDrag.bind(this));
    this.dragControls.addEventListener('dragend', () => {
      this.saveToStorage();
    });
  }

  private handleDrag(event: { object: THREE.Object3D }): void {
    const obj = event.object as THREE.Mesh;
    const nodeIndex = this.anchorObjects.indexOf(obj);
    if (nodeIndex === -1) return;

    const wx = obj.position.x;
    const wy = obj.position.y;

    const flat = this._inverseTransform ? this._inverseTransform(wx, wy) : new THREE.Vector2(wx, wy);

    this._nodes[nodeIndex] = this.worldToUV(flat.x, flat.y);
    this.updateOutline();
    this.onChanged();
  }

  public updateTransformedPositions(
    transform: (x: number, y: number) => THREE.Vector2,
    inverseTransform: (x: number, y: number) => THREE.Vector2,
  ): void {
    this._inverseTransform = inverseTransform;

    for (let i = 0; i < this._nodes.length; i++) {
      const flat = this.uvToWorld(this._nodes[i]);
      const warped = transform(flat.x, flat.y);
      this.anchorObjects[i].position.set(warped.x, warped.y, 0.02);
    }
    this.updateOutline();
  }

  public updateControlPointsScale(pixelToWorld: number): void {
    const size = pixelToWorld * 5;
    for (const mesh of this.anchorObjects) {
      mesh.scale.setScalar(size);
    }
  }

  public setVisible(visible: boolean): void {
    for (const mesh of this.anchorObjects) mesh.visible = visible;
    this.outlineLine.visible = visible;
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._nodes));
    } catch {
      /* ignore */
    }
  }

  private loadFromStorage(): UVPoint[] | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 3) return parsed as UVPoint[];
    } catch {
      /* ignore */
    }
    return null;
  }

  public clearStorage(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  public dispose(): void {
    this.dragControls.dispose();
    for (const mesh of this.anchorObjects) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.scene.remove(this.outlineLine);
    this.outlineLine.geometry.dispose();
    (this.outlineLine.material as THREE.Material).dispose();
    this.anchorObjects = [];
  }
}
