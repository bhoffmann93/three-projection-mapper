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
import { MAX_POLYGON_POINTS, POLYGON_HANDLE_STYLE } from '../core/defaults';

export interface UVPoint {
  u: number;
  v: number;
}

export const POLYGON_MASK_STORAGE_KEY = 'polygon-mask';

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
  private wasDragging = false;
  private lastDragEndTime = 0;

  private boundClickHandler!: (e: MouseEvent) => void;
  private boundDblClickHandler!: (e: MouseEvent) => void;
  private boundMouseMoveHandler!: (e: MouseEvent) => void;

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
    this.saveToStorage(); // persist immediately so refresh restores the mask
  }

  private uvToWorld(uv: UVPoint): THREE.Vector2 {
    return new THREE.Vector2((uv.u - 0.5) * this.worldWidth, (uv.v - 0.5) * this.worldHeight);
  }

  private worldToUV(wx: number, wy: number): UVPoint {
    return { u: wx / this.worldWidth + 0.5, v: wy / this.worldHeight + 0.5 };
  }

  private createAnchorMesh(uv: UVPoint): THREE.Mesh {
    const geo = new THREE.SphereGeometry(1, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: POLYGON_HANDLE_STYLE.color, depthTest: false, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    const pos = this.uvToWorld(uv);
    mesh.position.set(pos.x, pos.y, 0);
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
    const outlineMat = new THREE.LineBasicMaterial({
      color: POLYGON_HANDLE_STYLE.color,
      depthTest: false,
      transparent: true,
    });
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
    this.dragControls.addEventListener('drag', (e) => {
      this.wasDragging = true;
      this.handleDrag(e as { object: THREE.Object3D });
    });
    this.dragControls.addEventListener('dragend', () => {
      if (this.wasDragging) {
        this.lastDragEndTime = Date.now();
        this.wasDragging = false;
      }
    });
  }

  private recreateDragControls(): void {
    this.dragControls.dispose();
    this.dragControls = new DragControls(this.anchorObjects, this.camera, this.renderer.domElement);
    this.attachDragListeners();
  }

  private insertNode(segmentIndex: number, uv: UVPoint): void {
    if (this.nodeList.length >= MAX_POLYGON_POINTS) return;
    const mesh = this.createAnchorMesh(uv);
    mesh.scale.setScalar(this.lastPixelToWorld * POLYGON_HANDLE_STYLE.anchorPointPixelRadius);
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
    setTimeout(() => {
      this.ignoreNextDblClick = false;
    }, POLYGON_HANDLE_STYLE.doubleClickInsertGuardMs);
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

  /**
   * Screen-space segment hit test. Projects each anchor to pixels and finds
   * the polygon edge closest to the mouse. More reliable than Three.js
   * LineLoop raycasting, which fails on very long or short segments.
   */
  private findClosestEdge(
    event: MouseEvent,
    pixelThreshold: number,
  ): { segmentIndex: number; worldPt: THREE.Vector3 } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const screenPt = new THREE.Vector2(event.clientX - rect.left, event.clientY - rect.top);
    const w = rect.width;
    const h = rect.height;

    const toScreen = (obj: THREE.Mesh): THREE.Vector2 => {
      const p = obj.position.clone().project(this.camera);
      return new THREE.Vector2(((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h);
    };

    const projected = this.anchorObjects.map(toScreen);
    const n = projected.length;
    let bestDist = pixelThreshold;
    let bestIndex = -1;
    let bestT = 0;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = projected[i];
      const b = projected[j];
      const ab = b.clone().sub(a);
      const abLen2 = ab.dot(ab);
      const t = abLen2 > 0 ? Math.max(0, Math.min(1, screenPt.clone().sub(a).dot(ab) / abLen2)) : 0;
      const dist = screenPt.distanceTo(a.clone().add(ab.clone().multiplyScalar(t)));
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
        bestT = t;
      }
    }

    if (bestIndex === -1) return null;

    const aWorld = this.anchorObjects[bestIndex].position;
    const bWorld = this.anchorObjects[(bestIndex + 1) % n].position;
    return {
      segmentIndex: bestIndex,
      worldPt: new THREE.Vector3().lerpVectors(aWorld, bWorld, bestT),
    };
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

      if (raycaster.intersectObjects(this.anchorObjects).length > 0) return;

      const result = this.findClosestEdge(event, POLYGON_HANDLE_STYLE.edgeHitPixelRadius);
      if (!result) return;

      const { segmentIndex, worldPt } = result;
      const flat = this.inverseTransform
        ? this.inverseTransform(worldPt.x, worldPt.y)
        : new THREE.Vector2(worldPt.x, worldPt.y);
      this.insertNode(segmentIndex, this.worldToUV(flat.x, flat.y));
    };

    this.boundDblClickHandler = (event: MouseEvent) => {
      if (!this.outlineLine.visible) return;
      if (this.ignoreNextDblClick) return;
      if (Date.now() - this.lastDragEndTime < POLYGON_HANDLE_STYLE.doubleClickInsertGuardMs) return;
      raycaster.setFromCamera(toNDC(event), this.camera);
      const hits = raycaster.intersectObjects(this.anchorObjects);
      if (hits.length === 0) return;
      const nodeIndex = this.anchorObjects.indexOf(hits[0].object as THREE.Mesh);
      this.removeNode(nodeIndex);
    };

    this.boundMouseMoveHandler = (event: MouseEvent) => {
      if (!this.outlineLine.visible) return;
      raycaster.setFromCamera(toNDC(event), this.camera);

      if (raycaster.intersectObjects(this.anchorObjects).length > 0) {
        this.renderer.domElement.style.cursor = 'grab';
      } else if (this.findClosestEdge(event, POLYGON_HANDLE_STYLE.edgeHitPixelRadius)) {
        this.renderer.domElement.style.cursor = 'crosshair';
      } else {
        this.renderer.domElement.style.cursor = '';
      }
    };

    this.renderer.domElement.addEventListener('click', this.boundClickHandler);
    this.renderer.domElement.addEventListener('dblclick', this.boundDblClickHandler);
    this.renderer.domElement.addEventListener('mousemove', this.boundMouseMoveHandler);
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
    this.saveToStorage();
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
      this.anchorObjects[i].position.set(warped.x, warped.y, 0);
    }
    this.updateOutline();
  }

  public updateControlPointsScale(pixelToWorld: number): void {
    this.lastPixelToWorld = pixelToWorld;
    const size = pixelToWorld * POLYGON_HANDLE_STYLE.anchorPointPixelRadius;
    for (const mesh of this.anchorObjects) {
      mesh.scale.setScalar(size);
    }
  }

  public setNodes(nodes: UVPoint[]): void {
    this.nodeList = [...nodes];
    // Rebuild anchor objects to match new node list
    for (const mesh of this.anchorObjects) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.anchorObjects = [];
    for (const node of this.nodeList) {
      const mesh = this.createAnchorMesh(node);
      mesh.scale.setScalar(this.lastPixelToWorld * POLYGON_HANDLE_STYLE.anchorPointPixelRadius);
      this.scene.add(mesh);
      this.anchorObjects.push(mesh);
    }
    this.rebuildOutline();
    this.recreateDragControls();
    this.onChanged();
  }

  public setVisible(visible: boolean): void {
    for (const mesh of this.anchorObjects) mesh.visible = visible;
    this.outlineLine.visible = visible;
    if (!visible) this.renderer.domElement.style.cursor = '';
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
    this.renderer.domElement.removeEventListener('mousemove', this.boundMouseMoveHandler);
    this.renderer.domElement.style.cursor = '';
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
