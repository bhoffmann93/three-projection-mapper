import * as THREE from 'three';
import { FolderApi, Pane, TpChangeEvent } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import { ProjectionMapper } from './ProjectionMapper';
import {
  GUI_STORAGE_KEY,
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_POLYGON_FEATHER,
  DEFAULTS,
  MESH_WARP_GRID_SIZE,
  STORAGE_VERSION,
  SHOW_ACES_TOGGLE,
} from './defaults';
import type { ImageSettings } from './defaults';
import { WARP_MODE } from '../warp/MeshWarper';
import { EventChannel } from '../ipc/EventChannel';
import { WindowManager } from '../windows/WindowManager';
import { ProjectionEventType } from '../ipc/EventTypes';
import type { ProjectionEventPayloads } from '../ipc/EventPayloads';
import { POLYGON_MASK_STORAGE_KEY } from '../mask/PolygonMask';
import { createElement, Eye, EyeOff, IconNode } from 'lucide';
import { RESET_BUTTON_COLOR, WARP_BUTTON_EYE_ICON } from './gui.config';

interface ButtonGridBladeApi {
  element: HTMLElement;
  on(event: 'click', callback: (ev: { index: [number, number] }) => void): void;
}

export type GUIAnchor = 'left' | 'right';

export interface ProjectionMapperGUIConfig {
  title?: string;
  anchor?: GUIAnchor;
  eventChannel?: EventChannel; // Optional: enables event broadcasting
  windowManager?: WindowManager; // Optional: enables projector window button
  enableWhiteOut?: boolean; // Optional: adds a full-screen white-out toggle button
}

export interface ProjectionMapperGUISettings extends ImageSettings {
  shouldWarp: boolean;
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
  polygonFeather: number;
  polygonInvert: boolean;
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
  private config: ProjectionMapperGUIConfig;
  private syncSettingButtons: () => void = () => {};
  private syncWarpButtons: () => void = () => {};
  private onControlsVisibilityChange: (visible: boolean) => void = () => {};

  private readonly STORAGE_KEY = GUI_STORAGE_KEY;

  constructor(mapper: ProjectionMapper, config: ProjectionMapperGUIConfig = {}) {
    this.mapper = mapper;
    this.config = config;

    const title = config.title || 'Projection Mapper';
    const anchor = config.anchor || 'left';

    this.settings = {
      shouldWarp: mapper.isWarpEnabled(),
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
      polygonFeather: DEFAULT_POLYGON_FEATHER,
      polygonInvert: false,
      ...DEFAULT_IMAGE_SETTINGS,
    };

    this.loadSettings();
    this.applySettings();

    this.pane = new Pane({ title });
    this.pane.registerPlugin(EssentialsPlugin);

    const wrapper = this.pane.element.closest('.tp-dfwv') as HTMLElement;
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
    (btn.element.querySelector('button') as HTMLButtonElement).style.background = RESET_BUTTON_COLOR;
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

  private initPane(): void {
    // Conditional: Add projector window button in multi-window mode
    if (this.config.windowManager) {
      this.pane.addButton({ title: 'Open Projector' }).on('click', () => {
        this.config.windowManager!.openProjectorWindow();
      });
      this.pane.addBlade({ view: 'separator' });
    }

    this.pane.addBlade({
      view: 'text',
      label: 'Buffer Resolution',
      value: `${this.mapper.getResolution().width}x${this.mapper.getResolution().height}`,
      parse: (v: unknown) => v,
      disabled: true,
    });

    this.pane.addBlade({ view: 'separator' });

    const settingsFolder = this.pane.addFolder({ title: 'Settings', expanded: true });

    const hasWhiteOut = !!this.config.enableWhiteOut;
    const settingsButtonCount = hasWhiteOut ? 2 : 1;

    const settingsBtnGrid = settingsFolder.addBlade({
      view: 'buttongrid',
      size: [settingsButtonCount, 1],
      cells: (x: number) => ({ title: hasWhiteOut ? ['Testcard', 'White'][x] : 'Testcard' }),
    }) as unknown as ButtonGridBladeApi;

    const settingsButtons = Array.from(settingsBtnGrid.element.querySelectorAll('button')) as HTMLButtonElement[];
    const testcardBtn = settingsButtons[0];
    const whiteOutBtn = hasWhiteOut ? settingsButtons[1] : null;

    this.syncSettingButtons = () => {
      testcardBtn.style.opacity = this.settings.showTestcard ? '1' : '0.35';
      if (whiteOutBtn) whiteOutBtn.style.opacity = this.settings.showWhiteOut ? '1' : '0.35';
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

    settingsFolder
      .addBinding(this.settings, 'zoom', { label: 'Zoom', min: 0.125, max: 1.0, step: 0.01 })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setZoom(e.value as number);
        this.saveSettings();
        // NOTE: Zoom is controller-local only, not broadcast to projector
      });

    // Image settings folder
    const imageFolder = this.pane.addFolder({ title: 'Image', expanded: this.settings.imageExpanded });

    imageFolder.on('fold', () => {
      this.settings.imageExpanded = imageFolder.expanded;
      this.saveSettings();
    });

    if (SHOW_ACES_TOGGLE) {
      imageFolder
        .addBinding(this.settings, 'tonemap', { label: 'ACES Tonemap' })
        .on('change', (e: TpChangeEvent<unknown>) => {
          this.mapper.setImageSettings({ tonemap: e.value as boolean });
          this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
          this.saveSettings();
        });
    }

    imageFolder
      .addBinding(this.settings, 'shadows', { label: 'Blacks', min: 0, max: 0.99, step: 0.001 })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setImageSettings({ shadows: e.value as number });
        this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
        this.saveSettings();
      });

    imageFolder
      .addBinding(this.settings, 'gamma', { label: 'Gamma', min: 0.1, max: 4.0, step: 0.01 })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setImageSettings({ gamma: e.value as number });
        this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
        this.saveSettings();
      });

    imageFolder
      .addBinding(this.settings, 'highlights', { label: 'Whites', min: 0.01, max: 1, step: 0.001 })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setImageSettings({ highlights: e.value as number });
        this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
        this.saveSettings();
      });

    imageFolder
      .addBinding(this.settings, 'contrast', { label: 'Contrast', min: 1.0, max: 2.0, step: 0.01 })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setImageSettings({ contrast: e.value as number });
        this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
        this.saveSettings();
      });

    imageFolder
      .addBinding(this.settings, 'saturation', { label: 'Saturation', min: 0, max: 2.0, step: 0.01 })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setImageSettings({ saturation: e.value as number });
        this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
        this.saveSettings();
      });

    imageFolder
      .addBinding(this.settings, 'hue', { label: 'Hue', min: -0.5, max: 0.5, step: 0.01 })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setImageSettings({ hue: e.value as number });
        this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
        this.saveSettings();
      });

    imageFolder.addBlade({ view: 'separator' });

    imageFolder
      .addBinding(this.settings, 'maskEnabled', { label: 'Edge Mask' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        const enabled = e.value as boolean;
        this.mapper.setImageSettings({ maskEnabled: enabled });
        featherBinding.disabled = !enabled;
        this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
        this.saveSettings();
      });

    const featherBinding = imageFolder
      .addBinding(this.settings, 'feather', {
        label: 'Feather',
        min: 0.0,
        max: 0.5,
        step: 0.01,
        disabled: !this.settings.maskEnabled,
      })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setImageSettings({ feather: e.value as number });
        this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
        this.saveSettings();
      });

    imageFolder.addBlade({ view: 'separator' });

    this.addResetButton(imageFolder, 'Reset Image', () => {
      Object.assign(this.settings, DEFAULT_IMAGE_SETTINGS);
      this.mapper.setImageSettings(DEFAULT_IMAGE_SETTINGS);
      this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
      this.pane.refresh();
      this.saveSettings();
    });

    // Masks folder
    this.initMasksFolder();

    // Warp UI
    this.warpFolder = this.pane.addFolder({ title: 'Warping', expanded: true });

    this.warpFolder.addBlade({ view: 'separator' });

    const warpBtnGrid = this.warpFolder.addBlade({
      view: 'buttongrid',
      size: [3, 1],
      cells: (x: number) => ({ title: ['Warp', 'Persp', 'Grid'][x] }),
    }) as unknown as ButtonGridBladeApi;

    const [warpEnableBtn, perspBtn, gridBtn] = Array.from(
      warpBtnGrid.element.querySelectorAll('button'),
    ) as HTMLButtonElement[];

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
      warpEnableBtn.style.opacity = this.settings.shouldWarp ? '1' : '0.35';
      perspBtn.disabled = !this.settings.shouldWarp;
      gridBtn.disabled = !this.settings.shouldWarp;
      perspBtn.style.opacity = this.settings.showCornerPoints ? '1' : '0.35';
      gridBtn.style.opacity = this.settings.showWarpGrid ? '1' : '0.35';
      setEyeButtonContent(perspBtn, this.settings.showCornerPoints ? Eye : EyeOff, 'Persp');
      setEyeButtonContent(gridBtn, this.settings.showWarpGrid ? Eye : EyeOff, 'Grid');
    };
    this.syncWarpButtons();

    warpBtnGrid.on('click', (ev) => {
      const col = ev.index[0];
      if (col === 0) {
        const enabled = !this.settings.shouldWarp;
        this.settings.shouldWarp = enabled;
        this.mapper.setShouldWarp(enabled);
        if (!enabled) this.toggleWarpUI(false);
        else this.toggleWarpUI(true);
        this.saveSettings();
        this.broadcast(ProjectionEventType.SHOULD_WARP_CHANGED, { shouldWarp: enabled });
      } else if (col === 1) {
        const enabled = !this.settings.showCornerPoints;
        this.settings.showCornerPoints = enabled;
        this.settings.showOutline = enabled;
        this.mapper.setCornerPointsVisible(enabled);
        this.mapper.setOutlineVisible(enabled);
        this.saveSettings();
      } else if (col === 2) {
        const show = !this.settings.showWarpGrid;
        this.settings.showWarpGrid = show;
        this.mapper.setGridPointsVisible(show);
        this.mapper.setShowControlLines(show);
        this.saveSettings();
        this.broadcast(ProjectionEventType.CONTROL_LINES_TOGGLED, { show });
      }
      this.syncWarpButtons();
    });

    const onGridSizeChange = () => {
      this.mapper.setGridSize(this.settings.gridSize.x, this.settings.gridSize.y);
      this.saveSettings();
      this.broadcast(ProjectionEventType.GRID_SIZE_CHANGED, {
        gridSize: { x: this.settings.gridSize.x, y: this.settings.gridSize.y },
      });
      if (this.isMultiWindowMode()) {
        const warper = this.mapper.getWarper();
        const config = (warper as any).config;
        const gridPoints = warper.getGridControlPoints();
        const referenceGridPoints = (warper as any).referenceGridControlPoints as THREE.Vector3[];
        this.broadcast(ProjectionEventType.GRID_POINTS_UPDATED, {
          points: gridPoints.map((p: THREE.Vector3) => ({
            x: (p.x + config.width / 2) / config.width,
            y: (p.y + config.height / 2) / config.height,
            z: p.z,
          })),
          referencePoints: referenceGridPoints.map((p: THREE.Vector3) => ({
            x: (p.x + config.width / 2) / config.width,
            y: (p.y + config.height / 2) / config.height,
            z: p.z,
          })),
        });
      }
    };

    this.warpFolder
      .addBlade({
        view: 'list',
        label: 'Warp Mode',
        options: [
          { text: 'Bilinear', value: WARP_MODE.bilinear },
          { text: 'Bicubic', value: WARP_MODE.bicubic },
        ],
        value: this.settings.warpMode,
      })
      //@ts-ignore
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.settings.warpMode = e.value as WARP_MODE;
        this.mapper.getWarper().setWarpMode(e.value as WARP_MODE);
        this.saveSettings();
        this.broadcast(ProjectionEventType.WARP_MODE_CHANGED, { mode: e.value as number });
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
        onGridSizeChange();
      });

    this.warpFolder.addBlade({ view: 'separator' });
    this.addResetButton(this.warpFolder, 'Reset Warp', () => {
      this.broadcast(ProjectionEventType.RESET_WARP, {});
      this.mapper.reset();
    });
  }

  private initMasksFolder(): void {
    const masksFolder = this.pane.addFolder({ title: 'Masks', expanded: this.settings.masksExpanded });

    masksFolder.on('fold', () => {
      this.settings.masksExpanded = masksFolder.expanded;
      this.saveSettings();
    });

    const polygonMaskState = {
      enabled: true,
      inverted: this.settings.polygonInvert,
      feather: this.settings.polygonFeather,
      showHandles: true,
    };

    const resetPolygonMaskState = () => {
      polygonMaskState.feather = DEFAULT_POLYGON_FEATHER;
      polygonMaskState.inverted = false;
      polygonMaskState.enabled = true;
      polygonMaskState.showHandles = true;
      this.settings.polygonFeather = DEFAULT_POLYGON_FEATHER;
      this.settings.polygonInvert = false;
      this.saveSettings();
    };

    let polygonSubFolder: FolderApi | null = null;

    const showPolygonSubFolder = () => {
      if (polygonSubFolder) return;
      polygonSubFolder = masksFolder.addFolder({ title: 'Polygon Mask', expanded: true });

      polygonMaskState.inverted = this.settings.polygonInvert;
      this.mapper.setPolygonInvert(polygonMaskState.inverted);

      // Broadcast node changes to projector window
      this.mapper.onPolygonNodesChanged = () => {
        const nodes = this.mapper.getPolygonMask()?.nodes;
        if (!nodes) return;
        this.broadcast(ProjectionEventType.POLYGON_MASK_NODES_CHANGED, {
          nodes: Array.from(nodes).map((n) => ({ u: n.u, v: n.v })),
        });
      };

      const broadcastPolySettings = () => {
        this.broadcast(ProjectionEventType.POLYGON_MASK_SETTINGS_CHANGED, {
          enabled: polygonMaskState.enabled,
          inverted: polygonMaskState.inverted,
          feather: polygonMaskState.feather,
        });
      };

      // Broadcast initial state now that callbacks are wired up
      this.mapper.onPolygonNodesChanged();
      broadcastPolySettings();

      const polyBtnGrid = polygonSubFolder.addBlade({
        view: 'buttongrid',
        size: [3, 1],
        cells: (x: number) => ({ title: ['Enabled', 'Invert', 'Controls'][x] }),
      }) as unknown as ButtonGridBladeApi;

      const [enabledBtn, invertBtn, controlsBtn] = Array.from(
        polyBtnGrid.element.querySelectorAll('button'),
      ) as HTMLButtonElement[];

      const syncPolyButtons = () => {
        enabledBtn.style.opacity = polygonMaskState.enabled ? '1' : '0.35';
        invertBtn.style.opacity = polygonMaskState.inverted ? '1' : '0.35';
        controlsBtn.style.opacity = polygonMaskState.showHandles ? '1' : '0.35';
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
        this.mapper.getPolygonMask()?.setVisible(polygonMaskState.showHandles);
        syncPolyButtons();
      };

      polyBtnGrid.on('click', (ev) => {
        if (ev.index[0] === 0) {
          polygonMaskState.enabled = !polygonMaskState.enabled;
          this.mapper.setPolygonMaskEnabled(polygonMaskState.enabled);
          broadcastPolySettings();
        } else if (ev.index[0] === 1) {
          polygonMaskState.inverted = !polygonMaskState.inverted;
          this.mapper.setPolygonInvert(polygonMaskState.inverted);
          this.settings.polygonInvert = polygonMaskState.inverted;
          this.saveSettings();
          broadcastPolySettings();
        } else {
          polygonMaskState.showHandles = !polygonMaskState.showHandles;
          this.mapper.getPolygonMask()?.setVisible(polygonMaskState.showHandles);
        }
        syncPolyButtons();
      });

      polygonSubFolder
        .addBinding(polygonMaskState, 'feather', { label: 'Feather', min: 0.0, max: 0.1, step: 0.001 })
        .on('change', (e: TpChangeEvent<unknown>) => {
          this.settings.polygonFeather = e.value as number;
          this.mapper.setPolygonFeather(this.settings.polygonFeather);
          this.saveSettings();
          broadcastPolySettings();
        });

      const polyActionGrid = polygonSubFolder.addBlade({
        view: 'buttongrid',
        size: [2, 1],
        cells: (x: number) => ({ title: ['Reset', 'Delete'][x] }),
      }) as unknown as ButtonGridBladeApi;

      (polyActionGrid.element.querySelectorAll('button')[0] as HTMLButtonElement).style.background = RESET_BUTTON_COLOR;

      polyActionGrid.on('click', (ev) => {
        if (ev.index[0] === 0) {
          this.mapper.resetPolygonMask();
        } else {
          this.mapper.removePolygonMask();
          this.mapper.onPolygonNodesChanged = () => {};
          this.broadcast(ProjectionEventType.POLYGON_MASK_REMOVED, {});
          polygonSubFolder!.dispose();
          polygonSubFolder = null;
          this.onControlsVisibilityChange = () => {};
          addBtn.hidden = false;
          resetPolygonMaskState();
        }
      });
    };

    const addBtn = masksFolder.addButton({ title: 'Add Polygon Mask' });
    addBtn.on('click', () => {
      if (!this.mapper.getPolygonMask()) {
        localStorage.removeItem(POLYGON_MASK_STORAGE_KEY);
        this.mapper.addPolygonMask();
      }
      showPolygonSubFolder();
      addBtn.hidden = true;
    });

    // Restore if mask was saved in previous session
    if (localStorage.getItem(POLYGON_MASK_STORAGE_KEY)) {
      this.mapper.addPolygonMask();
      this.mapper.setPolygonFeather(this.settings.polygonFeather);
      showPolygonSubFolder();
      addBtn.hidden = true;
    }
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

      if (!this.settings.shouldWarp) {
        this.settings.shouldWarp = true;
        this.mapper.setShouldWarp(true);
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
    this.mapper.setShouldWarp(this.settings.shouldWarp);
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
    this.mapper.setImageSettings({
      maskEnabled: this.settings.maskEnabled,
      feather: this.settings.feather,
      shadows: this.settings.shadows,
      gamma: this.settings.gamma,
      highlights: this.settings.highlights,
      contrast: this.settings.contrast,
      saturation: this.settings.saturation,
      hue: this.settings.hue,
    });
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
