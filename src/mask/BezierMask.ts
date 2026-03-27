import * as THREE from 'three';
import { DragControls } from 'three/examples/jsm/controls/DragControls.js';
// @ts-ignore
import { Line2 } from 'three/addons/lines/Line2.js';
// @ts-ignore
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
// @ts-ignore
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export interface UVPoint { u: number; v: number; }

export interface BezierNode {
  anchor: UVPoint;
  handle: UVPoint;  // quadratic control point for segment FROM this anchor TO next anchor
}

const STORAGE_KEY = 'bezier-mask';

export class BezierMask {
  public enabled: boolean;
  public feather: number;
  public onChanged: (() => void) | null = null;

  private _nodes: BezierNode[];
  private worldWidth: number;
  private worldHeight: number;
  private scene: THREE.Scene;

  private anchorObjects: THREE.Mesh[] = [];
  private handleObjects: THREE.Mesh[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private stalkLines: any[] = [];
  private dragControls!: DragControls;

  private sphereGeo: THREE.SphereGeometry;
  private anchorMat: THREE.MeshBasicMaterial;
  private handleMat: THREE.MeshBasicMaterial;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private stalkMat: any;

  constructor(
    nodes: BezierNode[],
    worldWidth: number,
    worldHeight: number,
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    options: { enabled?: boolean; feather?: number } = {},
  ) {
    this._nodes = nodes.map(n => ({
      anchor: { ...n.anchor },
      handle: { ...n.handle },
    }));
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.scene = scene;
    this.enabled = options.enabled ?? true;
    this.feather = options.feather ?? 0.01;

    this.sphereGeo = new THREE.SphereGeometry(1, 8, 8);
    this.anchorMat = new THREE.MeshBasicMaterial({ color: 'hsl(195, 80%, 65%)', transparent: true, opacity: 0.9 });
    this.handleMat = new THREE.MeshBasicMaterial({ color: 'hsl(195, 50%, 80%)', transparent: true, opacity: 0.8 });
    this.stalkMat = new LineMaterial({ color: 0x88ccdd, linewidth: 1.5 });

    this.createSceneObjects(scene, camera, renderer);
  }

  get nodes(): BezierNode[] {
    return this._nodes;
  }

  private uvToWorld(uv: UVPoint): THREE.Vector2 {
    return new THREE.Vector2(
      (uv.u - 0.5) * this.worldWidth,
      (uv.v - 0.5) * this.worldHeight,
    );
  }

  private worldToUV(x: number, y: number): UVPoint {
    return {
      u: x / this.worldWidth + 0.5,
      v: y / this.worldHeight + 0.5,
    };
  }

  private createSceneObjects(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer): void {
    for (let i = 0; i < this._nodes.length; i++) {
      const node = this._nodes[i];
      const aPos = this.uvToWorld(node.anchor);
      const hPos = this.uvToWorld(node.handle);

      const anchor = new THREE.Mesh(this.sphereGeo, this.anchorMat);
      anchor.position.set(aPos.x, aPos.y, 0.01);
      anchor.userData.role = 'anchor';
      anchor.userData.nodeIndex = i;
      this.anchorObjects.push(anchor);
      scene.add(anchor);

      const handle = new THREE.Mesh(this.sphereGeo, this.handleMat);
      handle.position.set(hPos.x, hPos.y, 0.01);
      handle.userData.role = 'handle';
      handle.userData.nodeIndex = i;
      this.handleObjects.push(handle);
      scene.add(handle);

      const stalkGeo = new LineGeometry();
      stalkGeo.setPositions([hPos.x, hPos.y, 0.01, aPos.x, aPos.y, 0.01]);
      const stalk = new Line2(stalkGeo, this.stalkMat);
      this.stalkLines.push(stalk);
      scene.add(stalk);
    }

    const allHandles = [...this.anchorObjects, ...this.handleObjects];
    this.dragControls = new DragControls(allHandles, camera, renderer.domElement);
    this.dragControls.addEventListener('drag', this.handleDrag.bind(this));
    this.dragControls.addEventListener('dragend', () => this.saveToStorage());
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private updateStalk(line: any, p1: THREE.Vector2, p2: THREE.Vector2): void {
    line.geometry.setPositions([p1.x, p1.y, 0.01, p2.x, p2.y, 0.01]);
  }

  private handleDrag(event: { object: THREE.Object3D }): void {
    const obj = event.object as THREE.Mesh;
    const { role, nodeIndex } = obj.userData as { role: string; nodeIndex: number };
    const node = this._nodes[nodeIndex];

    obj.position.z = 0.01;
    const x = obj.position.x;
    const y = obj.position.y;

    if (role === 'anchor') {
      const oldAnchor = this.uvToWorld(node.anchor);
      const dx = x - oldAnchor.x;
      const dy = y - oldAnchor.y;

      const oldH = this.uvToWorld(node.handle);
      const newH = new THREE.Vector2(oldH.x + dx, oldH.y + dy);

      node.anchor = this.worldToUV(x, y);
      node.handle = this.worldToUV(newH.x, newH.y);

      this.handleObjects[nodeIndex].position.set(newH.x, newH.y, 0.01);

      const aPos = new THREE.Vector2(x, y);
      this.updateStalk(this.stalkLines[nodeIndex], newH, aPos);

    } else if (role === 'handle') {
      node.handle = this.worldToUV(x, y);
      const aPos = this.uvToWorld(node.anchor);
      this.updateStalk(this.stalkLines[nodeIndex], new THREE.Vector2(x, y), aPos);
    }

    this.onChanged?.();
  }

  public setVisible(visible: boolean): void {
    [...this.anchorObjects, ...this.handleObjects].forEach(obj => {
      obj.visible = visible;
      if (visible) obj.layers.enable(0); else obj.layers.disable(0);
    });
    this.stalkLines.forEach(line => { line.visible = visible; });
  }

  public updateControlPointsScale(pixelToWorld: number): void {
    const size = pixelToWorld * 5;
    this.anchorObjects.forEach(obj => obj.scale.setScalar(size));
    this.handleObjects.forEach(obj => obj.scale.setScalar(size));
  }

  public saveToStorage(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      nodes: this._nodes,
      enabled: this.enabled,
      feather: this.feather,
    }));
  }

  public dispose(): void {
    this.dragControls.dispose();
    [...this.anchorObjects, ...this.handleObjects].forEach(obj => this.scene.remove(obj));
    this.stalkLines.forEach(line => {
      line.geometry.dispose();
      this.scene.remove(line);
    });
    this.sphereGeo.dispose();
    this.anchorMat.dispose();
    this.handleMat.dispose();
    this.stalkMat.dispose();
    localStorage.removeItem(STORAGE_KEY);
  }

  public static defaultNodes(): BezierNode[] {
    return [
      { anchor: { u: 0.5,  v: 0.75 }, handle: { u: 0.75, v: 0.75 } },
      { anchor: { u: 0.75, v: 0.5  }, handle: { u: 0.75, v: 0.25 } },
      { anchor: { u: 0.5,  v: 0.25 }, handle: { u: 0.25, v: 0.25 } },
      { anchor: { u: 0.25, v: 0.5  }, handle: { u: 0.25, v: 0.75 } },
    ];
  }

  public static loadFromStorage(): { nodes: BezierNode[]; enabled: boolean; feather: number } | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
