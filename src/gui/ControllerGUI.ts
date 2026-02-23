import { FolderApi, Pane, TpChangeEvent } from 'tweakpane';
import { ProjectionMapper } from '../core/ProjectionMapper';
import { EventChannel } from '../ipc/EventChannel';
import { ProjectionEventType } from '../ipc/EventTypes';
import { WindowManager } from '../windows/WindowManager';
import { WARP_MODE } from '../warp/MeshWarper';
import { GUI_ANCHOR, ProjectionMapperGUISettings, GUI_STORAGE_KEY } from '../core/ProjectionMapperGUI';

/**
 * Controller-specific GUI with event broadcasting
 * Based on ProjectionMapperGUI but broadcasts all state changes
 */
export class ControllerGUI {
  private mapper: ProjectionMapper;
  private pane: Pane;
  private settings: ProjectionMapperGUISettings;
  private savedVisibility: Pick<
    ProjectionMapperGUISettings,
    'showGridPoints' | 'showCornerPoints' | 'showOutline' | 'showControlLines'
  > | null = null;
  private warpFolder!: FolderApi;
  private eventChannel: EventChannel;
  private windowManager: WindowManager;
  private onGridSizeChangeCallback?: () => void;
  private onProjectorControlsChangeCallback?: (visible: boolean) => void;

  private readonly STORAGE_KEY = GUI_STORAGE_KEY;

  constructor(
    mapper: ProjectionMapper,
    eventChannel: EventChannel,
    windowManager: WindowManager,
    title = 'Controller',
    anchor: GUI_ANCHOR = GUI_ANCHOR.LEFT,
    onGridSizeChange?: () => void,
    onProjectorControlsChange?: (visible: boolean) => void,
  ) {
    this.mapper = mapper;
    this.eventChannel = eventChannel;
    this.windowManager = windowManager;
    this.onGridSizeChangeCallback = onGridSizeChange;
    this.onProjectorControlsChangeCallback = onProjectorControlsChange;

    this.settings = {
      shouldWarp: mapper.isShouldWarp(),
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
      showProjectorControls: false, // Default: hide controls on projector
    };

    this.loadSettings();
    this.applySettings();

    this.pane = new Pane({ title });

    const wrapper = document.querySelector('.tp-dfwv') as HTMLElement;
    if (wrapper) {
      wrapper.style.width = '240px';
      if (anchor === GUI_ANCHOR.LEFT) {
        wrapper.style.right = 'auto';
        wrapper.style.left = '8px';
      }
    }

    this.initPane();
  }

  private initPane(): void {
    // Projector window button
    this.pane.addButton({ title: 'Open Projector [O]' }).on('click', () => {
      this.windowManager.openProjectorWindow();
    });

    this.pane.addBlade({ view: 'separator' });

    this.pane.addBlade({
      view: 'text',
      label: 'Buffer Resolution',
      value: `${this.mapper['resolution'].width}x${this.mapper['resolution'].height}`,
      parse: (v: unknown) => v,
      disabled: true,
    });

    this.pane.addBlade({
      view: 'text',
      label: '[G] GUI [H] Warp',
      value: '[T] Test  [O] Projector',
      parse: (v: string) => v,
      disabled: true,
    } as Record<string, unknown>);

    this.pane.addBlade({ view: 'separator' });

    const settingsFolder = this.pane.addFolder({ title: 'Settings', expanded: true });

    settingsFolder
      .addBinding(this.settings, 'showTestcard', { label: 'Testcard' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setShowTestCard(e.value as boolean);
        this.saveSettings();
        this.eventChannel.emit(ProjectionEventType.TESTCARD_TOGGLED, {
          show: e.value as boolean,
        });
      });

    settingsFolder
      .addBinding(this.settings, 'showProjectorControls', { label: 'Projector Controls' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        const visible = e.value as boolean;
        this.settings.showProjectorControls = visible;
        this.saveSettings();
        this.eventChannel.emit(ProjectionEventType.CONTROLS_VISIBILITY_CHANGED, {
          visible,
        });
        // Call callback to update controller's local state
        if (this.onProjectorControlsChangeCallback) {
          this.onProjectorControlsChangeCallback(visible);
        }
      });

    settingsFolder
      .addBinding(this.settings, 'shouldWarp', { label: 'Apply Warp' })
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
        this.eventChannel.emit(ProjectionEventType.SHOULD_WARP_CHANGED, {
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

    // Warp UI
    this.warpFolder = this.pane.addFolder({ title: 'Warping', expanded: true });

    this.warpFolder.disabled = !this.settings.shouldWarp;
    if (!this.settings.shouldWarp) {
      this.warpFolder.expanded = false;
    }

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
        this.eventChannel.emit(ProjectionEventType.WARP_MODE_CHANGED, {
          mode: e.value as number,
        });
      });

    this.warpFolder
      .addBinding(this.settings, 'gridSize', {
        label: 'Warp Grid',
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
        this.eventChannel.emit(ProjectionEventType.GRID_SIZE_CHANGED, {
          gridSize: { x: this.settings.gridSize.x, y: this.settings.gridSize.y },
        });

        // After grid size changes, broadcast updated grid points
        const warper = this.mapper.getWarper();
        const config = (warper as any).config;
        const gridPoints = warper.getGridControlPoints();
        const referenceGridPoints = (warper as any).referenceGridControlPoints;

        this.eventChannel.emit(ProjectionEventType.GRID_POINTS_UPDATED, {
          points: gridPoints.map((p) => ({
            x: (p.x + config.width / 2) / config.width,
            y: (p.y + config.height / 2) / config.height,
            z: p.z,
          })),
          referencePoints: referenceGridPoints.map((p) => ({
            x: (p.x + config.width / 2) / config.width,
            y: (p.y + config.height / 2) / config.height,
            z: p.z,
          })),
        });

        // Call callback to re-attach drag listeners
        if (this.onGridSizeChangeCallback) {
          this.onGridSizeChangeCallback();
        }
      });

    this.warpFolder.addBlade({ view: 'separator' });

    this.warpFolder.addButton({ title: 'Toggle' }).on('click', () => this.toggleWarpUI());

    this.warpFolder.addButton({ title: 'Show All' }).on('click', () => {
      this.settings.showGridPoints = true;
      this.settings.showCornerPoints = true;
      this.settings.showOutline = true;
      this.settings.showControlLines = true;
      this.savedVisibility = null;
      this.applyVisibility();
      this.pane.refresh();
      this.saveSettings();
      this.eventChannel.emit(ProjectionEventType.CONTROLS_VISIBILITY_CHANGED, {
        visible: true,
      });
      this.eventChannel.emit(ProjectionEventType.CONTROL_LINES_TOGGLED, {
        show: true,
      });
    });

    const perspFolder = this.warpFolder.addFolder({ title: 'Perspective Warp', expanded: true });

    perspFolder
      .addBinding(this.settings, 'showCornerPoints', { label: 'Corners' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setCornerPointsVisible(e.value as boolean);
        this.saveSettings();
      });

    perspFolder
      .addBinding(this.settings, 'showOutline', { label: 'Outline' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setOutlineVisible(e.value as boolean);
        this.saveSettings();
      });

    const gridFolder = this.warpFolder.addFolder({ title: 'Grid Warp', expanded: true });

    gridFolder
      .addBinding(this.settings, 'showGridPoints', { label: 'Handles' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setGridPointsVisible(e.value as boolean);
        this.saveSettings();
      });

    gridFolder
      .addBinding(this.settings, 'showControlLines', { label: 'Lines' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setShowControlLines(e.value as boolean);
        this.saveSettings();
        this.eventChannel.emit(ProjectionEventType.CONTROL_LINES_TOGGLED, {
          show: e.value as boolean,
        });
      });

    this.warpFolder.addBlade({ view: 'separator' });

    this.warpFolder.addButton({ title: 'Reset Warp' }).on('click', () => {
      // Broadcast reset to projector
      this.eventChannel.emit(ProjectionEventType.RESET_WARP, {});

      // Reset locally and reload
      this.mapper.reset();
      setTimeout(() => {
        window.location.reload();
      }, 100);
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
    } else if (shouldHide) {
      // Already hidden
    } else {
      if (this.savedVisibility) {
        this.settings.showGridPoints = this.savedVisibility.showGridPoints;
        this.settings.showCornerPoints = this.savedVisibility.showCornerPoints;
        this.settings.showOutline = this.savedVisibility.showOutline;
        this.settings.showControlLines = this.savedVisibility.showControlLines;
        this.savedVisibility = null;
      } else {
        this.settings.showGridPoints = true;
        this.settings.showCornerPoints = true;
        this.settings.showOutline = true;
        this.settings.showControlLines = true;
      }
    }

    this.applyVisibility();
    this.pane.refresh();
    this.saveSettings();

    this.eventChannel.emit(ProjectionEventType.CONTROLS_VISIBILITY_CHANGED, {
      visible: this.settings.showGridPoints || this.settings.showCornerPoints || this.settings.showOutline,
    });
    this.eventChannel.emit(ProjectionEventType.CONTROL_LINES_TOGGLED, {
      show: this.settings.showControlLines,
    });
  }

  private applySettings(): void {
    this.mapper.setShouldWarp(this.settings.shouldWarp);
    this.mapper.setShowTestCard(this.settings.showTestcard);

    const currentX = this.mapper.getWarper().getGridSizeX();
    const currentY = this.mapper.getWarper().getGridSizeY();
    if (this.settings.gridSize.x !== currentX || this.settings.gridSize.y !== currentY) {
      this.mapper.setGridSize(this.settings.gridSize.x, this.settings.gridSize.y);
    }
    this.mapper.getWarper().setWarpMode(this.settings.warpMode);
    this.mapper.setPlaneScale(this.settings.zoom);
    this.applyVisibility();
  }

  toggleTestCard(): void {
    this.settings.showTestcard = !this.settings.showTestcard;
    this.mapper.setShowTestCard(this.settings.showTestcard);
    this.pane.refresh();
    this.saveSettings();
    this.eventChannel.emit(ProjectionEventType.TESTCARD_TOGGLED, {
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
