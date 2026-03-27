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
  handleIn: UVPoint;   // arriving tangent handle (from previous segment)
  handleOut: UVPoint;  // departing tangent handle (toward next segment)
}

const STORAGE_KEY = 'bezier-mask';
const HANDLE_OFFSET = 0.138; // 0.25 * 0.5523 for smooth circular oval

export class BezierMask {
  public enabled: boolean;
  public feather: number;
  public onChanged: (() => void) | null = null;

  private _nodes: BezierNode[];
  private worldWidth: number;
  private worldHeight: number;
  private scene: THREE.Scene;

  private anchorObjects: THREE.Mesh[] = [];
  private handleInObjects: THREE.Mesh[] = [];
  private handleOutObjects: THREE.Mesh[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private stalkInLines: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private stalkOutLines: any[] = [];
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
      handleIn: { ...n.handleIn },
      handleOut: { ...n.handleOut },
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
      const hiPos = this.uvToWorld(node.handleIn);
      const hoPos = this.uvToWorld(node.handleOut);

      const anchor = new THREE.Mesh(this.sphereGeo, this.anchorMat);
      anchor.position.set(aPos.x, aPos.y, 0.01);
      anchor.userData.role = 'anchor';
      anchor.userData.nodeIndex = i;
      this.anchorObjects.push(anchor);
      scene.add(anchor);

      const handleIn = new THREE.Mesh(this.sphereGeo, this.handleMat);
      handleIn.position.set(hiPos.x, hiPos.y, 0.01);
      handleIn.userData.role = 'handleIn';
      handleIn.userData.nodeIndex = i;
      this.handleInObjects.push(handleIn);
      scene.add(handleIn);

      const handleOut = new THREE.Mesh(this.sphereGeo, this.handleMat);
      handleOut.position.set(hoPos.x, hoPos.y, 0.01);
      handleOut.userData.role = 'handleOut';
      handleOut.userData.nodeIndex = i;
      this.handleOutObjects.push(handleOut);
      scene.add(handleOut);

      const stalkInGeo = new LineGeometry();
      stalkInGeo.setPositions([hiPos.x, hiPos.y, 0.01, aPos.x, aPos.y, 0.01]);
      const stalkIn = new Line2(stalkInGeo, this.stalkMat);
      this.stalkInLines.push(stalkIn);
      scene.add(stalkIn);

      const stalkOutGeo = new LineGeometry();
      stalkOutGeo.setPositions([hoPos.x, hoPos.y, 0.01, aPos.x, aPos.y, 0.01]);
      const stalkOut = new Line2(stalkOutGeo, this.stalkMat);
      this.stalkOutLines.push(stalkOut);
      scene.add(stalkOut);
    }

    const allHandles = [...this.anchorObjects, ...this.handleInObjects, ...this.handleOutObjects];
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

      const oldHi = this.uvToWorld(node.handleIn);
      const oldHo = this.uvToWorld(node.handleOut);
      const newHi = new THREE.Vector2(oldHi.x + dx, oldHi.y + dy);
      const newHo = new THREE.Vector2(oldHo.x + dx, oldHo.y + dy);

      node.anchor = this.worldToUV(x, y);
      node.handleIn = this.worldToUV(newHi.x, newHi.y);
      node.handleOut = this.worldToUV(newHo.x, newHo.y);

      this.handleInObjects[nodeIndex].position.set(newHi.x, newHi.y, 0.01);
      this.handleOutObjects[nodeIndex].position.set(newHo.x, newHo.y, 0.01);

      const aPos = new THREE.Vector2(x, y);
      this.updateStalk(this.stalkInLines[nodeIndex], newHi, aPos);
      this.updateStalk(this.stalkOutLines[nodeIndex], newHo, aPos);

    } else if (role === 'handleIn') {
      node.handleIn = this.worldToUV(x, y);
      const aPos = this.uvToWorld(node.anchor);
      this.updateStalk(this.stalkInLines[nodeIndex], new THREE.Vector2(x, y), aPos);
      // Mirror handleOut through anchor
      const mirrorX = 2 * aPos.x - x;
      const mirrorY = 2 * aPos.y - y;
      node.handleOut = this.worldToUV(mirrorX, mirrorY);
      this.handleOutObjects[nodeIndex].position.set(mirrorX, mirrorY, 0.01);
      this.updateStalk(this.stalkOutLines[nodeIndex], new THREE.Vector2(mirrorX, mirrorY), aPos);

    } else if (role === 'handleOut') {
      node.handleOut = this.worldToUV(x, y);
      const aPos = this.uvToWorld(node.anchor);
      this.updateStalk(this.stalkOutLines[nodeIndex], new THREE.Vector2(x, y), aPos);
      // Mirror handleIn through anchor
      const mirrorX = 2 * aPos.x - x;
      const mirrorY = 2 * aPos.y - y;
      node.handleIn = this.worldToUV(mirrorX, mirrorY);
      this.handleInObjects[nodeIndex].position.set(mirrorX, mirrorY, 0.01);
      this.updateStalk(this.stalkInLines[nodeIndex], new THREE.Vector2(mirrorX, mirrorY), aPos);
    }

    this.onChanged?.();
  }

  public setVisible(visible: boolean): void {
    const allObjects = [...this.anchorObjects, ...this.handleInObjects, ...this.handleOutObjects];
    allObjects.forEach(obj => {
      obj.visible = visible;
      if (visible) obj.layers.enable(0); else obj.layers.disable(0);
    });
    [...this.stalkInLines, ...this.stalkOutLines].forEach(line => {
      line.visible = visible;
    });
  }

  public updateControlPointsScale(pixelToWorld: number): void {
    const size = pixelToWorld * 5;
    this.anchorObjects.forEach(obj => obj.scale.setScalar(size));
    this.handleInObjects.forEach(obj => obj.scale.setScalar(size));
    this.handleOutObjects.forEach(obj => obj.scale.setScalar(size));
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
    const allObjs = [...this.anchorObjects, ...this.handleInObjects, ...this.handleOutObjects];
    allObjs.forEach(obj => this.scene.remove(obj));
    [...this.stalkInLines, ...this.stalkOutLines].forEach(line => {
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
    const h = HANDLE_OFFSET;
    return [
      { anchor: { u: 0.5,  v: 0.75 }, handleIn: { u: 0.5 - h, v: 0.75 }, handleOut: { u: 0.5 + h, v: 0.75 } },
      { anchor: { u: 0.75, v: 0.5  }, handleIn: { u: 0.75, v: 0.5 + h  }, handleOut: { u: 0.75, v: 0.5 - h  } },
      { anchor: { u: 0.5,  v: 0.25 }, handleIn: { u: 0.5 + h, v: 0.25  }, handleOut: { u: 0.5 - h, v: 0.25  } },
      { anchor: { u: 0.25, v: 0.5  }, handleIn: { u: 0.25, v: 0.5 - h  }, handleOut: { u: 0.25, v: 0.5 + h  } },
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
