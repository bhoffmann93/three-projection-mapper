/*
MeshWarper
-----------
This class manages interactive warping of a plane mesh using draggable grid and corner control points.
Conceptually, imagine a regular (reference) grid in the background: this is the reference grid. When you move the visible control points, you are warping this grid into a new shape via a perspective (homography) transform.
Dragging a grid point updates its position in the warped (output) space, but to keep the mapping consistent, we use the inverse transform to update its corresponding position in the reference (input) grid. 
The Control points live in world space.
The warped grid control points are passed to the vertex shader for bilinear or bicubic interpolation, enabling flexible projection mapping and perspective correction.
4 Corner Points (world space) → Homography → Grid Control Points (world space) → Vertex Shader
interpolates vertex positions between grid points → flat UVs passed through unchanged → Fragment Shader
receives original flat UV (they are baked into mesh geometry and passed from the displaced vertex)
*/

import * as THREE from 'three';
import { Expand } from 'lucide';
import { DragControls } from 'three/examples/jsm/controls/DragControls.js';
//@ts-ignore
import { Line2 } from 'three/addons/lines/Line2.js';
//@ts-ignore
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
//@ts-ignore
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import PerspT from '../utils/perspective';
import { isQuadConcave, isPointInQuad, scaleQuadAboutCenter } from './geometry';
import { clamp } from '../utils/math';
import { createIconBadgeTexture, BADGE_FILL } from '../utils/iconTexture';
import { RenderOrder } from '../core/RenderOrder';
import { MESH_WARP_GRID_SIZE, WARP_HANDLE_STYLE } from '../core/defaults';
import { WarpMaterial, WARP_MODE } from './WarpMaterial';
import { WarpPointStore, toNormalized, fromNormalized } from './WarpPointStore';
import type { NormalizedPosition, PlaneSize } from './WarpPointStore';
import type { UvRect, ImageSettings, Resolution } from '../core/defaults';

/** How a surface's outline is drawn: selected, under the cursor, or neither */
export { WARP_MODE };

export type OutlineState = 'active' | 'inactive' | 'hover';

/**
 * Which set a control point belongs to, kept on its object's userData. The three
 * behave differently under a drag: corners drive the homography, grid points are
 * pushed through it, and the scale handle is not a position at all.
 */
export const HANDLE_GROUP = {
  corner: 'corner',
  grid: 'grid',
  scale: 'scale',
} as const satisfies Record<string, string>;

export type HandleGroup = (typeof HANDLE_GROUP)[keyof typeof HANDLE_GROUP];

/**
 * Corner handles are created in the order the homography expects
 * (TL, TR, BL, BR), which is not the order they sit in on screen. Tab walks them
 * the way they are drawn instead, so the selection moves around the quad.
 */
const CORNER_TAB_ORDER = [0, 1, 3, 2] as const;

/** Labels the off-screen markers show, in corner creation order */
const CORNER_LABELS = ['TL', 'TR', 'BL', 'BR'] as const;

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
  /** This surface's own pixel resolution; width/height above are its world-space plane */
  resolution: Resolution;
  /** Image adjustments are per surface — each warper owns its own uniforms */
  imageSettings?: ImageSettings;
  /** Suffixes the localStorage key so multiple warpers persist independently */
  storageNamespace?: string;
}

export class MeshWarper {
  private config: MeshWarperConfig;

  public mesh: THREE.Mesh;
  private warpMaterial!: WarpMaterial;
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
  private scaleObject!: THREE.Mesh;
  private gridObjects: THREE.Mesh[] = [];

  private gridPointsEnabled: boolean = true;
  private cornerPointsEnabled: boolean = true;
  /** Off where resizing the surface is not a thing the user is allowed to do */
  private scaleHandleEnabled: boolean = true;

  /** The handle the arrow keys move, if any. Set by clicking one, or by Tab. */
  private selectedHandle: THREE.Mesh | null = null;

  private xControlPointAmount: number;
  private yControlPointAmount: number;

  private store: WarpPointStore;

  static storageKeyFor(storageNamespace?: string): string {
    return WarpPointStore.keyFor(storageNamespace);
  }

  /** Grid size persisted with a warper's control points, if any */
  static getStoredGridSize(storageNamespace?: string): { x: number; y: number } | null {
    return WarpPointStore.readGridSize(storageNamespace);
  }

  constructor(config: MeshWarperConfig) {
    this.config = config;
    this.store = new WarpPointStore(config.storageNamespace);
    this.xControlPointAmount = config.gridControlPoints.x;
    this.yControlPointAmount = config.gridControlPoints.y;

    this.planeGeometry = this.createPlaneGeometry();

    this.initializeQuadData();
    this.initializeControlPoints();
    this.warpMaterial = this.createMaterial();
    this.mesh = new THREE.Mesh(this.planeGeometry, this.material);

    this.quadOutlineLine = this.createOutline();

    // Load saved positions before drag controls
    this.loadFromStorage();

    this.initializeDragControls();
    this.addToScene();

    this.averageDimensions = this.getAverageDimensions();
  }

  private createMaterial(): WarpMaterial {
    return new WarpMaterial({
      planeSize: this.plane(),
      resolution: this.config.resolution,
      gridControlPoints: this.config.gridControlPoints,
      cornerPoints: this.dragCornerControlPoints,
      gridPoints: this.dragGridControlPoints,
      fragmentShader: this.config.fragmentShader,
      globalUniforms: this.config.globalUniforms,
      globalDefines: this.config.globalDefines,
      bufferTexture: this.config.bufferTexture,
      imageSettings: this.config.imageSettings,
    });
  }

  /** The material this surface draws with, for callers that need the raw object */
  public get material(): THREE.ShaderMaterial {
    return this.warpMaterial.material;
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
    this.createScaleControlPoint();
  }

  private createGridControlPoints(controlGeometry: THREE.PlaneGeometry, xAmount: number, yAmount: number): void {
    const boxGeometry = new THREE.BoxGeometry();
    const gridControlPointPositions = controlGeometry.attributes.position.array;

    for (let i = 0; i < gridControlPointPositions.length / 3; i++) {
      const x = gridControlPointPositions[i * 3];
      const y = gridControlPointPositions[i * 3 + 1];

      const object = new THREE.Mesh(
        boxGeometry,
        new THREE.MeshBasicMaterial({ color: WARP_HANDLE_STYLE.cornerColor, transparent: true, opacity: 0.9 }),
      );
      object.position.set(x, y, 0);
      object.renderOrder = RenderOrder.CONTROLS;
      object.userData.group = HANDLE_GROUP.grid;
      // Kept so selecting a handle can recolour it and deselecting can put it back
      object.userData.baseColor = WARP_HANDLE_STYLE.cornerColor;
      // Unnumbered: a grid index means nothing to anyone, and off-screen grid
      // points arrive in clumps where only "one is out there" is worth saying
      object.userData.label = '•';

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

  /**
   * A single handle on the top edge that resizes the surface about its centre,
   * keeping the warp. Distinct hue because it is a different verb from the corner
   * handles it sits between — those reshape, this one scales.
   */
  private createScaleControlPoint(): void {
    this.scaleObject = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: createIconBadgeTexture(Expand, {
          color: WARP_HANDLE_STYLE.scaleColor,
          strokeWidth: WARP_HANDLE_STYLE.scaleIconStrokeWidth,
          sizePixels: WARP_HANDLE_STYLE.scaleIconTexturePixels,
        }),
        transparent: true,
        color: 0xffffff, // the badge carries its own colours
        depthTest: false,
      }),
    );
    this.scaleObject.renderOrder = RenderOrder.CONTROLS_BADGE;
    this.scaleObject.userData.group = HANDLE_GROUP.scale;
    this.scaleObject.userData.baseColor = 0xffffff;
    this.positionScaleControlPoint();
  }

  /** Midpoint of the top edge, so it follows the quad however it is warped */
  private positionScaleControlPoint(): void {
    if (!this.scaleObject) return;
    const [topLeft, topRight] = this.dragCornerControlPoints;
    this.scaleObject.position.set((topLeft.x + topRight.x) / 2, (topLeft.y + topRight.y) / 2, 0);
  }

  private createCornerControlPoints(): void {
    const boxGeometry = new THREE.BoxGeometry();
    const quadCorners = this.quadData.initalCorners;

    for (let i = 0; i < 8; i += 2) {
      const x = quadCorners[i];
      const y = quadCorners[i + 1];

      const object = new THREE.Mesh(
        boxGeometry,
        new THREE.MeshBasicMaterial({ color: WARP_HANDLE_STYLE.gridColor, transparent: true, opacity: 0.8 }),
      );
      object.position.set(x, y, 0);
      object.renderOrder = RenderOrder.CONTROLS;
      object.userData.group = HANDLE_GROUP.corner;
      object.userData.baseColor = WARP_HANDLE_STYLE.gridColor;
      object.userData.label = CORNER_LABELS[i / 2];
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
      color: WARP_HANDLE_STYLE.outlineColor,
      linewidth: WARP_HANDLE_STYLE.outlineLineWidth,
      transparent: true,
    });

    const line = new Line2(outlineGeometry, lineMaterial);
    line.renderOrder = RenderOrder.CONTROLS;

    return line;
  }

  private initializeDragControls(): void {
    this.dragControls = new DragControls(
      [...this.cornerObjects, ...this.gridObjects, this.scaleObject],
      this.config.camera,
      this.config.renderer.domElement,
    );

    // Starting a drag also arms the keyboard on that handle: the gesture that
    // grabs a point is the one that selects it, so there is no separate mode to
    // enter before the arrow keys do anything.
    this.dragControls.addEventListener('dragstart', (event) => {
      this.setSelectedHandle(event.object as THREE.Mesh);
    });

    this.dragControls.addEventListener('drag', (event) => {
      this.handleDrag(event);
    });

    this.dragControls.addEventListener('dragend', () => {
      this.saveToStorage();
    });
  }

  private handleDrag(event: { object: THREE.Object3D<THREE.Object3DEventMap> }): void {
    const object = event.object;
    const pointGroupName = event.object.userData.group as HandleGroup;

    if (pointGroupName === HANDLE_GROUP.scale) {
      this.handleScaleDrag(object.position);
      return;
    }

    const draggedPoint = event.object.position;
    const dragControlCorners = this.dragCornerControlPoints.flatMap((point) => [point.x, point.y]);

    if (isQuadConcave(dragControlCorners)) {
      if (object.userData.lastValidPosition && pointGroupName === HANDLE_GROUP.corner) {
        object.position.copy(object.userData.lastValidPosition);
      }
      return;
    }

    if (pointGroupName === HANDLE_GROUP.corner) {
      object.userData.lastValidPosition.copy(object.position);
    }

    this.perspectiveTransformControlPoints(dragControlCorners, draggedPoint, pointGroupName);
    this.updateLine();

    this.averageDimensions = this.getAverageDimensions();
    this.warpMaterial.setWarpPlaneSize(this.averageDimensions.width, this.averageDimensions.height);
  }

  /**
   * Turn the handle's distance from the centre into a scale factor. Applied
   * incrementally, because the handle snaps back to the resized quad's top edge
   * after each event — so the next event measures against the new size.
   */
  private handleScaleDrag(draggedPosition: THREE.Vector3): void {
    const center = this.getCenter();
    const [topLeft, topRight] = this.dragCornerControlPoints;
    const currentDistance = Math.hypot(
      (topLeft.x + topRight.x) / 2 - center.x,
      (topLeft.y + topRight.y) / 2 - center.y,
    );

    // Only how far the pointer is from the centre matters, never where it is:
    // the handle belongs on the top edge and is put back there below, whatever
    // DragControls did to it on the way in.
    if (currentDistance > 0) {
      const draggedDistance = Math.hypot(draggedPosition.x - center.x, draggedPosition.y - center.y);
      const limit = WARP_HANDLE_STYLE.scaleFactorLimit;
      const factor = clamp(draggedDistance / currentDistance, 1 / limit, limit);
      this.applyScale(factor, factor, false); // dragend persists, as for every other handle
    }

    // Unconditional: DragControls writes the position on every pointer move, so a
    // path that scaled by nothing would otherwise leave the handle where it was dropped
    this.positionScaleControlPoint();
  }

  perspectiveTransformControlPoints(
    controlCorners: number[],
    draggedPoint: THREE.Vector3,
    pointGroupName: HandleGroup,
  ): void {
    const perspectiveTransformer = new PerspT(this.quadData.initalCorners, controlCorners);

    if (pointGroupName === HANDLE_GROUP.grid) {
      const currentGridPointIndex = this.dragGridControlPoints.indexOf(draggedPoint);
      const [xInverseTransformed, yInverseTransformed] = perspectiveTransformer.transformInverse(
        draggedPoint.x,
        draggedPoint.y,
      );
      this.referenceGridControlPoints[currentGridPointIndex].setX(xInverseTransformed);
      this.referenceGridControlPoints[currentGridPointIndex].setY(yInverseTransformed);
    }

    if (pointGroupName === HANDLE_GROUP.corner) {
      for (let i = 0; i < this.referenceGridControlPoints.length; i++) {
        const intialControlPos = this.referenceGridControlPoints[i];
        const [warpedX, warpedY] = perspectiveTransformer.transform(intialControlPos.x, intialControlPos.y);
        this.dragGridControlPoints[i].set(warpedX, warpedY, intialControlPos.z);
      }
    }
  }

  private updateLine(): void {
    this.positionScaleControlPoint();
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
    this.config.scene.add(this.scaleObject);
  }

  public getCornerControlPoints(): THREE.Vector3[] {
    return this.dragCornerControlPoints;
  }

  public getGridControlPoints(): THREE.Vector3[] {
    return this.dragGridControlPoints;
  }

  /**
   * The undeformed grid the warp is derived from. Multi-window sync has to send
   * it alongside the warped points, or the receiver cannot reproduce a later
   * corner drag.
   */
  public getReferenceGridControlPoints(): THREE.Vector3[] {
    return this.referenceGridControlPoints;
  }

  /** Flat plane size in world units, the space control points are normalised against */
  public getPlaneSize(): { width: number; height: number } {
    return { width: this.config.width, height: this.config.height };
  }

  /** Redraw the outline after control points were moved from outside, as sync does */
  public refreshOutline(): void {
    this.updateLine();
  }

  /** Control point position as a 0-1 fraction of the plane, for storage and sync */
  public toNormalizedPoint(point: THREE.Vector3): NormalizedPosition {
    return toNormalized(point, this.plane());
  }

  public fromNormalizedPoint(normalized: NormalizedPosition): THREE.Vector3 {
    const position = fromNormalized(normalized, this.plane());
    return new THREE.Vector3(position.x, position.y, position.z);
  }

  public applyPerspectiveTransform(x: number, y: number): THREE.Vector2 {
    const currentCorners = this.dragCornerControlPoints.flatMap((p) => [p.x, p.y]);
    const [wx, wy] = new PerspT(this.quadData.initalCorners, currentCorners).transform(x, y);
    return new THREE.Vector2(wx, wy);
  }

  public applyInversePerspectiveTransform(x: number, y: number): THREE.Vector2 {
    const currentCorners = this.dragCornerControlPoints.flatMap((p) => [p.x, p.y]);
    const [wx, wy] = new PerspT(this.quadData.initalCorners, currentCorners).transformInverse(x, y);
    return new THREE.Vector2(wx, wy);
  }

  // Returns the 9 homography coefficients for the current perspective warp.
  // Used to apply the identical projective transform on the GPU vertex shader,
  public getPerspectiveCoeffs(): number[] {
    const currentCorners = this.dragCornerControlPoints.flatMap((p) => [p.x, p.y]);
    return new PerspT(this.quadData.initalCorners, currentCorners).coeffs;
  }

  public dispose(): void {
    this.planeGeometry.dispose();
    this.warpMaterial.dispose(); // never happened before the material had an owner
    this.dragControls.dispose();
    this.config.scene.remove(this.mesh);
    this.config.scene.remove(this.quadOutlineLine);
    this.cornerObjects.forEach((obj) => this.config.scene.remove(obj));
    this.gridObjects.forEach((obj) => this.config.scene.remove(obj));
    this.config.scene.remove(this.scaleObject);
  }

  public getBufferTexture(): THREE.Texture {
    return this.warpMaterial.getBufferTexture();
  }

  public setBufferTexture(texture: THREE.Texture): void {
    this.warpMaterial.setBufferTexture(texture);
  }

  public setWarpMode(mode: WARP_MODE): void {
    this.warpMaterial.setWarpMode(mode);
  }

  public getWarpMode(): WARP_MODE {
    return this.warpMaterial.getWarpMode();
  }

  public setShouldWarp(enabled: boolean): void {
    this.warpMaterial.setShouldWarp(enabled);
  }

  public getShouldWarp(): boolean {
    return this.warpMaterial.getShouldWarp();
  }

  public getMaterial(): THREE.ShaderMaterial {
    return this.material;
  }

  public updateControlPointsScale(screenScale: number): void {
    const cornerCubeSize = screenScale * WARP_HANDLE_STYLE.cornerPointPixelRadius;
    const gridControlCubeSize = screenScale * WARP_HANDLE_STYLE.gridPointPixelRadius;

    this.cornerObjects.forEach((obj) => obj.scale.setScalar(cornerCubeSize));
    this.gridObjects.forEach((obj) => obj.scale.setScalar(gridControlCubeSize));
    // Divided by the fill, so the badge itself is the stated size
    this.scaleObject.scale.setScalar((screenScale * WARP_HANDLE_STYLE.scalePointPixelRadius) / BADGE_FILL);

    // Applied after the uniform sizing, which runs every frame and would
    // otherwise flatten it back. Size is what makes the selection readable on a
    // bright test card, where the colour alone barely shows.
    this.selectedHandle?.scale.multiplyScalar(WARP_HANDLE_STYLE.selectedScale);
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
    // The scale handle belongs to the same set: both act on the quad as a whole
    this.applyScaleHandleVisibility(visible && this.scaleHandleEnabled);

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

  /**
   * Whether the surface can be resized by its handle at all. Driven by the
   * mapper's `surfaceScale` capability, which is where the reasoning lives.
   * ANDed with the corner points, so an inactive surface shows no handle.
   */
  public setScaleHandleEnabled(enabled: boolean): void {
    this.scaleHandleEnabled = enabled;
    this.applyScaleHandleVisibility(enabled && this.cornerPointsEnabled);
  }

  /** Hidden handles also leave the raycast layer, so they cannot be grabbed */
  private applyScaleHandleVisibility(visible: boolean): void {
    this.scaleObject.visible = visible;
    if (visible) this.scaleObject.layers.enable(0);
    else this.scaleObject.layers.disable(0);
  }

  public setOutlineVisible(visible: boolean): void {
    this.quadOutlineLine.visible = visible;
  }

  /**
   * Restyle the outline for the surface's selection state. Inactive surfaces
   * stay visible but dimmed so they can still be clicked to select.
   */
  public setOutlineState(state: OutlineState): void {
    const material = this.quadOutlineLine.material as {
      color: THREE.Color;
      opacity: number;
      linewidth: number;
    };

    if (state === 'active') {
      material.color.set(WARP_HANDLE_STYLE.outlineColor);
      material.opacity = 1.0;
      material.linewidth = WARP_HANDLE_STYLE.outlineLineWidth;
    } else if (state === 'hover') {
      material.color.set(WARP_HANDLE_STYLE.hoverOutlineColor);
      material.opacity = WARP_HANDLE_STYLE.hoverOutlineOpacity;
      material.linewidth = WARP_HANDLE_STYLE.outlineLineWidth;
    } else {
      material.color.set(WARP_HANDLE_STYLE.inactiveOutlineColor);
      material.opacity = WARP_HANDLE_STYLE.inactiveOutlineOpacity;
      material.linewidth = WARP_HANDLE_STYLE.inactiveOutlineLineWidth;
    }
  }

  // --- handle selection and keyboard nudging --------------------------------
  // A corner sometimes has to end up outside the window, and dragging cannot put
  // it there: the pointer runs out of screen first, and when the controller *is*
  // the output there is no zooming out to make room. Selecting a handle and
  // walking it with the arrow keys is the way past the edge.

  /**
   * Arm a handle for the keyboard. The scale handle is not selectable — it takes
   * a distance from the centre rather than a position, so nudging it by a delta
   * would mean something different from every other handle.
   */
  public setSelectedHandle(handle: THREE.Mesh | null): void {
    if (handle && handle.userData.group === HANDLE_GROUP.scale) return;
    if (this.selectedHandle === handle) return;

    this.applySelectionColor(this.selectedHandle, false);
    this.selectedHandle = handle;
    this.applySelectionColor(handle, true);
  }

  public getSelectedHandle(): THREE.Mesh | null {
    return this.selectedHandle;
  }

  public clearSelectedHandle(): void {
    this.setSelectedHandle(null);
  }

  private applySelectionColor(handle: THREE.Mesh | null, selected: boolean): void {
    if (!handle) return;
    const material = handle.material as THREE.MeshBasicMaterial;
    material.color.set(selected ? WARP_HANDLE_STYLE.selectedColor : handle.userData.baseColor);
  }

  /**
   * Step the selection through the handles with Tab, in the order they are drawn.
   *
   * Stays inside the group the current selection belongs to, so tabbing along a
   * grid never jumps out to a corner; with nothing selected it starts at the
   * corners, which is what a fresh calibration wants.
   */
  public selectNextHandle(step: number): boolean {
    const handles = this.tabOrder();
    if (!handles.length) return false;

    const current = this.selectedHandle ? handles.indexOf(this.selectedHandle) : -1;
    const next =
      current === -1
        ? step > 0
          ? 0
          : handles.length - 1
        : (current + step + handles.length) % handles.length;

    this.setSelectedHandle(handles[next]);
    return true;
  }

  private tabOrder(): THREE.Mesh[] {
    const corners = CORNER_TAB_ORDER.map((i) => this.cornerObjects[i]).filter((obj) => obj?.visible);
    const grid = this.gridObjects.filter((obj) => obj.visible);

    if (this.selectedHandle?.userData.group === HANDLE_GROUP.grid) return grid;
    return corners.length ? corners : grid;
  }

  /**
   * Move the selected handle by a world-space delta.
   *
   * Routed through the same handler a pointer drag uses, so the concavity guard,
   * the homography re-solve and the outline redraw all apply exactly as they do
   * to a drag — including silently refusing a step that would fold the quad.
   * Nothing is persisted here; commitHandlePositions does that once the keys are
   * released, the way dragend does after a drag.
   */
  public nudgeSelectedHandle(dx: number, dy: number): boolean {
    const handle = this.selectedHandle;
    if (!handle || !handle.visible || !this.dragControls.enabled) return false;

    handle.position.x += dx;
    handle.position.y += dy;
    this.handleDrag({ object: handle });
    return true;
  }

  /** Persist after a burst of nudges, as dragend does after a drag */
  public commitHandlePositions(): void {
    this.saveToStorage();
  }

  /** Corner handles in creation order: TL, TR, BL, BR */
  public getCornerObjects(): THREE.Mesh[] {
    return this.cornerObjects;
  }

  /** Grid handles. Their positions are the same refs as getGridControlPoints. */
  public getGridControlObjects(): THREE.Mesh[] {
    return this.gridObjects;
  }

  /** Visible drag handles — raycast these before the body so handles win */
  public getHandleObjects(): THREE.Mesh[] {
    return [...this.cornerObjects, ...this.gridObjects, this.scaleObject].filter((obj) => obj.visible);
  }

  /**
   * Is this world-space point inside the surface as drawn?
   *
   * The mesh cannot be raycast for this: warp.vert displaces the vertices on the
   * GPU, so mesh.geometry stays an un-warped plane at the origin — identical for
   * every surface. The corner control points are the real world-space quad, and
   * they are what the outline is drawn from, so hit-testing them matches what
   * the user sees. Concave drags are rejected on drag, so the quad is convex and
   * a consistent-sign edge test is valid.
   */
  public containsPoint(x: number, y: number): boolean {
    const [tl, tr, bl, br] = this.dragCornerControlPoints;
    return isPointInQuad([tl, tr, br, bl], x, y); // wound as updateLine draws it
  }

  public setAllControlsVisible(visible: boolean): void {
    this.setGridPointsVisible(visible);
    this.setCornerPointsVisible(visible);
    this.setOutlineVisible(visible);
  }

  /**
   * Enable or disable drag controls completely.
   * When disabled, points cannot be dragged even if visible.
   * Use this for projector windows that should be receive-only.
   */
  public setDragEnabled(enabled: boolean): void {
    if (this.dragControls) {
      this.dragControls.enabled = enabled;
    }
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
    x = Math.max(MESH_WARP_GRID_SIZE.minimum, Math.min(MESH_WARP_GRID_SIZE.maximum, Math.floor(x)));
    y = Math.max(MESH_WARP_GRID_SIZE.minimum, Math.min(MESH_WARP_GRID_SIZE.maximum, Math.floor(y)));

    if (x === this.xControlPointAmount && y === this.yControlPointAmount) {
      return;
    }

    // Store current corner positions to preserve warp
    const cornerPositions = this.dragCornerControlPoints.map((p) => p.clone());

    // The grid handles below are about to be disposed, and a selected one would
    // leave the keyboard pointing at an object no longer in the scene
    this.clearSelectedHandle();

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

    const controlPointPlaneGeometry = new THREE.PlaneGeometry(this.config.width, this.config.height, x - 1, y - 1);
    this.createGridControlPoints(controlPointPlaneGeometry, x, y);
    controlPointPlaneGeometry.dispose();
    this.gridObjects.forEach((obj) => this.config.scene.add(obj));

    if (!this.gridPointsEnabled) {
      this.gridObjects.forEach((obj) => {
        obj.visible = false;
        obj.layers.disable(0);
      });
    }

    const dragControlCorners = cornerPositions.flatMap((point) => [point.x, point.y]);
    const perspectiveTransformer = new PerspT(this.quadData.initalCorners, dragControlCorners);

    for (let i = 0; i < this.referenceGridControlPoints.length; i++) {
      const refPos = this.referenceGridControlPoints[i];
      const [warpedX, warpedY] = perspectiveTransformer.transform(refPos.x, refPos.y);
      this.dragGridControlPoints[i].set(warpedX, warpedY, refPos.z);
    }

    this.initializeDragControls();

    this.warpMaterial.setGrid(this.dragGridControlPoints, x, y);

    this.saveToStorage();

    console.log(`Grid resized to ${x}x${y}`);
  }

  /** The plane this warper's points are fractions of */
  private plane(): PlaneSize {
    return { width: this.config.width, height: this.config.height };
  }

  private saveToStorage(): void {
    const plane = this.plane();
    this.store.write({
      gridSize: { x: this.xControlPointAmount, y: this.yControlPointAmount },
      planeSize: plane,
      corners: this.dragCornerControlPoints.map((p) => toNormalized(p, plane)),
      grid: this.dragGridControlPoints.map((p) => toNormalized(p, plane)),
      referenceGrid: this.referenceGridControlPoints.map((p) => toNormalized(p, plane)),
    });
  }

  private loadFromStorage(): void {
    const data = this.store.read();
    if (!data) return;

    // Denormalise against the plane the points were measured on, not today's, so
    // a surface that changed shape keeps its corners where they were in world space
    const savedPlane = data.planeSize ?? this.plane();
    const restore = (position: NormalizedPosition) => fromNormalized(position, savedPlane);

    // Always load corners if valid (always 4)
    if (data.corners && data.corners.length === 4) {
      data.corners.forEach((normalized, i) => {
        const position = restore(normalized);
        this.dragCornerControlPoints[i].set(position.x, position.y, position.z);
        this.cornerObjects[i].position.set(position.x, position.y, position.z);
        this.cornerObjects[i].userData.lastValidPosition = this.cornerObjects[i].position.clone();
      });
    }

    // Validate grid dimensions using stored gridSize metadata
    const expectedCount = this.xControlPointAmount * this.yControlPointAmount;
    const gridSizeMatches =
      data.gridSize?.x === this.xControlPointAmount && data.gridSize?.y === this.yControlPointAmount;

    if (gridSizeMatches && data.grid.length === expectedCount && data.referenceGrid?.length === expectedCount) {
      data.grid.forEach((normalized, i) => {
        const position = restore(normalized);
        this.dragGridControlPoints[i].set(position.x, position.y, position.z);
      });
      data.referenceGrid.forEach((normalized, i) => {
        const position = restore(normalized);
        this.referenceGridControlPoints[i].set(position.x, position.y, position.z);
      });
    } else {
      // Grid size changed: recompute grid positions from loaded corners
      const corners = this.dragCornerControlPoints.flatMap((p) => [p.x, p.y]);
      this.perspectiveTransformControlPoints(corners, new THREE.Vector3(), HANDLE_GROUP.corner);
    }

    this.updateLine();
    this.averageDimensions = this.getAverageDimensions();
    this.warpMaterial.setWarpPlaneSize(this.averageDimensions.width, this.averageDimensions.height);
  }

  /**
   * Reset the warp to a flat default rectangle. Position and warp share the
   * corner points, so by default the surface's centroid is preserved —
   * reset clears the deformation, not the placement.
   */
  public resetToDefault(keepPosition: boolean = true): void {
    const center = this.getCenter();

    // Reset corners — dragCornerControlPoints[i] IS cornerObjects[i].position (same ref)
    for (let i = 0; i < 4; i++) {
      const x = this.quadData.initalCorners[i * 2];
      const y = this.quadData.initalCorners[i * 2 + 1];
      this.dragCornerControlPoints[i].set(x, y, 0);
      this.cornerObjects[i].userData.lastValidPosition?.set(x, y, 0);
    }

    // Rebuild initial grid positions from a fresh PlaneGeometry (matches constructor)
    const geom = new THREE.PlaneGeometry(
      this.config.width,
      this.config.height,
      this.xControlPointAmount - 1,
      this.yControlPointAmount - 1,
    );
    const pos = geom.attributes.position.array as Float32Array;
    const initialGridPositions = this.reoderGridPointsToBottomLeftOrigin(
      Array.from({ length: pos.length / 3 }, (_, i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], 0)),
      this.xControlPointAmount,
      this.yControlPointAmount,
    );
    geom.dispose();

    // dragGridControlPoints[i] IS the scene object's position (same ref), so this moves visuals too
    for (let i = 0; i < this.referenceGridControlPoints.length; i++) {
      this.referenceGridControlPoints[i].copy(initialGridPositions[i]);
      this.dragGridControlPoints[i].copy(initialGridPositions[i]);
    }

    this.updateLine();
    this.averageDimensions = this.getAverageDimensions();
    this.warpMaterial.setWarpPlaneSize(this.averageDimensions.width, this.averageDimensions.height);

    if (keepPosition && (center.x !== 0 || center.y !== 0)) {
      this.translate(center.x, center.y); // also saves to storage
    } else {
      this.store.clear();
    }
  }

  public clearStorage(): void {
    this.store.clear();
  }

  /** Centroid of the 4 corner points in world space */
  public getCenter(): { x: number; y: number } {
    const [tl, tr, bl, br] = this.dragCornerControlPoints;
    return { x: (tl.x + tr.x + bl.x + br.x) / 4, y: (tl.y + tr.y + bl.y + br.y) / 4 };
  }

  /**
   * Place the surface as an axis-aligned rectangle in world space.
   *
   * This is a layout operation, not a nudge: it replaces the corner quad, so any
   * perspective already dialled in is discarded. Use it to arrange surfaces
   * inside the output canvas before calibrating, not after.
   */
  public setBounds(centerX: number, centerY: number, width: number, height: number): void {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const corners = [
      [centerX - halfWidth, centerY + halfHeight], // top left
      [centerX + halfWidth, centerY + halfHeight], // top right
      [centerX - halfWidth, centerY - halfHeight], // bottom left
      [centerX + halfWidth, centerY - halfHeight], // bottom right
    ];

    corners.forEach(([x, y], i) => {
      this.dragCornerControlPoints[i].set(x, y, 0);
      this.cornerObjects[i].userData.lastValidPosition?.set(x, y, 0);
    });

    // Re-derive the grid from the new corners, as a corner drag would
    const flatCorners = this.dragCornerControlPoints.flatMap((p) => [p.x, p.y]);
    this.perspectiveTransformControlPoints(flatCorners, new THREE.Vector3(), HANDLE_GROUP.corner);

    this.updateLine();
    this.averageDimensions = this.getAverageDimensions();
    this.warpMaterial.setWarpPlaneSize(this.averageDimensions.width, this.averageDimensions.height);
    this.saveToStorage();
  }

  /** Move the surface's centroid to an absolute world-space position, preserving its warp */
  public setPosition(x: number, y: number): void {
    const center = this.getCenter();
    this.translate(x - center.x, y - center.y);
  }

  /**
   * Resize the surface about its centroid, keeping its warp.
   *
   * Every corner's offset from the centre is multiplied, so a calibrated
   * perspective survives — unlike setBounds, which replaces the quad with a
   * rectangle. Non-uniform factors squash the quad; pass one value for both to
   * keep its shape.
   */
  public scale(factorX: number, factorY: number = factorX): void {
    this.applyScale(factorX, factorY, true);
  }

  private applyScale(factorX: number, factorY: number, persist: boolean): void {
    if (factorX === 0 || factorY === 0) return;

    const scaled = scaleQuadAboutCenter(this.dragCornerControlPoints, factorX, factorY);
    this.dragCornerControlPoints.forEach((point, i) => point.set(scaled[i].x, scaled[i].y, point.z));
    this.cornerObjects.forEach((obj) => obj.userData.lastValidPosition?.copy(obj.position));

    // Re-derive the grid from the resized corners, as a corner drag would
    const corners = this.dragCornerControlPoints.flatMap((p) => [p.x, p.y]);
    this.perspectiveTransformControlPoints(corners, new THREE.Vector3(), HANDLE_GROUP.corner);

    this.updateLine();
    this.averageDimensions = this.getAverageDimensions();
    this.warpMaterial.setWarpPlaneSize(this.averageDimensions.width, this.averageDimensions.height);
    if (persist) this.saveToStorage();
  }

  /** Move the whole surface by a world-space delta, preserving its warp */
  public translate(dx: number, dy: number): void {
    // Corner points ARE the corner objects' positions (same refs), so this moves visuals too
    this.dragCornerControlPoints.forEach((p) => {
      p.x += dx;
      p.y += dy;
    });
    this.cornerObjects.forEach((obj) => obj.userData.lastValidPosition?.copy(obj.position));

    const corners = this.dragCornerControlPoints.flatMap((p) => [p.x, p.y]);
    this.perspectiveTransformControlPoints(corners, new THREE.Vector3(), HANDLE_GROUP.corner);

    this.updateLine();
    this.averageDimensions = this.getAverageDimensions();
    this.warpMaterial.setWarpPlaneSize(this.averageDimensions.width, this.averageDimensions.height);
    this.saveToStorage();
  }

  public setUvRect(offsetX: number, offsetY: number, scaleX: number, scaleY: number): void {
    this.warpMaterial.setUvRect(offsetX, offsetY, scaleX, scaleY);
  }

  /**
   * The quad's current size in world units, averaged over opposite edges.
   *
   * This is the surface as drawn, after scaling and warping — unlike the plane
   * size, which is the undeformed shape. Feed its aspect into a content shader to
   * keep circles round when the surface is scaled non-uniformly.
   */
  /** Where this surface sits in the overlap stack; higher draws on top */
  public setRenderOrder(order: number): void {
    this.mesh.renderOrder = order;
  }

  public getWarpedSize(): { width: number; height: number } {
    return { ...this.averageDimensions };
  }

  /** This surface's own pixel resolution, the source of its plane aspect */
  public getResolution(): Resolution {
    return this.warpMaterial.getResolution();
  }

  public getUvRect(): UvRect {
    return this.warpMaterial.getUvRect();
  }

  public setImageSettings(settings: Partial<ImageSettings>): void {
    this.warpMaterial.setImageSettings(settings);
  }

  public getImageSettings(): ImageSettings {
    return this.warpMaterial.getImageSettings();
  }

  public getDragControls(): DragControls {
    return this.dragControls;
  }

  /** Shared with MaskPlane so the mask follows the warped quad's dimensions */
  public getWarpPlaneSizeUniform(): { value: THREE.Vector2 } {
    return this.warpMaterial.getWarpPlaneSizeUniform();
  }
}
