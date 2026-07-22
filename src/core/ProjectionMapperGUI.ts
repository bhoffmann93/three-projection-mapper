import { FolderApi, Pane, TpChangeEvent } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import { ProjectionMapper } from './ProjectionMapper';
import {
  GUI_STORAGE_KEY,
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_EDGE_MASK,
  DEFAULT_POLYGON_MASK_SETTINGS,
  DEFAULTS,
  MESH_WARP_GRID_SIZE,
  STORAGE_VERSION,
  SHOW_ACES_TOGGLE,
  ZOOM_RANGE,
  scopedStorageKey,
} from './defaults';
import type { ImageSettings } from './defaults';
import { WARP_MODE } from '../warp/MeshWarper';
import { EventChannel } from '../ipc/EventChannel';
import { WindowManager } from '../windows/WindowManager';
import { ProjectionEventType } from '../ipc/EventTypes';
import type { ProjectionEventPayloads } from '../ipc/EventPayloads';
import { createElement, ChevronDown, ChevronUp, Eye, EyeOff, Feather, Projector, IconNode } from 'lucide';
import {
  RESET_BUTTON_COLOR,
  WARP_BUTTON_EYE_ICON,
  MASK_TOGGLE_BUTTON,
  OPEN_PROJECTOR_BUTTON_ICON,
  SURFACE_ORDER_ICON,
  TOGGLE_ENABLED_OPACITY,
  TOGGLE_DISABLED_OPACITY,
  TWEAKPANE_TRANSPARENCY,
  SURFACE_FOLDER_TITLE,
  IMAGE_CONTROLS,
} from './gui.config';
import {
  createTweakpaneButton,
  replaceLabelWithButton,
  addButtonGrid,
  buttonElement,
  paneWrapper,
  type ButtonGridBladeApi,
} from './tweakpaneUtils';

export type GUIAnchor = 'left' | 'right';

/** What both the root pane and a folder can be built into */
type PaneContainer = Pick<FolderApi, 'addFolder' | 'addBinding' | 'addBlade' | 'addButton'>;

export interface ProjectionMapperGUIConfig {
  title?: string;
  anchor?: GUIAnchor;
  eventChannel?: EventChannel; // Optional: enables event broadcasting
  windowManager?: WindowManager; // Optional: enables projector window button
  enableWhiteOut?: boolean; // Optional: adds a full-screen white-out toggle button
}

/**
 * Persisted pane state. Per-surface values (image, masks, uv rect) are
 * deliberately absent — those live in the surface record the mapper owns, and
 * are mirrored into local state that follows the selection.
 */
export interface ProjectionMapperGUISettings {
  showTestcard: boolean;
  showWhiteOut: boolean;
  showWarpGrid: boolean;
  warpMode: WARP_MODE;
  gridSize: { x: number; y: number };
  zoom: number;
  showCornerPoints: boolean;
  showOutline: boolean;
  imageExpanded: boolean;
  masksExpanded: boolean;
}

export { GUI_STORAGE_KEY, DEFAULT_IMAGE_SETTINGS } from './defaults';
export type { ImageSettings } from './defaults';

export class ProjectionMapperGUI {
  private mapper: ProjectionMapper;
  private pane: Pane;
  private settings: ProjectionMapperGUISettings;
  private savedVisibility: Pick<
    ProjectionMapperGUISettings,
    'showWarpGrid' | 'showCornerPoints' | 'showOutline'
  > | null = null;
  private warpFolder!: FolderApi;
  private surfacesFolder!: FolderApi;
  private surfaceListBlade: { dispose(): void; value?: unknown } | null = null;
  private warpModeBlade!: { value: unknown };
  private config: ProjectionMapperGUIConfig;
  private syncSettingButtons: () => void = () => {};
  private syncWarpButtons: () => void = () => {};
  private onControlsVisibilityChange: (visible: boolean) => void = () => {};

  /** Edited freely, then applied on Set — resizing the canvas re-frames everything */
  private outputResolutionState = { width: 0, height: 0 };

  /** These mirror the active surface — image and masks are per surface, not global */
  private imageState = { ...DEFAULT_IMAGE_SETTINGS };
  private edgeMaskState = { ...DEFAULT_EDGE_MASK };
  private polygonState = { ...DEFAULT_POLYGON_MASK_SETTINGS, showHandles: true };
  private syncMasksFolder: () => void = () => {};
  private syncPolyButtons: () => void = () => {};
  private syncSurfaceButtons: () => void = () => {};

  /** Scoped to the mapper's app so apps on one origin keep separate pane state */
  private readonly STORAGE_KEY: string;

  constructor(mapper: ProjectionMapper, config: ProjectionMapperGUIConfig = {}) {
    this.mapper = mapper;
    this.config = config;
    this.STORAGE_KEY = scopedStorageKey(GUI_STORAGE_KEY, mapper.getAppId());

    const title = config.title || 'Projection Mapper';
    const anchor = config.anchor || 'left';

    this.settings = {
      showTestcard: mapper.isShowingTestCard(),
      showWhiteOut: mapper.isWhiteOut(),
      showWarpGrid: true,
      warpMode: mapper.getWarper().getWarpMode(),
      gridSize: {
        x: mapper.getWarper().getGridSizeX(),
        y: mapper.getWarper().getGridSizeY(),
      },
      zoom: mapper.getZoom(),
      showCornerPoints: true,
      showOutline: true,
      imageExpanded: true,
      masksExpanded: true,
    };

    this.loadSettings();
    this.applySettings();

    // Image and masks live on the surface, so the pane seeds from the active one
    Object.assign(this.imageState, mapper.getImageSettings());
    Object.assign(this.edgeMaskState, mapper.getEdgeMask());
    Object.assign(this.polygonState, mapper.getActiveSurface().getPolygonSettings());

    // Canvas clicks are the primary way to select a surface; the pane follows.
    // Surfaces added by the host app rather than by this pane must show up too.
    mapper.onActiveSurfaceChanged(() => this.syncFromActiveSurface());

    // The wheel drives zoom too, so the slider follows rather than fights it
    mapper.onZoomChanged((zoom) => {
      this.settings.zoom = zoom;
      this.pane.refresh();
      this.saveSettings();
    });
    mapper.onSurfacesChanged(() => {
      this.rebuildSurfaceList();
      this.syncFromActiveSurface();
    });

    this.pane = new Pane({ title });
    this.pane.element.style.opacity = TWEAKPANE_TRANSPARENCY;
    this.pane.registerPlugin(EssentialsPlugin);

    const wrapper = paneWrapper(this.pane);
    if (wrapper) {
      wrapper.style.width = '240px';
      if (anchor === 'left') {
        wrapper.style.right = 'auto';
        wrapper.style.left = '8px';
      }
    }

    this.initPane();
  }

  private addResetButton(folder: FolderApi, title: string, onClick: () => void): void {
    const btn = folder.addButton({ title });
    buttonElement(btn).style.background = RESET_BUTTON_COLOR;
    btn.on('click', onClick);
  }

  private isMultiWindowMode(): boolean {
    return !!this.config.eventChannel;
  }

  private broadcast<T extends ProjectionEventType>(type: T, payload: ProjectionEventPayloads[T]): void {
    if (this.config.eventChannel) {
      this.config.eventChannel.emit(type, payload);
    }
  }

  /**
   * Output-wide controls, then the surface selector, then the folders it scopes:
   * how the surface's pixels are graded, what is cut away, and last where the
   * result lands in the output.
   *
   * There is deliberately no uv-crop section. This pane is a calibration
   * harness; choosing which slice of a buffer a surface samples is app work,
   * and four 0-1 sliders are a poor way to express it. The mechanism stays on
   * the mapper (setUvRect), and the UvRectEditor addon provides a visual one.
   */
  private initPane(): void {
    // A single-surface mapper has no set to choose from
    const multiSurface = this.mapper.isMultiSurface();

    this.initOutputControls(this.pane);
    if (multiSurface) this.initSurfacesFolder(this.pane);
    this.initImageFolder(this.pane);
    this.initMasksFolder(this.pane);
    this.initWarpFolder(this.pane);

    this.rebuildSurfaceList();
    this.syncFromActiveSurface();
  }

  /** Output-wide controls: nothing here belongs to an individual surface */
  private initOutputControls(page: PaneContainer): void {
    if (this.config.windowManager) {
      const openProjectorBtn = page.addButton({ title: 'Open Projector' });
      const btnEl = buttonElement(openProjectorBtn);
      const projectorIcon = createElement(Projector, {
        width: OPEN_PROJECTOR_BUTTON_ICON.sizePx,
        height: OPEN_PROJECTOR_BUTTON_ICON.sizePx,
        'stroke-width': OPEN_PROJECTOR_BUTTON_ICON.strokeWidth,
        style: `position: relative; top: ${OPEN_PROJECTOR_BUTTON_ICON.verticalShiftPx}px`,
      });
      btnEl.replaceChildren(projectorIcon, document.createTextNode(' Open Projector'));
      openProjectorBtn.on('click', () => {
        this.config.windowManager!.openProjectorWindow();
      });
    }

    const bufferResolution = this.mapper.getBufferResolution();
    page.addBlade({
      view: 'text',
      label: 'Buffer',
      value: `${bufferResolution.width}x${bufferResolution.height}`,
      parse: (v: unknown) => v,
      disabled: true,
    });

    if (this.mapper.isMultiSurface()) this.initOutputResolution(page);

    const hasWhiteOut = !!this.config.enableWhiteOut;
    const { blade: settingsBtnGrid, buttons: settingsButtons } = addButtonGrid(
      page,
      hasWhiteOut ? ['Testcard', 'White'] : ['Testcard'],
    );
    const testcardBtn = settingsButtons[0];
    const whiteOutBtn = hasWhiteOut ? settingsButtons[1] : null;

    this.syncSettingButtons = () => {
      testcardBtn.style.opacity = this.settings.showTestcard ? TOGGLE_ENABLED_OPACITY : TOGGLE_DISABLED_OPACITY;
      if (whiteOutBtn)
        whiteOutBtn.style.opacity = this.settings.showWhiteOut ? TOGGLE_ENABLED_OPACITY : TOGGLE_DISABLED_OPACITY;
    };
    this.syncSettingButtons();

    settingsBtnGrid.on('click', (ev) => {
      const col = ev.index[0];
      if (col === 0) {
        this.settings.showTestcard = !this.settings.showTestcard;
        this.mapper.setShowTestCard(this.settings.showTestcard);
        this.saveSettings();
        this.broadcast(ProjectionEventType.TESTCARD_TOGGLED, { show: this.settings.showTestcard });
      } else if (hasWhiteOut && col === 1) {
        this.toggleWhiteOut();
      }
      this.syncSettingButtons();
    });

    page
      .addBinding(this.settings, 'zoom', {
        label: 'Zoom',
        min: ZOOM_RANGE.minimum,
        max: ZOOM_RANGE.maximum,
        step: 0.01,
      })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setZoom(e.value as number);
        this.saveSettings();
        // NOTE: Zoom is controller-local only, not broadcast to projector
      });
  }

  /**
   * The surface selector, above everything it scopes. It keeps a fixed position
   * whether there is one surface or several — a control that moves as surfaces
   * are added is harder to find than one that is simply quiet.
   */
  /**
   * The output canvas: the region the projector frames and surfaces are arranged
   * within. Only meaningful with several surfaces — a lone surface is the output.
   *
   * Applied on a button rather than on change, because resizing the canvas
   * re-frames every surface at once and is a set-once decision.
   */
  private initOutputResolution(page: PaneContainer): void {
    const folder = page.addFolder({ title: 'Output', expanded: false });
    Object.assign(this.outputResolutionState, this.mapper.getResolution());

    folder.addBinding(this.outputResolutionState, 'width', { label: 'Width', min: 1, step: 1 });
    folder.addBinding(this.outputResolutionState, 'height', { label: 'Height', min: 1, step: 1 });

    folder.addButton({ title: 'Set Output Resolution' }).on('click', () => {
      this.mapper.setOutputResolution(
        Math.round(this.outputResolutionState.width),
        Math.round(this.outputResolutionState.height),
      );
    });
  }

  private initSurfacesFolder(page: PaneContainer): void {
    this.surfacesFolder = page.addFolder({ title: SURFACE_FOLDER_TITLE.singular, expanded: true });

    // One row: manage the set, then move the selected surface through the overlap
    // order, which is the same shape as the effect stack's move controls
    const { blade: surfaceBtnGrid, buttons } = addButtonGrid(this.surfacesFolder, ['Add', 'Remove', '', '']);
    const [, removeBtn, backBtn, frontBtn] = buttons;
    removeBtn.style.background = RESET_BUTTON_COLOR;

    const setChevron = (button: HTMLButtonElement, icon: IconNode) => {
      button.replaceChildren(
        createElement(icon, {
          width: SURFACE_ORDER_ICON.sizePx,
          height: SURFACE_ORDER_ICON.sizePx,
          'stroke-width': SURFACE_ORDER_ICON.strokeWidth,
          style: `position: relative; top: ${SURFACE_ORDER_ICON.verticalShiftPx}px`,
        }),
      );
    };
    setChevron(backBtn, ChevronDown);
    setChevron(frontBtn, ChevronUp);

    this.syncSurfaceButtons = () => {
      const surfaces = this.mapper.getSurfaces();
      const index = this.mapper.getSurfaceIndex(this.activeSurfaceId());
      removeBtn.disabled = surfaces.length <= 1;
      backBtn.disabled = index <= 0;
      frontBtn.disabled = index === -1 || index >= surfaces.length - 1;
    };

    surfaceBtnGrid.on('click', (ev) => {
      const column = ev.index[0];

      if (column === 0) {
        const surface = this.mapper.addSurface();
        this.broadcast(ProjectionEventType.SURFACE_ADDED, {
          surfaceId: surface.id,
          uvRect: surface.getUvRect(),
          resolution: surface.getResolution(),
        });
      } else if (column === 1) {
        if (this.mapper.getSurfaces().length <= 1) return;
        const surfaceId = this.activeSurfaceId();
        this.mapper.removeSurface(surfaceId);
        this.broadcast(ProjectionEventType.SURFACE_REMOVED, { surfaceId });
      } else {
        this.mapper.moveSurface(this.activeSurfaceId(), column === 2 ? -1 : 1);
        this.broadcast(ProjectionEventType.SURFACE_ORDER_CHANGED, { surfaceIds: this.mapper.getSurfaceOrder() });
      }
      // the mapper's onSurfacesChanged rebuilds the list
    });
  }

  private initWarpFolder(page: PaneContainer): void {
    this.warpFolder = page.addFolder({ title: 'Warp', expanded: true });

    const warpModeBlade = this.warpFolder.addBlade({
      view: 'list',
      label: 'Warp Mode',
      options: [
        { text: 'Bilinear', value: WARP_MODE.bilinear },
        { text: 'Bicubic', value: WARP_MODE.bicubic },
      ],
      value: this.settings.warpMode,
    });
    this.warpModeBlade = warpModeBlade as unknown as { value: unknown };
    //@ts-ignore
    warpModeBlade.on('change', (e: TpChangeEvent<unknown>) => {
      this.settings.warpMode = e.value as WARP_MODE;
      this.mapper.getWarper().setWarpMode(e.value as WARP_MODE);
      this.saveSettings();
      this.broadcast(ProjectionEventType.WARP_MODE_CHANGED, {
        mode: e.value as number,
        surfaceId: this.activeSurfaceId(),
      });
    });

    this.warpFolder
      .addBinding(this.settings, 'gridSize', {
        label: 'Grid Size',
        x: { min: MESH_WARP_GRID_SIZE.minimum, max: MESH_WARP_GRID_SIZE.maximum, step: 1 },
        y: { min: MESH_WARP_GRID_SIZE.minimum, max: MESH_WARP_GRID_SIZE.maximum, step: 1 },
      })
      .on('change', (e: TpChangeEvent<unknown>) => {
        const val = e.value as { x: number; y: number };
        this.settings.gridSize.x = Math.floor(val.x);
        this.settings.gridSize.y = Math.floor(val.y);
        this.onGridSizeChange();
      });

    this.initWarpButtonRow(this.warpFolder);
  }

  /** Handle visibility and reset, alongside the warp settings they act on */
  private initWarpButtonRow(folder: FolderApi): void {
    const { blade: warpBtnGrid, buttons } = addButtonGrid(folder, ['Persp', 'Grid', 'Reset']);
    const [perspBtn, gridBtn, resetBtn] = buttons;
    resetBtn.style.background = RESET_BUTTON_COLOR;

    const setEyeButtonContent = (btn: HTMLButtonElement, icon: IconNode, label: string) => {
      if (!WARP_BUTTON_EYE_ICON.enabled) {
        btn.replaceChildren(document.createTextNode(label));
        return;
      }
      const svg = createElement(icon, {
        width: WARP_BUTTON_EYE_ICON.sizePx,
        height: WARP_BUTTON_EYE_ICON.sizePx,
        'stroke-width': WARP_BUTTON_EYE_ICON.strokeWidth,
        style: `position: relative; top: ${WARP_BUTTON_EYE_ICON.verticalShiftPx}px`,
      });
      btn.replaceChildren(svg, document.createTextNode(` ${label}`));
    };

    this.syncWarpButtons = () => {
      perspBtn.style.opacity = this.settings.showCornerPoints ? TOGGLE_ENABLED_OPACITY : TOGGLE_DISABLED_OPACITY;
      gridBtn.style.opacity = this.settings.showWarpGrid ? TOGGLE_ENABLED_OPACITY : TOGGLE_DISABLED_OPACITY;
      setEyeButtonContent(perspBtn, this.settings.showCornerPoints ? Eye : EyeOff, 'Persp');
      setEyeButtonContent(gridBtn, this.settings.showWarpGrid ? Eye : EyeOff, 'Grid');
    };
    this.syncWarpButtons();

    warpBtnGrid.on('click', (ev) => {
      const col = ev.index[0];
      if (col === 0) {
        // Corner handles only. The outline stays: it is the selection affordance,
        // so hiding it would make surfaces unclickable.
        const enabled = !this.settings.showCornerPoints;
        this.settings.showCornerPoints = enabled;
        this.mapper.setCornerPointsVisible(enabled);
        this.saveSettings();
      } else if (col === 1) {
        const show = !this.settings.showWarpGrid;
        this.settings.showWarpGrid = show;
        this.mapper.setGridPointsVisible(show);
        this.mapper.setShowControlLines(show);
        this.saveSettings();
        this.broadcast(ProjectionEventType.CONTROL_LINES_TOGGLED, { show });
      } else {
        const surfaceId = this.activeSurfaceId();
        this.broadcast(ProjectionEventType.RESET_WARP, { surfaceId });
        this.mapper.reset(surfaceId);
      }
      this.syncWarpButtons();
    });
  }

  private onGridSizeChange(): void {
    this.mapper.setGridSize(this.settings.gridSize.x, this.settings.gridSize.y);
    this.saveSettings();
    const surfaceId = this.activeSurfaceId();
    this.broadcast(ProjectionEventType.GRID_SIZE_CHANGED, {
      gridSize: { x: this.settings.gridSize.x, y: this.settings.gridSize.y },
      surfaceId,
    });
    // Resizing the grid rebuilds the points, so the projector needs the new set
    if (this.isMultiWindowMode()) {
      const warper = this.mapper.getWarper();
      this.broadcast(ProjectionEventType.GRID_POINTS_UPDATED, {
        points: warper.getGridControlPoints().map((p) => warper.toNormalizedPoint(p)),
        referencePoints: warper.getReferenceGridControlPoints().map((p) => warper.toNormalizedPoint(p)),
        surfaceId,
      });
    }
  }

  /** Image adjustments are calibration, so they belong to the selected surface */
  private initImageFolder(page: PaneContainer): void {
    const imageFolder = page.addFolder({ title: 'Image', expanded: this.settings.imageExpanded });

    imageFolder.on('fold', () => {
      this.settings.imageExpanded = imageFolder.expanded;
      this.saveSettings();
    });

    const applyImage = (settings: Partial<ImageSettings>) => {
      this.mapper.setImageSettings(settings);
      this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, {
        settings: this.mapper.getImageSettings(),
        surfaceId: this.activeSurfaceId(),
      });
    };

    if (SHOW_ACES_TOGGLE) {
      imageFolder
        .addBinding(this.imageState, 'tonemap', { label: 'ACES Tonemap' })
        .on('change', (e: TpChangeEvent<unknown>) => applyImage({ tonemap: e.value as boolean }));
    }

    for (const control of IMAGE_CONTROLS) {
      imageFolder
        .addBinding(this.imageState, control.key, {
          label: control.label,
          min: control.min,
          max: control.max,
          step: control.step,
        })
        .on('change', (e: TpChangeEvent<unknown>) => applyImage({ [control.key]: e.value as number }));
    }

    this.addResetButton(imageFolder, 'Reset Image', () => {
      Object.assign(this.imageState, DEFAULT_IMAGE_SETTINGS);
      applyImage(DEFAULT_IMAGE_SETTINGS);
      this.pane.refresh();
    });
  }

  private activeSurfaceId(): string {
    return this.mapper.getActiveSurface().id;
  }


  // The list blade's options are fixed at creation, so it is recreated on add/remove.
  // With a single surface there is nothing to choose between, so it is left out.
  private rebuildSurfaceList(): void {
    if (!this.surfacesFolder) return;
    this.surfaceListBlade?.dispose();
    this.surfaceListBlade = null;

    const surfaces = this.mapper.getSurfaces();
    if (surfaces.length <= 1) return;

    const listBlade = this.surfacesFolder.addBlade({
      view: 'list',
      label: 'Active',
      index: 0,
      options: surfaces.map((s) => ({ text: `Surface ${s.id}`, value: s.id })),
      value: this.activeSurfaceId(),
    });
    this.surfaceListBlade = listBlade;
    //@ts-ignore
    listBlade.on('change', (e: TpChangeEvent<unknown>) => {
      this.mapper.setActiveSurface(e.value as string);
      this.syncFromActiveSurface();
    });
  }

  /** Pull grid size, warp mode, uv rect and masks of the newly active surface into the pane */
  private syncFromActiveSurface(): void {
    const warper = this.mapper.getWarper();
    this.settings.gridSize.x = warper.getGridSizeX();
    this.settings.gridSize.y = warper.getGridSizeY();
    this.settings.warpMode = warper.getWarpMode();
    if (this.warpModeBlade) this.warpModeBlade.value = this.settings.warpMode;
    if (this.surfaceListBlade) this.surfaceListBlade.value = this.activeSurfaceId();

    Object.assign(this.imageState, this.mapper.getImageSettings());
    Object.assign(this.edgeMaskState, this.mapper.getEdgeMask());
    Object.assign(this.polygonState, this.mapper.getActiveSurface().getPolygonSettings());
    this.syncMasksFolder();

    if (this.surfacesFolder) {
      this.surfacesFolder.title =
        this.mapper.getSurfaces().length > 1 ? SURFACE_FOLDER_TITLE.plural : SURFACE_FOLDER_TITLE.singular;
    }
    this.syncSurfaceButtons();

    this.pane.refresh();
    this.saveSettings();
  }

  /** Masks belong to the active surface; every write here is scoped to it */
  private initMasksFolder(page: PaneContainer): void {
    const masksFolder = page.addFolder({ title: 'Masks', expanded: this.settings.masksExpanded });

    masksFolder.on('fold', () => {
      this.settings.masksExpanded = masksFolder.expanded;
      this.saveSettings();
    });

    const broadcastEdgeMask = () => {
      this.broadcast(ProjectionEventType.EDGE_MASK_CHANGED, {
        enabled: this.edgeMaskState.maskEnabled,
        feather: this.edgeMaskState.feather,
        surfaceId: this.activeSurfaceId(),
      });
    };

    const edgeFeatherBinding = masksFolder
      .addBinding(this.edgeMaskState, 'feather', {
        label: 'Edge Feather',
        min: 0.0,
        max: 0.5,
        step: 0.01,
        disabled: !this.edgeMaskState.maskEnabled,
      })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setEdgeMask(this.edgeMaskState.maskEnabled, e.value as number);
        broadcastEdgeMask();
      });

    const maskToggleBtn = createTweakpaneButton(
      '',
      () => {
        this.edgeMaskState.maskEnabled = !this.edgeMaskState.maskEnabled;
        this.mapper.setEdgeMask(this.edgeMaskState.maskEnabled, this.edgeMaskState.feather);
        edgeFeatherBinding.disabled = !this.edgeMaskState.maskEnabled;
        maskToggleBtn.style.opacity = this.edgeMaskState.maskEnabled
          ? TOGGLE_ENABLED_OPACITY
          : TOGGLE_DISABLED_OPACITY;
        broadcastEdgeMask();
      },
      {
        width: MASK_TOGGLE_BUTTON.widthPx,
        height: MASK_TOGGLE_BUTTON.heightPx,
        fontSize: `${MASK_TOGGLE_BUTTON.fontSizePx}px`,
      },
    );

    maskToggleBtn.style.gap = '4px';
    maskToggleBtn.appendChild(document.createTextNode('Edge'));
    maskToggleBtn.appendChild(
      createElement(Feather, {
        width: MASK_TOGGLE_BUTTON.iconSizePx,
        height: MASK_TOGGLE_BUTTON.iconSizePx,
        'stroke-width': MASK_TOGGLE_BUTTON.iconStrokeWidth,
      }),
    );
    maskToggleBtn.style.opacity = this.edgeMaskState.maskEnabled ? TOGGLE_ENABLED_OPACITY : TOGGLE_DISABLED_OPACITY;
    maskToggleBtn.style.pointerEvents = 'auto';

    replaceLabelWithButton(edgeFeatherBinding, maskToggleBtn);

    const polygonMaskState = this.polygonState;

    let polygonSubFolder: FolderApi | null = null;

    // Node changes on any surface go out tagged with that surface's id
    const broadcastPolygonNodes = (surfaceId: string) => {
      const nodes = this.mapper.getPolygonMask(surfaceId)?.nodes;
      if (!nodes) return;
      this.broadcast(ProjectionEventType.POLYGON_MASK_NODES_CHANGED, {
        nodes: Array.from(nodes).map((n) => ({ u: n.u, v: n.v })),
        surfaceId,
      });
    };
    this.mapper.onPolygonNodesChanged(broadcastPolygonNodes);

    const broadcastPolySettings = () => {
      this.broadcast(ProjectionEventType.POLYGON_MASK_SETTINGS_CHANGED, {
        enabled: polygonMaskState.enabled,
        inverted: polygonMaskState.inverted,
        feather: polygonMaskState.feather,
        surfaceId: this.activeSurfaceId(),
      });
    };

    const showPolygonSubFolder = () => {
      if (polygonSubFolder) return;
      polygonSubFolder = masksFolder.addFolder({ title: 'Polygon Mask', expanded: true });

      const { blade: polyBtnGrid, buttons: polyButtons } = addButtonGrid(polygonSubFolder, [
        'Enabled',
        'Invert',
        'Controls',
      ]);
      const [enabledBtn, invertBtn, controlsBtn] = polyButtons;

      const syncPolyButtons = () => {
        enabledBtn.style.opacity = polygonMaskState.enabled ? TOGGLE_ENABLED_OPACITY : TOGGLE_DISABLED_OPACITY;
        invertBtn.style.opacity = polygonMaskState.inverted ? TOGGLE_ENABLED_OPACITY : TOGGLE_DISABLED_OPACITY;
        controlsBtn.style.opacity = polygonMaskState.showHandles ? TOGGLE_ENABLED_OPACITY : TOGGLE_DISABLED_OPACITY;
      };
      syncPolyButtons();

      let savedPolyHandles: boolean | null = null;
      this.onControlsVisibilityChange = (visible: boolean) => {
        if (visible) {
          polygonMaskState.showHandles = savedPolyHandles ?? polygonMaskState.showHandles;
          savedPolyHandles = null;
        } else {
          savedPolyHandles = polygonMaskState.showHandles;
          polygonMaskState.showHandles = false;
        }
        this.mapper.setPolygonHandlesVisible(polygonMaskState.showHandles);
        syncPolyButtons();
      };
      this.syncPolyButtons = syncPolyButtons;

      polyBtnGrid.on('click', (ev) => {
        if (ev.index[0] === 0) {
          polygonMaskState.enabled = !polygonMaskState.enabled;
          this.mapper.setPolygonMaskEnabled(polygonMaskState.enabled);
          broadcastPolySettings();
        } else if (ev.index[0] === 1) {
          polygonMaskState.inverted = !polygonMaskState.inverted;
          this.mapper.setPolygonInvert(polygonMaskState.inverted);
          broadcastPolySettings();
        } else {
          polygonMaskState.showHandles = !polygonMaskState.showHandles;
          this.mapper.setPolygonHandlesVisible(polygonMaskState.showHandles);
        }
        syncPolyButtons();
      });

      polygonSubFolder
        .addBinding(polygonMaskState, 'feather', { label: 'Feather', min: 0.0, max: 0.1, step: 0.001 })
        .on('change', (e: TpChangeEvent<unknown>) => {
          this.mapper.setPolygonFeather(e.value as number);
          broadcastPolySettings();
        });

      const { blade: polyActionGrid, buttons: polyActionButtons } = addButtonGrid(polygonSubFolder, [
        'Reset',
        'Delete',
      ]);
      polyActionButtons[0].style.background = RESET_BUTTON_COLOR;

      polyActionGrid.on('click', (ev) => {
        const surfaceId = this.activeSurfaceId();
        if (ev.index[0] === 0) {
          this.mapper.resetPolygonMask();
        } else {
          this.mapper.removePolygonMask();
          this.broadcast(ProjectionEventType.POLYGON_MASK_REMOVED, { surfaceId });
          hidePolygonSubFolder();
        }
      });
    };

    const hidePolygonSubFolder = () => {
      polygonSubFolder?.dispose();
      polygonSubFolder = null;
      this.syncPolyButtons = () => {};
      this.onControlsVisibilityChange = () => {};
      addBtn.hidden = false;
    };

    const addBtn = masksFolder.addButton({ title: 'Add Polygon Mask' });
    addBtn.on('click', () => {
      if (!this.mapper.getPolygonMask()) this.mapper.addPolygonMask();
      Object.assign(polygonMaskState, this.mapper.getActiveSurface().getPolygonSettings());
      showPolygonSubFolder();
      addBtn.hidden = true;
      broadcastPolySettings();
      broadcastPolygonNodes(this.activeSurfaceId());
    });

    // The polygon sub-folder exists only while the *active* surface has a mask,
    // so switching surfaces swaps it in and out
    this.syncMasksFolder = () => {
      edgeFeatherBinding.disabled = !this.edgeMaskState.maskEnabled;
      maskToggleBtn.style.opacity = this.edgeMaskState.maskEnabled
        ? TOGGLE_ENABLED_OPACITY
        : TOGGLE_DISABLED_OPACITY;

      if (this.mapper.getPolygonMask()) {
        showPolygonSubFolder();
        addBtn.hidden = true;
        this.syncPolyButtons();
      } else {
        hidePolygonSubFolder();
      }
    };

    this.syncMasksFolder();
  }

  private applyVisibility(): void {
    this.mapper.setGridPointsVisible(this.settings.showWarpGrid);
    this.mapper.setShowControlLines(this.settings.showWarpGrid);
    this.mapper.setCornerPointsVisible(this.settings.showCornerPoints);
    this.mapper.setOutlineVisible(this.settings.showOutline);
  }

  public toggleWarpUI(forceState?: boolean): void {
    const anyVisible = this.settings.showWarpGrid || this.settings.showCornerPoints || this.settings.showOutline;
    const shouldHide = forceState !== undefined ? !forceState : anyVisible;

    if (shouldHide && anyVisible) {
      this.savedVisibility = {
        showWarpGrid: this.settings.showWarpGrid,
        showCornerPoints: this.settings.showCornerPoints,
        showOutline: this.settings.showOutline,
      };
      this.settings.showWarpGrid = false;
      this.settings.showCornerPoints = false;
      this.settings.showOutline = false;
    } else if (!shouldHide) {
      if (this.savedVisibility) {
        this.settings.showWarpGrid = this.savedVisibility.showWarpGrid;
        this.settings.showCornerPoints = this.savedVisibility.showCornerPoints;
        this.settings.showOutline = this.savedVisibility.showOutline;
        this.savedVisibility = null;
      } else {
        this.settings.showWarpGrid = true;
        this.settings.showCornerPoints = true;
        this.settings.showOutline = true;
      }
    }

    this.applyVisibility();
    const controlsVisible = this.settings.showWarpGrid || this.settings.showCornerPoints || this.settings.showOutline;
    this.onControlsVisibilityChange(controlsVisible);
    this.syncSettingButtons();
    this.syncWarpButtons();
    this.saveSettings();

    this.broadcast(ProjectionEventType.CONTROLS_VISIBILITY_CHANGED, { visible: controlsVisible });
    this.broadcast(ProjectionEventType.CONTROL_LINES_TOGGLED, { show: this.settings.showWarpGrid });
  }

  private applySettings(): void {
    // Warp bypass is not a pane control: it stays wherever the host app left it
    this.mapper.setShowTestCard(this.settings.showTestcard);
    this.mapper.setWhiteOut(this.settings.showWhiteOut);
    //only apply if settings differ
    const currentX = this.mapper.getWarper().getGridSizeX();
    const currentY = this.mapper.getWarper().getGridSizeY();
    if (this.settings.gridSize.x !== currentX || this.settings.gridSize.y !== currentY) {
      this.mapper.setGridSize(this.settings.gridSize.x, this.settings.gridSize.y);
    }
    this.mapper.getWarper().setWarpMode(this.settings.warpMode);
    this.mapper.setZoom(this.settings.zoom);
    this.applyVisibility();
    // Image and mask settings are restored per surface by ProjectionMapper from
    // the surface record — the pane mirrors them rather than owning them.
  }

  toggleTestCard(): void {
    this.settings.showTestcard = !this.settings.showTestcard;
    this.mapper.setShowTestCard(this.settings.showTestcard);
    this.syncSettingButtons();
    this.saveSettings();
    this.broadcast(ProjectionEventType.TESTCARD_TOGGLED, {
      show: this.settings.showTestcard,
    });
  }

  toggleWhiteOut(): void {
    this.settings.showWhiteOut = !this.settings.showWhiteOut;
    this.mapper.setWhiteOut(this.settings.showWhiteOut);
    this.syncSettingButtons();
    this.saveSettings();
    this.broadcast(ProjectionEventType.WHITE_OUT_TOGGLED, {
      show: this.settings.showWhiteOut,
    });
  }

  show(): void {
    this.pane.hidden = false;
  }

  hide(): void {
    this.pane.hidden = true;
  }

  toggle(): void {
    this.pane.hidden = !this.pane.hidden;
  }

  dispose(): void {
    this.pane.dispose();
  }

  collapse(): void {
    this.pane.expanded = false;
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ ...this.settings, version: STORAGE_VERSION }));
    } catch (error) {
      console.warn('Failed to save GUI settings:', error);
    }
  }

  private loadSettings(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (!saved) return;

      const loaded = JSON.parse(saved) as Partial<ProjectionMapperGUISettings> & { version?: number };
      if (loaded.version !== STORAGE_VERSION) {
        localStorage.removeItem(this.STORAGE_KEY);
        return;
      }
      Object.assign(this.settings, loaded);
    } catch (error) {
      console.warn('Failed to load GUI settings:', error);
    }
  }
}

export default ProjectionMapperGUI;
