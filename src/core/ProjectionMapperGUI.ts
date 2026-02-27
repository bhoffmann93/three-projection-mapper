import * as THREE from 'three';
import { FolderApi, Pane, TpChangeEvent } from 'tweakpane';
import { ProjectionMapper, GUI_STORAGE_KEY, DEFAULT_IMAGE_SETTINGS } from './ProjectionMapper';
import type { ImageSettings } from './ProjectionMapper';
import { WARP_MODE } from '../warp/MeshWarper';
import { EventChannel } from '../ipc/EventChannel';
import { WindowManager } from '../windows/WindowManager';
import { ProjectionEventType } from '../ipc/EventTypes';
import type { ProjectionEventPayloads } from '../ipc/EventPayloads';

export const enum GUI_ANCHOR {
  LEFT = 'left',
  RIGHT = 'right',
}

export interface ProjectionMapperGUIConfig {
  title?: string;
  anchor?: GUI_ANCHOR;
  eventChannel?: EventChannel; // Optional: enables event broadcasting
  windowManager?: WindowManager; // Optional: enables projector window button
}

export interface ProjectionMapperGUISettings extends ImageSettings {
  shouldWarp: boolean;
  showTestcard: boolean;
  showControlLines: boolean;
  warpMode: WARP_MODE;
  gridSize: { x: number; y: number };
  zoom: number;
  showGridPoints: boolean;
  showCornerPoints: boolean;
  showOutline: boolean;
  imageExpanded: boolean;
}

export { GUI_STORAGE_KEY, DEFAULT_IMAGE_SETTINGS } from './ProjectionMapper';
export type { ImageSettings } from './ProjectionMapper';

export class ProjectionMapperGUI {
  private mapper: ProjectionMapper;
  private pane: Pane;
  private settings: ProjectionMapperGUISettings;
  private savedVisibility: Pick<
    ProjectionMapperGUISettings,
    'showGridPoints' | 'showCornerPoints' | 'showOutline' | 'showControlLines'
  > | null = null;
  private warpFolder!: FolderApi;
  private config: ProjectionMapperGUIConfig;
  private cornersOutlineState = { enabled: true };

  private readonly STORAGE_KEY = GUI_STORAGE_KEY;

  constructor(mapper: ProjectionMapper, config: ProjectionMapperGUIConfig = {}) {
    this.mapper = mapper;
    this.config = config;

    const title = config.title || 'Projection Mapper';
    const anchor = config.anchor || GUI_ANCHOR.RIGHT;

    this.settings = {
      shouldWarp: mapper.isWarpEnabled(),
      showTestcard: mapper.isShowingTestCard(),
      showControlLines: mapper.isShowingControlLines(),
      warpMode: mapper.getWarper().getWarpMode(),
      gridSize: {
        x: mapper.getWarper().getGridSizeX(),
        y: mapper.getWarper().getGridSizeY(),
      },
      zoom: mapper.getPlaneScale(),
      showGridPoints: true,
      showCornerPoints: true,
      showOutline: true,
      imageExpanded: false,
      ...DEFAULT_IMAGE_SETTINGS,
    };

    this.loadSettings();
    this.applySettings();

    this.pane = new Pane({ title });

    const wrapper = this.pane.element.closest('.tp-dfwv') as HTMLElement;
    if (wrapper) {
      wrapper.style.width = '240px';
      if (anchor === GUI_ANCHOR.LEFT) {
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
      this.pane.addButton({ title: 'Open Projector [O]' }).on('click', () => {
        this.config.windowManager!.openProjectorWindow();
      });
      this.pane.addBlade({ view: 'separator' });
    }

    this.pane.addBlade({
      view: 'text',
      label: 'Buffer Resolution',
      value: `${this.mapper['resolution'].width}x${this.mapper['resolution'].height}`,
      parse: (v: unknown) => v,
      disabled: true,
    });

    // Shortcuts - different based on mode
    if (this.isMultiWindowMode()) {
      this.pane.addBlade({
        view: 'text',
        label: '[G] GUI [W] Warp',
        value: '[T] Test  [O] Projector',
        parse: (v: string) => v,
        disabled: true,
      } as Record<string, unknown>);
    } else {
      this.pane.addBlade({
        view: 'text',
        label: '[G] GUI',
        value: '[W] Warp UI  [T] Test',
        parse: (v: string) => v,
        disabled: true,
      } as Record<string, unknown>);
    }

    this.pane.addBlade({ view: 'separator' });

    const settingsFolder = this.pane.addFolder({ title: 'Settings', expanded: true });

    settingsFolder
      .addBinding(this.settings, 'showTestcard', { label: 'Testcard' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setShowTestCard(e.value as boolean);
        this.saveSettings();
        this.broadcast(ProjectionEventType.TESTCARD_TOGGLED, {
          show: e.value as boolean,
        });
      });

    settingsFolder
      .addBinding(this.settings, 'shouldWarp', { label: 'Warp' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        const enabled = e.value as boolean;
        this.mapper.setShouldWarp(enabled);
        this.warpFolder.disabled = !enabled;
        this.warpFolder.expanded = enabled;

        if (!enabled) {
          this.toggleWarpUI(false);
        } else {
          this.toggleWarpUI(true);
        }
        this.saveSettings();
        this.broadcast(ProjectionEventType.SHOULD_WARP_CHANGED, {
          shouldWarp: enabled,
        });
      });

    settingsFolder
      .addBinding(this.settings, 'zoom', { label: 'Zoom', min: 0.125, max: 1.0, step: 0.01 })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setPlaneScale(e.value as number);
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
      .addBinding(this.settings, 'maskEnabled', { label: 'Mask' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setImageSettings({ maskEnabled: e.value as boolean });
        this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
        this.saveSettings();
      });

    imageFolder
      .addBinding(this.settings, 'feather', { label: 'Feather', min: 0.0, max: 0.5, step: 0.01 })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setImageSettings({ feather: e.value as number });
        this.broadcast(ProjectionEventType.IMAGE_SETTINGS_CHANGED, { settings: this.mapper.getImageSettings() });
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

    // Warp UI
    this.warpFolder = this.pane.addFolder({ title: 'Warping', expanded: true });

    // Ensure folder state matches loaded settings
    this.warpFolder.disabled = !this.settings.shouldWarp;
    if (!this.settings.shouldWarp) {
      this.warpFolder.expanded = false;
    }

    this.warpFolder.addBlade({ view: 'separator' });

    this.warpFolder.addButton({ title: 'Toggle Controls' }).on('click', () => this.toggleWarpUI());

    this.warpFolder.addButton({ title: 'Show All' }).on('click', () => {
      this.settings.showGridPoints = true;
      this.settings.showCornerPoints = true;
      this.settings.showOutline = true;
      this.settings.showControlLines = true;
      this.cornersOutlineState.enabled = true;
      this.savedVisibility = null;
      this.applyVisibility();
      this.pane.refresh();
      this.saveSettings();
      this.broadcast(ProjectionEventType.CONTROLS_VISIBILITY_CHANGED, {
        visible: true,
      });
      this.broadcast(ProjectionEventType.CONTROL_LINES_TOGGLED, {
        show: true,
      });
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

    gridFolder
      .addBinding(this.settings, 'gridSize', {
        label: 'Grid Size',
        x: { min: 2, max: 10, step: 1 },
        y: { min: 2, max: 10, step: 1 },
      })
      .on('change', (e: TpChangeEvent<unknown>) => {
        const val = e.value as { x: number; y: number };
        this.settings.gridSize.x = Math.floor(val.x);
        this.settings.gridSize.y = Math.floor(val.y);
        this.mapper.setGridSize(this.settings.gridSize.x, this.settings.gridSize.y);
        this.saveSettings();

        // Broadcast grid size change
        this.broadcast(ProjectionEventType.GRID_SIZE_CHANGED, {
          gridSize: { x: this.settings.gridSize.x, y: this.settings.gridSize.y },
        });

        // After grid size changes, broadcast updated grid points
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
      });

    gridFolder
      .addBinding(this.settings, 'showGridPoints', { label: 'Grid Handles' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setGridPointsVisible(e.value as boolean);
        this.saveSettings();
      });

    gridFolder
      .addBinding(this.settings, 'showControlLines', { label: 'Control Lines' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setShowControlLines(e.value as boolean);
        this.saveSettings();
        this.broadcast(ProjectionEventType.CONTROL_LINES_TOGGLED, {
          show: e.value as boolean,
        });
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

  private applyVisibility(): void {
    this.mapper.setGridPointsVisible(this.settings.showGridPoints);
    this.mapper.setCornerPointsVisible(this.settings.showCornerPoints);
    this.mapper.setOutlineVisible(this.settings.showOutline);
    this.mapper.setShowControlLines(this.settings.showControlLines);
  }

  public toggleWarpUI(forceState?: boolean): void {
    const anyVisible =
      this.settings.showGridPoints ||
      this.settings.showCornerPoints ||
      this.settings.showOutline ||
      this.settings.showControlLines;

    const shouldHide = forceState !== undefined ? !forceState : anyVisible;

    if (shouldHide && anyVisible) {
      this.savedVisibility = {
        showGridPoints: this.settings.showGridPoints,
        showCornerPoints: this.settings.showCornerPoints,
        showOutline: this.settings.showOutline,
        showControlLines: this.settings.showControlLines,
      };
      this.settings.showGridPoints = false;
      this.settings.showCornerPoints = false;
      this.settings.showOutline = false;
      this.settings.showControlLines = false;
      this.cornersOutlineState.enabled = false;
    } else if (shouldHide) {
      // Already hidden, nothing to do
    } else {
      if (this.savedVisibility) {
        this.settings.showGridPoints = this.savedVisibility.showGridPoints;
        this.settings.showCornerPoints = this.savedVisibility.showCornerPoints;
        this.settings.showOutline = this.savedVisibility.showOutline;
        this.settings.showControlLines = this.savedVisibility.showControlLines;
        this.cornersOutlineState.enabled = this.savedVisibility.showCornerPoints;
        this.savedVisibility = null;
      } else {
        this.settings.showGridPoints = true;
        this.settings.showCornerPoints = true;
        this.settings.showOutline = true;
        this.settings.showControlLines = true;
        this.cornersOutlineState.enabled = true;
      }
    }

    this.applyVisibility();
    this.pane.refresh();
    this.saveSettings();

    // Broadcast visibility changes
    this.broadcast(ProjectionEventType.CONTROLS_VISIBILITY_CHANGED, {
      visible: this.settings.showGridPoints || this.settings.showCornerPoints || this.settings.showOutline,
    });
    this.broadcast(ProjectionEventType.CONTROL_LINES_TOGGLED, {
      show: this.settings.showControlLines,
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
    this.mapper.setPlaneScale(this.settings.zoom);
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
    this.pane.refresh();
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
