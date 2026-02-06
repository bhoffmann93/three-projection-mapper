import * as THREE from 'three';
import { DragControls } from 'three/examples/jsm/controls/DragControls.js';
//@ts-ignore
import { Line2 } from 'three/addons/lines/Line2.js';
//@ts-ignore
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
//@ts-ignore
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import PerspT from './perspective';
import { isQuadConcave } from './geometry';
import { clamp } from 'three/src/math/MathUtils';
import meshWarpVertexShader from './shaders/warp.vert';

export interface MeshWarperConfig {
  width: number;
  height: number;
  widthSegments: number;
  heightSegments: number;
  gridControlPoints: { x: number; y: number };
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  fragmentShader: string;
  globalUniforms: Record<string, { value: unknown }>;
  globalDefines: Record<string, unknown>;
  bufferTexture: THREE.Texture;
}

const STORAGE_KEY = 'warp-grid-control-points';

interface StoredControlPoints {
  corners: { x: number; y: number; z: number }[];
  grid: { x: number; y: number; z: number }[];
  referenceGrid: { x: number; y: number; z: number }[];
}

export class MeshWarper {
  private config: MeshWarperConfig;

  public mesh: THREE.Mesh;
  public material: THREE.ShaderMaterial;
  public averageDimensions: { width: number; height: number };
  private planeGeometry: THREE.PlaneGeometry;
  private quadOutlineLine: Line2;
  private dragCornerControlPoints: THREE.Vector3[] = [];
  private dragGridControlPoints: THREE.Vector3[] = [];
  private referenceGridControlPoints: THREE.Vector3[] = [];

  private quadData!: {
    initialPositions: Float32Array;
    initalCorners: number[];
    currentPositions: Float32Array;
  };

  private dragControls!: DragControls;

  private cornerObjects: THREE.Mesh[] = [];
  private gridObjects: THREE.Mesh[] = [];

  private gridPointsEnabled: boolean = true;
  private cornerPointsEnabled: boolean = true;

  private xControlPointAmount: number;
  private yControlPointAmount: number;

  constructor(config: MeshWarperConfig) {
    this.config = config;
    this.xControlPointAmount = config.gridControlPoints.x;
    this.yControlPointAmount = config.gridControlPoints.y;

    this.planeGeometry = this.createPlaneGeometry();

    this.initializeQuadData();
    this.initializeControlPoints();
    this.material = this.createShaderMaterial();
    this.mesh = new THREE.Mesh(this.planeGeometry, this.material);

    this.quadOutlineLine = this.createOutline();

    // Load saved positions before drag controls
    this.loadFromStorage();

    this.initializeDragControls();
    this.addToScene();

    this.averageDimensions = this.getAverageDimensions();
  }

  private createShaderMaterial(): THREE.ShaderMaterial {
    const totalControlPoints = this.xControlPointAmount * this.yControlPointAmount;

    const warpUniforms = {
      uCorners: {
        value: this.dragCornerControlPoints,
      },
      uControlPoint: {
        value: null,
      },
      uControlPoints: {
        value: this.dragGridControlPoints,
      },
      uGridSizeX: {
        value: this.xControlPointAmount,
      },
      uGridSizeY: {
        value: this.yControlPointAmount,
      },
      uBuffer: {
        value: this.config.bufferTexture,
      },
    };

    const material = new THREE.ShaderMaterial({
      fragmentShader: this.config.fragmentShader,
      vertexShader: meshWarpVertexShader,
      defines: {
        CONTROL_POINT_AMOUNT: totalControlPoints,
        ...this.config.globalDefines,
      },
      uniforms: {
        ...this.config.globalUniforms,
        ...warpUniforms,
      },
    });

    material.side = THREE.DoubleSide;

    return material;
  }

  private createPlaneGeometry(): THREE.PlaneGeometry {
    return new THREE.PlaneGeometry(
      this.config.width,
      this.config.height,
      this.config.widthSegments,
      this.config.heightSegments,
    );
  }

  private initializeQuadData(): void {
    this.quadData = {
      initialPositions: new Float32Array(this.planeGeometry.attributes.position.array),
      initalCorners: this.getPlaneCornerCoordinates(this.planeGeometry),
      currentPositions: this.planeGeometry.attributes.position.array as Float32Array,
    };
  }

  private initializeControlPoints(): void {
    const { x: xControlPointAmount, y: yControlPointAmount } = this.config.gridControlPoints;

    const controlPointPlaneGeometry = new THREE.PlaneGeometry(
      this.config.width,
      this.config.height,
      xControlPointAmount - 1,
      yControlPointAmount - 1,
    );

    this.createGridControlPoints(controlPointPlaneGeometry, xControlPointAmount, yControlPointAmount);
    this.createCornerControlPoints();
  }

  private createGridControlPoints(controlGeometry: THREE.PlaneGeometry, xAmount: number, yAmount: number): void {
    const boxGeometry = new THREE.BoxGeometry();
    const gridControlPointPositions = controlGeometry.attributes.position.array;

    for (let i = 0; i < gridControlPointPositions.length / 3; i++) {
      const x = gridControlPointPositions[i * 3];
      const y = gridControlPointPositions[i * 3 + 1];

      const object = new THREE.Mesh(boxGeometry, new THREE.MeshBasicMaterial({ color: 'rgba(200, 200, 200, 1)' }));
      object.scale.setScalar(0.3);
      object.position.set(x, y, 0);
      object.userData.group = 'grid';

      this.gridObjects.push(object);
      this.dragGridControlPoints.push(object.position);
      this.referenceGridControlPoints.push(object.position.clone());
    }

    // Reorder to match vertex shader expectations
    this.dragGridControlPoints = this.reoderGridPointsToBottomLeftOrigin(this.dragGridControlPoints, xAmount, yAmount);

    this.referenceGridControlPoints = this.reoderGridPointsToBottomLeftOrigin(
      this.referenceGridControlPoints,
      xAmount,
      yAmount,
    );
  }

  private createCornerControlPoints(): void {
    const boxGeometry = new THREE.BoxGeometry();
    const quadCorners = this.quadData.initalCorners;

    for (let i = 0; i < 8; i += 2) {
      const x = quadCorners[i];
      const y = quadCorners[i + 1];

      const object = new THREE.Mesh(boxGeometry, new THREE.MeshBasicMaterial({ color: 'orange' }));
      object.scale.setScalar(0.4);
      object.position.set(x, y, 0);
      object.userData.group = 'corner';
      object.userData.lastValidPosition = object.position.clone();

      this.cornerObjects.push(object);
      this.dragCornerControlPoints.push(object.position);
    }
  }

  private createOutline(): Line2 {
    const outlineGeometry = new LineGeometry();
    outlineGeometry.setPositions([
      ...this.dragCornerControlPoints[0],
      ...this.dragCornerControlPoints[1],
      ...this.dragCornerControlPoints[3],
      ...this.dragCornerControlPoints[2],
      ...this.dragCornerControlPoints[0],
    ]);

    const lineMaterial = new LineMaterial({
      color: 'orange',
      linewidth: 4,
    });

    const line = new Line2(outlineGeometry, lineMaterial);
    line.position.setZ(-0.001);

    return line;
  }

  private initializeDragControls(): void {
    this.dragControls = new DragControls(
      [...this.cornerObjects, ...this.gridObjects],
      this.config.camera,
      this.config.renderer.domElement,
    );

    this.dragControls.addEventListener('drag', (event) => {
      this.handleDrag(event);
    });

    this.dragControls.addEventListener('dragend', () => {
      this.saveToStorage();
    });
  }

  private handleDrag(event: { object: THREE.Object3D<THREE.Object3DEventMap> }): void {
    const object = event.object;
    const pointGroupName = event.object.userData.group as string;
    const draggedPoint = event.object.position;
    const dragControlCorners = this.dragCornerControlPoints.flatMap((point) => [point.x, point.y]);

    // Check if quad is concave (degenerate)
    if (isQuadConcave(dragControlCorners)) {
      if (object.userData.lastValidPosition && pointGroupName === 'corner') {
        object.position.copy(object.userData.lastValidPosition);
      }
      return;
    }

    if (pointGroupName === 'corner') {
      object.userData.lastValidPosition.copy(object.position);
    }

    this.perspectiveTransformControlPoints(dragControlCorners, draggedPoint, pointGroupName);
    this.updateLine();

    this.averageDimensions = this.getAverageDimensions();
    (this.material.uniforms.uWarpPlaneSize.value as THREE.Vector2).setX(this.averageDimensions.width);
    (this.material.uniforms.uWarpPlaneSize.value as THREE.Vector2).setX(this.averageDimensions.height);
  }

  perspectiveTransformControlPoints(
    controlCorners: number[],
    draggedPoint: THREE.Vector3,
    pointGroupName: string,
  ): void {
    const perspectiveTransformer = new PerspT(this.quadData.initalCorners, controlCorners);

    if (pointGroupName === 'grid') {
      const currentGridPointIndex = this.dragGridControlPoints.indexOf(draggedPoint);
      const [xInverseTransformed, yInverseTransformed] = perspectiveTransformer.transformInverse(
        draggedPoint.x,
        draggedPoint.y,
      );
      this.referenceGridControlPoints[currentGridPointIndex].setX(xInverseTransformed);
      this.referenceGridControlPoints[currentGridPointIndex].setY(yInverseTransformed);
    }

    if (pointGroupName === 'corner') {
      for (let i = 0; i < this.referenceGridControlPoints.length; i++) {
        const intialControlPos = this.referenceGridControlPoints[i];
        const [warpedX, warpedY] = perspectiveTransformer.transform(intialControlPos.x, intialControlPos.y);
        this.dragGridControlPoints[i].set(warpedX, warpedY, intialControlPos.z);
      }
    }
  }

  private updateLine(): void {
    //@ts-ignore
    this.quadOutlineLine.geometry.setPositions([
      ...this.dragCornerControlPoints[0],
      ...this.dragCornerControlPoints[1],
      ...this.dragCornerControlPoints[3],
      ...this.dragCornerControlPoints[2],
      ...this.dragCornerControlPoints[0],
    ]);
  }

  private reoderGridPointsToBottomLeftOrigin(
    points: THREE.Vector3[],
    gridSizeX: number,
    gridSizeY: number,
  ): THREE.Vector3[] {
    const reordered: THREE.Vector3[] = [];
    for (let row = gridSizeY - 1; row >= 0; row--) {
      for (let col = 0; col < gridSizeX; col++) {
        const idx = row * gridSizeX + col;
        reordered.push(points[idx]);
      }
    }
    return reordered;
  }

  getPlaneCornerCoordinates(geometry: THREE.PlaneGeometry): number[] {
    const { widthSegments, heightSegments } = geometry.parameters;
    const positions = geometry.attributes.position.array as Float32Array;
    const verticesPerRow = widthSegments + 1;
    const rows = heightSegments + 1;

    const getIndex = (row: number, col: number) => (row * verticesPerRow + col) * 3;

    const topLeft = [positions[getIndex(0, 0)], positions[getIndex(0, 0) + 1]];
    const topRight = [positions[getIndex(0, verticesPerRow - 1)], positions[getIndex(0, verticesPerRow - 1) + 1]];
    const bottomLeft = [positions[getIndex(rows - 1, 0)], positions[getIndex(rows - 1, 0) + 1]];
    const bottomRight = [
      positions[getIndex(rows - 1, verticesPerRow - 1)],
      positions[getIndex(rows - 1, verticesPerRow - 1) + 1],
    ];

    return [
      topLeft[0],
      topLeft[1],
      topRight[0],
      topRight[1],
      bottomLeft[0],
      bottomLeft[1],
      bottomRight[0],
      bottomRight[1],
    ];
  }

  private getAverageDimensions(): { width: number; height: number } {
    const [tl, tr, bl, br] = this.dragCornerControlPoints;

    const topWidth = tl.distanceTo(tr);
    const bottomWidth = bl.distanceTo(br);
    const leftHeight = tl.distanceTo(bl);
    const rightHeight = tr.distanceTo(br);

    return {
      width: (topWidth + bottomWidth) / 2,
      height: (leftHeight + rightHeight) / 2,
    };
  }

  private clampGridControlPointsInsideQuad(
    pointGroupName: string,
    dragControlCorners: number[],
    event: { object: THREE.Object3D } & THREE.Event<'drag', DragControls>,
  ) {
    const perspectiveTransformer = new PerspT(this.quadData.initalCorners, dragControlCorners);

    // inverse to get "inital" posiiton
    const [localX, localY] = perspectiveTransformer.transformInverse(event.object.position.x, event.object.position.y);

    const bounds = this.getInitialBounds();
    const clampedLocalX = clamp(localX, bounds.minX, bounds.maxX);
    const clampedLocalY = clamp(localY, bounds.minY, bounds.maxY);
    const [worldX, worldY] = perspectiveTransformer.transform(clampedLocalX, clampedLocalY);

    //Force the visual object to the clamped position
    event.object.position.set(worldX, worldY, event.object.position.z);
  }

  // Helper to get the bounding box of the unwarped initial state
  private getInitialBounds() {
    const corners = this.quadData.initalCorners;
    // corners format: [TLx, TLy, TRx, TRy, BLx, BLy, BRx, BRy]

    // Since PlaneGeometry is axis-aligned initially:
    // Min X is usually Top-Left X, Max X is Top-Right X
    // Min Y is Bottom-Left Y, Max Y is Top-Left Y

    const minX = Math.min(corners[0], corners[2], corners[4], corners[6]);
    const maxX = Math.max(corners[0], corners[2], corners[4], corners[6]);
    const minY = Math.min(corners[1], corners[3], corners[5], corners[7]);
    const maxY = Math.max(corners[1], corners[3], corners[5], corners[7]);

    return { minX, maxX, minY, maxY };
  }

  private addToScene(): void {
    this.config.scene.add(this.mesh);
    this.config.scene.add(this.quadOutlineLine);
    this.cornerObjects.forEach((obj) => this.config.scene.add(obj));
    this.gridObjects.forEach((obj) => this.config.scene.add(obj));
  }

  public getCornerControlPoints(): THREE.Vector3[] {
    return this.dragCornerControlPoints;
  }

  public getGridControlPoints(): THREE.Vector3[] {
    return this.dragGridControlPoints;
  }

  public dispose(): void {
    this.planeGeometry.dispose();
    this.dragControls.dispose();
    this.config.scene.remove(this.mesh);
    this.config.scene.remove(this.quadOutlineLine);
    this.cornerObjects.forEach((obj) => this.config.scene.remove(obj));
    this.gridObjects.forEach((obj) => this.config.scene.remove(obj));
  }

  public setBufferTexture(texture: THREE.Texture): void {
    if (this.material.uniforms.uBuffer) {
      this.material.uniforms.uBuffer.value = texture;
    }
  }

  public getMaterial(): THREE.ShaderMaterial {
    return this.material;
  }

  // Visibility toggles for GUI
  public setGridPointsVisible(visible: boolean): void {
    this.gridObjects.forEach((obj) => {
      obj.visible = visible;
      // Disable raycasting when hidden
      if (visible) {
        obj.layers.enable(0);
      } else {
        obj.layers.disable(0);
      }
    });
    this.gridPointsEnabled = visible;
  }

  public setCornerPointsVisible(visible: boolean): void {
    this.cornerObjects.forEach((obj) => {
      obj.visible = visible;
      // Disable raycasting when hidden
      if (visible) {
        obj.layers.enable(0);
      } else {
        obj.layers.disable(0);
      }
    });
    this.cornerPointsEnabled = visible;
  }

  public setOutlineVisible(visible: boolean): void {
    this.quadOutlineLine.visible = visible;
  }

  public setAllControlsVisible(visible: boolean): void {
    this.setGridPointsVisible(visible);
    this.setCornerPointsVisible(visible);
    this.setOutlineVisible(visible);
  }

  // LocalStorage persistence
  private saveToStorage(): void {
    const data: StoredControlPoints = {
      corners: this.dragCornerControlPoints.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      grid: this.dragGridControlPoints.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      referenceGrid: this.referenceGridControlPoints.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save control points to localStorage:', e);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const data: StoredControlPoints = JSON.parse(stored);

      // Validate data matches current grid configuration
      if (
        data.corners.length !== this.dragCornerControlPoints.length ||
        data.grid.length !== this.dragGridControlPoints.length
      ) {
        console.warn('Stored control points do not match current configuration, ignoring');
        return;
      }

      // Apply stored positions
      data.corners.forEach((pos, i) => {
        this.dragCornerControlPoints[i].set(pos.x, pos.y, pos.z);
        this.cornerObjects[i].position.set(pos.x, pos.y, pos.z);
        this.cornerObjects[i].userData.lastValidPosition = this.cornerObjects[i].position.clone();
      });

      data.grid.forEach((pos, i) => {
        this.dragGridControlPoints[i].set(pos.x, pos.y, pos.z);
      });

      data.referenceGrid.forEach((pos, i) => {
        this.referenceGridControlPoints[i].set(pos.x, pos.y, pos.z);
      });

      // Update grid objects positions (they reference dragGridControlPoints but order may differ)
      this.gridObjects.forEach((obj) => {
        const idx = this.dragGridControlPoints.findIndex((p) => p === obj.position);
        if (idx !== -1) {
          // Position is already a reference, just need to sync visual
        }
      });

      // Update visuals
      this.updateLine();
      this.averageDimensions = this.getAverageDimensions();

      console.log('Loaded control points from localStorage');
    } catch (e) {
      console.warn('Failed to load control points from localStorage:', e);
    }
  }

  public resetToDefault(): void {
    localStorage.removeItem(STORAGE_KEY);
    console.log('Control points reset - reload page to apply');
  }

  // Grid size getters
  public getGridSizeX(): number {
    return this.xControlPointAmount;
  }

  public getGridSizeY(): number {
    return this.yControlPointAmount;
  }

  // Dynamic grid resizing
  public setGridSize(x: number, y: number): void {
    x = Math.max(2, Math.min(10, Math.floor(x)));
    y = Math.max(2, Math.min(10, Math.floor(y)));

    if (x === this.xControlPointAmount && y === this.yControlPointAmount) {
      return;
    }

    // Store current corner positions to preserve warp
    const cornerPositions = this.dragCornerControlPoints.map((p) => p.clone());

    // Remove old grid objects from scene
    this.gridObjects.forEach((obj) => {
      this.config.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material instanceof THREE.Material) obj.material.dispose();
    });

    // Dispose old drag controls
    this.dragControls.dispose();

    // Clear arrays
    this.gridObjects = [];
    this.dragGridControlPoints = [];
    this.referenceGridControlPoints = [];

    // Update amounts
    this.xControlPointAmount = x;
    this.yControlPointAmount = y;
    this.config.gridControlPoints.x = x;
    this.config.gridControlPoints.y = y;

    // Create new control point geometry
    const controlPointPlaneGeometry = new THREE.PlaneGeometry(this.config.width, this.config.height, x - 1, y - 1);

    // Create new grid control points
    this.createGridControlPoints(controlPointPlaneGeometry, x, y);
    controlPointPlaneGeometry.dispose();

    // Add new grid objects to scene
    this.gridObjects.forEach((obj) => this.config.scene.add(obj));

    // Apply visibility state
    if (!this.gridPointsEnabled) {
      this.gridObjects.forEach((obj) => {
        obj.visible = false;
        obj.layers.disable(0);
      });
    }

    // Transform grid points to match current corner warp
    const dragControlCorners = cornerPositions.flatMap((point) => [point.x, point.y]);
    const perspectiveTransformer = new PerspT(this.quadData.initalCorners, dragControlCorners);

    for (let i = 0; i < this.referenceGridControlPoints.length; i++) {
      const refPos = this.referenceGridControlPoints[i];
      const [warpedX, warpedY] = perspectiveTransformer.transform(refPos.x, refPos.y);
      this.dragGridControlPoints[i].set(warpedX, warpedY, refPos.z);
    }

    // Reinitialize drag controls
    this.initializeDragControls();

    // Update shader defines and uniforms
    const totalControlPoints = x * y;
    this.material.defines.CONTROL_POINT_AMOUNT = totalControlPoints;
    this.material.uniforms.uControlPoints.value = this.dragGridControlPoints;
    this.material.uniforms.uGridSizeX.value = x;
    this.material.uniforms.uGridSizeY.value = y;
    this.material.needsUpdate = true;

    // Clear stored positions since grid changed
    localStorage.removeItem(STORAGE_KEY);

    console.log(`Grid resized to ${x}x${y}`);
  }
}
