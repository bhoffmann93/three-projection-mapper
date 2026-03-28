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

Editing:
  Click on an outline edge  → insert new node at that position
  Double-click on a handle  → remove that node (minimum 3 nodes)
*/
import * as THREE from 'three';
import { DragControls } from 'three/examples/jsm/controls/DragControls.js';
import { RenderOrder } from '../core/RenderOrder';

export interface UVPoint {
  u: number;
  v: number;
}

export const POLYGON_MASK_STORAGE_KEY = 'polygon-mask';

const HANDLE_PIXEL_RADIUS = 5;
const EDGE_HIT_PIXEL_RADIUS = 8;
const DOUBLE_CLICK_INSERT_GUARD_MS = 300;

const ANCHOR_COLOR = 0x00ffff;
const ANCHOR_Z = 0.02;

const DEFAULT_NODES: UVPoint[] = [
  { u: 0.25, v: 0.25 },
  { u: 0.75, v: 0.25 },
  { u: 0.75, v: 0.75 },
  { u: 0.25, v: 0.75 },
];

export class PolygonMask {
  private nodeList: UVPoint[];
  private worldWidth: number;
  private worldHeight: number;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;

  private anchorObjects: THREE.Mesh[] = [];
  private outlineLine!: THREE.LineLoop;
  private outlinePositions!: Float32Array;
  private dragControls!: DragControls;

  private inverseTransform: ((x: number, y: number) => THREE.Vector2) | null = null;
  private lastPixelToWorld = 0;
  private ignoreNextDblClick = false;

  private boundClickHandler!: (e: MouseEvent) => void;
  private boundDblClickHandler!: (e: MouseEvent) => void;

  public onChanged: () => void = () => {};

  get nodes(): readonly UVPoint[] {
    return this.nodeList;
  }

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

    this.nodeList = nodes ?? this.loadFromStorage() ?? [...DEFAULT_NODES];

    this.buildObjects();
    this.initDragControls();
  }

  private uvToWorld(uv: UVPoint): THREE.Vector2 {
    return new THREE.Vector2((uv.u - 0.5) * this.worldWidth, (uv.v - 0.5) * this.worldHeight);
  }

  private worldToUV(wx: number, wy: number): UVPoint {
    return { u: wx / this.worldWidth + 0.5, v: wy / this.worldHeight + 0.5 };
  }

  private createAnchorMesh(uv: UVPoint): THREE.Mesh {
    const geo = new THREE.SphereGeometry(1, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: ANCHOR_COLOR, depthTest: false, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    const pos = this.uvToWorld(uv);
    mesh.position.set(pos.x, pos.y, ANCHOR_Z);
    mesh.renderOrder = RenderOrder.CONTROLS;
    return mesh;
  }

  private buildObjects(): void {
    for (const node of this.nodeList) {
      const mesh = this.createAnchorMesh(node);
      this.scene.add(mesh);
      this.anchorObjects.push(mesh);
    }

    this.outlinePositions = new Float32Array(this.nodeList.length * 3);
    const outlineGeo = new THREE.BufferGeometry();
    outlineGeo.setAttribute('position', new THREE.BufferAttribute(this.outlinePositions, 3));
    const outlineMat = new THREE.LineBasicMaterial({ color: ANCHOR_COLOR, depthTest: false, transparent: true });
    this.outlineLine = new THREE.LineLoop(outlineGeo, outlineMat);
    this.outlineLine.renderOrder = RenderOrder.CONTROLS;
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

  private rebuildOutline(): void {
    this.outlineLine.geometry.dispose();
    this.outlinePositions = new Float32Array(this.nodeList.length * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.outlinePositions, 3));
    this.outlineLine.geometry = geo;
    this.updateOutline();
  }

  private attachDragListeners(): void {
    this.dragControls.addEventListener('drag', this.handleDrag.bind(this));
    this.dragControls.addEventListener('dragend', () => this.saveToStorage());
  }

  private recreateDragControls(): void {
    this.dragControls.dispose();
    this.dragControls = new DragControls(this.anchorObjects, this.camera, this.renderer.domElement);
    this.attachDragListeners();
  }

  private insertNode(segmentIndex: number, uv: UVPoint): void {
    const mesh = this.createAnchorMesh(uv);
    mesh.scale.setScalar(this.lastPixelToWorld * HANDLE_PIXEL_RADIUS);
    mesh.visible = this.outlineLine.visible;
    this.scene.add(mesh);

    const insertAt = segmentIndex + 1;
    this.anchorObjects.splice(insertAt, 0, mesh);
    this.nodeList.splice(insertAt, 0, uv);

    this.rebuildOutline();
    this.recreateDragControls();
    this.saveToStorage();
    this.onChanged();

    this.ignoreNextDblClick = true;
    setTimeout(() => { this.ignoreNextDblClick = false; }, DOUBLE_CLICK_INSERT_GUARD_MS);
  }

  private removeNode(nodeIndex: number): void {
    if (this.nodeList.length <= 3) return;

    const mesh = this.anchorObjects[nodeIndex];
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();

    this.anchorObjects.splice(nodeIndex, 1);
    this.nodeList.splice(nodeIndex, 1);

    this.rebuildOutline();
    this.recreateDragControls();
    this.saveToStorage();
    this.onChanged();
  }

  private initDragControls(): void {
    this.dragControls = new DragControls(this.anchorObjects, this.camera, this.renderer.domElement);
    this.attachDragListeners();

    const raycaster = new THREE.Raycaster();

    const toNDC = (event: MouseEvent): THREE.Vector2 => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
    };

    this.boundClickHandler = (event: MouseEvent) => {
      if (!this.outlineLine.visible) return;
      raycaster.setFromCamera(toNDC(event), this.camera);
      raycaster.params.Line = { threshold: this.lastPixelToWorld * EDGE_HIT_PIXEL_RADIUS };

      if (raycaster.intersectObjects(this.anchorObjects).length > 0) return;

      const hits = raycaster.intersectObject(this.outlineLine);
      if (hits.length === 0) return;

      const segmentIndex = hits[0].index ?? 0;
      const worldPt = hits[0].point;
      const flat = this.inverseTransform
        ? this.inverseTransform(worldPt.x, worldPt.y)
        : new THREE.Vector2(worldPt.x, worldPt.y);
      this.insertNode(segmentIndex, this.worldToUV(flat.x, flat.y));
    };

    this.boundDblClickHandler = (event: MouseEvent) => {
      if (!this.outlineLine.visible) return;
      if (this.ignoreNextDblClick) return;
      raycaster.setFromCamera(toNDC(event), this.camera);
      const hits = raycaster.intersectObjects(this.anchorObjects);
      if (hits.length === 0) return;
      const nodeIndex = this.anchorObjects.indexOf(hits[0].object as THREE.Mesh);
      this.removeNode(nodeIndex);
    };

    this.renderer.domElement.addEventListener('click', this.boundClickHandler);
    this.renderer.domElement.addEventListener('dblclick', this.boundDblClickHandler);
  }

  private handleDrag(event: { object: THREE.Object3D }): void {
    const obj = event.object as THREE.Mesh;
    const nodeIndex = this.anchorObjects.indexOf(obj);
    if (nodeIndex === -1) return;

    const wx = obj.position.x;
    const wy = obj.position.y;

    const flat = this.inverseTransform ? this.inverseTransform(wx, wy) : new THREE.Vector2(wx, wy);

    this.nodeList[nodeIndex] = this.worldToUV(flat.x, flat.y);
    this.updateOutline();
    this.onChanged();
  }

  public updateTransformedPositions(
    transform: (x: number, y: number) => THREE.Vector2,
    inverse: (x: number, y: number) => THREE.Vector2,
  ): void {
    this.inverseTransform = inverse;

    for (let i = 0; i < this.nodeList.length; i++) {
      const flat = this.uvToWorld(this.nodeList[i]);
      const warped = transform(flat.x, flat.y);
      this.anchorObjects[i].position.set(warped.x, warped.y, ANCHOR_Z);
    }
    this.updateOutline();
  }

  public updateControlPointsScale(pixelToWorld: number): void {
    this.lastPixelToWorld = pixelToWorld;
    const size = pixelToWorld * HANDLE_PIXEL_RADIUS;
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
      localStorage.setItem(POLYGON_MASK_STORAGE_KEY, JSON.stringify(this.nodeList));
    } catch {
      /* ignore */
    }
  }

  private loadFromStorage(): UVPoint[] | null {
    try {
      const raw = localStorage.getItem(POLYGON_MASK_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 3) return parsed as UVPoint[];
    } catch {
      /* ignore */
    }
    return null;
  }

  public clearStorage(): void {
    localStorage.removeItem(POLYGON_MASK_STORAGE_KEY);
  }

  public dispose(): void {
    this.renderer.domElement.removeEventListener('click', this.boundClickHandler);
    this.renderer.domElement.removeEventListener('dblclick', this.boundDblClickHandler);
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
