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
} from './defaults';
import type { ImageSettings } from './defaults';
import { WARP_MODE } from '../warp/MeshWarper';
import { EventChannel } from '../ipc/EventChannel';
import { WindowManager } from '../windows/WindowManager';
import { ProjectionEventType } from '../ipc/EventTypes';
import type { ProjectionEventPayloads } from '../ipc/EventPayloads';

export type GUIAnchor = 'left' | 'right';

export interface ProjectionMapperGUIConfig {
  title?: string;
  anchor?: GUIAnchor;
  eventChannel?: EventChannel; // Optional: enables event broadcasting
  windowManager?: WindowManager; // Optional: enables projector window button
}

export interface ProjectionMapperGUISettings extends ImageSettings {
  shouldWarp: boolean;
  showTestcard: boolean;
  showGrid: boolean;
  warpMode: WARP_MODE;
  gridSize: { x: number; y: number };
  zoom: number;
  showCornerPoints: boolean;
  showOutline: boolean;
  imageExpanded: boolean;
  polygonFeather: number;
}

export { GUI_STORAGE_KEY, DEFAULT_IMAGE_SETTINGS } from './defaults';
export type { ImageSettings } from './defaults';

export class ProjectionMapperGUI {
  private mapper: ProjectionMapper;
  private pane: Pane;
  private settings: ProjectionMapperGUISettings;
  private savedVisibility: Pick<ProjectionMapperGUISettings, 'showGrid' | 'showCornerPoints' | 'showOutline'> | null =
    null;
  private warpFolder!: FolderApi;
  private config: ProjectionMapperGUIConfig;
  private cornersOutlineState = { enabled: true };
  private syncSettingButtons: () => void = () => {};
  private syncControlsButton: () => void = () => {};
  private onControlsVisibilityChange: ((visible: boolean) => void) = () => {};

  private readonly STORAGE_KEY = GUI_STORAGE_KEY;

  constructor(mapper: ProjectionMapper, config: ProjectionMapperGUIConfig = {}) {
    this.mapper = mapper;
    this.config = config;

    const title = config.title || 'Projection Mapper';
    const anchor = config.anchor || 'right';

    this.settings = {
      shouldWarp: mapper.isWarpEnabled(),
      showTestcard: mapper.isShowingTestCard(),
      showGrid: false,
      warpMode: mapper.getWarper().getWarpMode(),
      gridSize: {
        x: mapper.getWarper().getGridSizeX(),
        y: mapper.getWarper().getGridSizeY(),
      },
      zoom: mapper.getZoom(),
      showCornerPoints: true,
      showOutline: true,
      imageExpanded: true,
      polygonFeather: DEFAULT_POLYGON_FEATHER,
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

    const settingsBtnGrid = settingsFolder.addBlade({
      view: 'buttongrid',
      size: [2, 1],
      cells: (x: number) => ({ title: ['Testcard', 'Warp'][x] }),
    }) as any;

    const [testcardBtn, warpBtn] = Array.from(
      (settingsBtnGrid.element as HTMLElement).querySelectorAll('button'),
    ) as HTMLButtonElement[];

    this.syncSettingButtons = () => {
      testcardBtn.style.opacity = this.settings.showTestcard ? '1' : '0.35';
      warpBtn.style.opacity = this.settings.shouldWarp ? '1' : '0.35';
    };
    this.syncSettingButtons();

    settingsBtnGrid.on('click', (ev: any) => {
      if (ev.index[0] === 0) {
        this.settings.showTestcard = !this.settings.showTestcard;
        this.mapper.setShowTestCard(this.settings.showTestcard);
        this.saveSettings();
        this.broadcast(ProjectionEventType.TESTCARD_TOGGLED, { show: this.settings.showTestcard });
      } else {
        const enabled = !this.settings.shouldWarp;
        this.settings.shouldWarp = enabled;
        this.mapper.setShouldWarp(enabled);
        this.warpFolder.disabled = !enabled;
        this.warpFolder.expanded = enabled;
        if (!enabled) this.toggleWarpUI(false);
        else this.toggleWarpUI(true);
        this.saveSettings();
        this.broadcast(ProjectionEventType.SHOULD_WARP_CHANGED, { shouldWarp: enabled });
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

    imageFolder
      .addBinding(this.settings, 'tonemap', { label: 'ACES Tonemap' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setImageSettings({ tonemap: e.value as boolean });
        this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
        this.saveSettings();
      });

    imageFolder
      .addBinding(this.settings, 'gamma', { label: 'Gamma', min: 0.5, max: 2.0, step: 0.01 })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setImageSettings({ gamma: e.value as number });
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
      .addBinding(this.settings, 'hue', { label: 'Hue', min: -0.5, max: 0.5, step: 0.01 })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setImageSettings({ hue: e.value as number });
        this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
        this.saveSettings();
      });

    imageFolder.addBlade({ view: 'separator' });

    imageFolder.addButton({ title: 'Reset Image' }).on('click', () => {
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

    // Ensure folder state matches loaded settings
    this.warpFolder.disabled = !this.settings.shouldWarp;
    if (!this.settings.shouldWarp) {
      this.warpFolder.expanded = false;
    }

    this.warpFolder.addBlade({ view: 'separator' });

    const warpBtnGrid = this.warpFolder.addBlade({
      view: 'buttongrid',
      size: [2, 1],
      cells: (x: number) => ({ title: ['Controls', 'Show All'][x] }),
    }) as any;

    const [controlsBtn] = Array.from(
      (warpBtnGrid.element as HTMLElement).querySelectorAll('button'),
    ) as HTMLButtonElement[];

    this.syncControlsButton = () => {
      const anyVisible = this.settings.showGrid || this.settings.showCornerPoints || this.settings.showOutline;
      controlsBtn.style.opacity = anyVisible ? '1' : '0.35';
    };
    this.syncControlsButton();

    warpBtnGrid.on('click', (ev: any) => {
      if (ev.index[0] === 0) {
        this.toggleWarpUI();
      } else {
        this.settings.showGrid = true;
        this.settings.showCornerPoints = true;
        this.settings.showOutline = true;
        this.cornersOutlineState.enabled = true;
        this.savedVisibility = null;
        this.applyVisibility();
        this.onControlsVisibilityChange(true);
        this.pane.refresh();
        this.syncControlsButton();
        this.saveSettings();
        this.broadcast(ProjectionEventType.CONTROLS_VISIBILITY_CHANGED, { visible: true });
        this.broadcast(ProjectionEventType.CONTROL_LINES_TOGGLED, { show: true });
      }
    });

    // Perspective Warp folder
    const perspFolder = this.warpFolder.addFolder({ title: 'Perspective Warp', expanded: true });

    this.cornersOutlineState.enabled = this.settings.showCornerPoints;
    perspFolder
      .addBinding(this.cornersOutlineState, 'enabled', { label: 'Show' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        const enabled = e.value as boolean;
        this.settings.showCornerPoints = enabled;
        this.settings.showOutline = enabled;
        this.mapper.setCornerPointsVisible(enabled);
        this.mapper.setOutlineVisible(enabled);
        this.saveSettings();
      });

    // Grid Warp folder
    const gridFolder = this.warpFolder.addFolder({ title: 'Grid Warp', expanded: true });

    gridFolder
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
        this.broadcast(ProjectionEventType.WARP_MODE_CHANGED, {
          mode: e.value as number,
        });
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

    gridFolder
      .addBinding(this.settings.gridSize, 'x', {
        label: 'Cols',
        min: MESH_WARP_GRID_SIZE.minimum,
        max: MESH_WARP_GRID_SIZE.maximum,
        step: 1,
      })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.settings.gridSize.x = Math.floor(e.value as number);
        onGridSizeChange();
      });

    gridFolder
      .addBinding(this.settings.gridSize, 'y', {
        label: 'Rows',
        min: MESH_WARP_GRID_SIZE.minimum,
        max: MESH_WARP_GRID_SIZE.maximum,
        step: 1,
      })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.settings.gridSize.y = Math.floor(e.value as number);
        onGridSizeChange();
      });

    gridFolder.addBinding(this.settings, 'showGrid', { label: 'Show' }).on('change', (e: TpChangeEvent<unknown>) => {
      const show = e.value as boolean;
      this.mapper.setGridPointsVisible(show);
      this.mapper.setShowControlLines(show);
      this.saveSettings();
      this.broadcast(ProjectionEventType.CONTROL_LINES_TOGGLED, { show });
    });

    this.warpFolder.addBlade({ view: 'separator' });

    this.warpFolder.addButton({ title: 'Reset Warp' }).on('click', () => {
      // Broadcast reset to projector
      this.broadcast(ProjectionEventType.RESET_WARP, {});

      // Reset locally and reload
      this.mapper.reset();
      if (this.isMultiWindowMode()) {
        setTimeout(() => {
          window.location.reload();
        }, 100);
      } else {
        window.location.reload();
      }
    });
  }

  private initMasksFolder(): void {
    const masksFolder = this.pane.addFolder({ title: 'Masks', expanded: true });

    const polygonMaskState = { enabled: true, feather: this.settings.polygonFeather, showHandles: true };
    let polygonSubFolder: FolderApi | null = null;

    const showPolygonSubFolder = () => {
      if (polygonSubFolder) return;
      polygonSubFolder = masksFolder.addFolder({ title: 'Polygon Mask', expanded: true });

      const polyBtnGrid = polygonSubFolder.addBlade({
        view: 'buttongrid',
        size: [2, 1],
        cells: (x: number) => ({ title: ['Enabled', 'Controls'][x] }),
      }) as any;

      const [enabledBtn, controlsBtn] = Array.from(
        (polyBtnGrid.element as HTMLElement).querySelectorAll('button'),
      ) as HTMLButtonElement[];

      const syncPolyButtons = () => {
        enabledBtn.style.opacity = polygonMaskState.enabled ? '1' : '0.35';
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

      polyBtnGrid.on('click', (ev: any) => {
        if (ev.index[0] === 0) {
          polygonMaskState.enabled = !polygonMaskState.enabled;
          this.mapper.setPolygonMaskEnabled(polygonMaskState.enabled);
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
        });

      (
        polygonSubFolder.addBlade({
          view: 'buttongrid',
          size: [2, 1],
          cells: (x: number) => ({ title: ['Reset', 'Delete'][x] }),
        }) as any
      ).on('click', (ev: any) => {
        if (ev.index[0] === 0) {
          this.mapper.resetPolygonMask();
        } else {
          this.mapper.removePolygonMask();
          polygonSubFolder!.dispose();
          polygonSubFolder = null;
          this.onControlsVisibilityChange = () => {};
        }
      });
    };

    const edgeMaskFolder = masksFolder.addFolder({ title: 'Edge Mask', expanded: true });

    edgeMaskFolder
      .addBinding(this.settings, 'maskEnabled', { label: 'Enabled' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        const enabled = e.value as boolean;
        this.mapper.setImageSettings({ maskEnabled: enabled });
        featherBinding.disabled = !enabled;
        this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
        this.saveSettings();
      });

    const featherBinding = edgeMaskFolder
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

    masksFolder.addButton({ title: 'Add Polygon Mask' }).on('click', () => {
      if (!this.mapper.getPolygonMask()) {
        this.mapper.addPolygonMask();
      }
      showPolygonSubFolder();
    });

    // Restore if mask was saved in previous session
    if (localStorage.getItem('polygon-mask')) {
      this.mapper.addPolygonMask();
      this.mapper.setPolygonFeather(this.settings.polygonFeather);
      showPolygonSubFolder();
    }
  }

  private applyVisibility(): void {
    this.mapper.setGridPointsVisible(this.settings.showGrid);
    this.mapper.setShowControlLines(this.settings.showGrid);
    this.mapper.setCornerPointsVisible(this.settings.showCornerPoints);
    this.mapper.setOutlineVisible(this.settings.showOutline);
  }

  public toggleWarpUI(forceState?: boolean): void {
    const anyVisible = this.settings.showGrid || this.settings.showCornerPoints || this.settings.showOutline;

    const shouldHide = forceState !== undefined ? !forceState : anyVisible;

    if (shouldHide && anyVisible) {
      this.savedVisibility = {
        showGrid: this.settings.showGrid,
        showCornerPoints: this.settings.showCornerPoints,
        showOutline: this.settings.showOutline,
      };
      this.settings.showGrid = false;
      this.settings.showCornerPoints = false;
      this.settings.showOutline = false;
      this.cornersOutlineState.enabled = false;
    } else if (shouldHide) {
      // Already hidden, nothing to do
    } else {
      if (this.savedVisibility) {
        this.settings.showGrid = this.savedVisibility.showGrid;
        this.settings.showCornerPoints = this.savedVisibility.showCornerPoints;
        this.settings.showOutline = this.savedVisibility.showOutline;
        this.cornersOutlineState.enabled = this.savedVisibility.showCornerPoints;
        this.savedVisibility = null;
      } else {
        this.settings.showGrid = true;
        this.settings.showCornerPoints = true;
        this.settings.showOutline = true;
        this.cornersOutlineState.enabled = true;
      }

      if (!this.settings.shouldWarp) {
        this.settings.shouldWarp = true;
        this.mapper.setShouldWarp(true);
        this.warpFolder.disabled = false;
        this.warpFolder.expanded = true;
      }
    }

    this.applyVisibility();
    const controlsVisible = this.settings.showGrid || this.settings.showCornerPoints || this.settings.showOutline;
    this.onControlsVisibilityChange(controlsVisible);
    this.pane.refresh();
    this.syncSettingButtons();
    this.syncControlsButton();
    this.saveSettings();

    this.broadcast(ProjectionEventType.CONTROLS_VISIBILITY_CHANGED, {
      visible: this.settings.showGrid || this.settings.showCornerPoints || this.settings.showOutline,
    });
    this.broadcast(ProjectionEventType.CONTROL_LINES_TOGGLED, {
      show: this.settings.showGrid,
    });
  }

  private applySettings(): void {
    this.mapper.setShouldWarp(this.settings.shouldWarp);
    this.mapper.setShowTestCard(this.settings.showTestcard);
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
      gamma: this.settings.gamma,
      contrast: this.settings.contrast,
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
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.warn('Failed to save GUI settings:', error);
    }
  }

  private loadSettings(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (!saved) return;

      const loaded = JSON.parse(saved) as Partial<ProjectionMapperGUISettings>;
      Object.assign(this.settings, loaded);
    } catch (error) {
      console.warn('Failed to load GUI settings:', error);
    }
  }
}

export default ProjectionMapperGUI;
