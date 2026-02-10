import { FolderApi, Pane, TpChangeEvent } from 'tweakpane';
import { ProjectionMapper } from './ProjectionMapper';
import { WARP_MODE } from './MeshWarper';

export const enum GUI_ANCHOR {
  LEFT = 'left',
  RIGHT = 'right',
}

export interface ProjectionMapperGUISettings {
  shouldWarp: boolean;
  showTestcard: boolean;
  showControlLines: boolean;
  warpMode: WARP_MODE;
  gridSize: { x: number; y: number };
  zoom: number;
  showGridPoints: boolean;
  showCornerPoints: boolean;
  showOutline: boolean;
}

export const GUI_STORAGE_KEY = 'projection-mapper-gui-settings';

export class ProjectionMapperGUI {
  private mapper: ProjectionMapper;
  private pane: Pane;
  private settings: ProjectionMapperGUISettings;
  private savedVisibility: Pick<
    ProjectionMapperGUISettings,
    'showGridPoints' | 'showCornerPoints' | 'showOutline' | 'showControlLines'
  > | null = null;
  private warpFolder!: FolderApi;

  private readonly STORAGE_KEY = GUI_STORAGE_KEY;

  constructor(mapper: ProjectionMapper, title = 'Projection Mapper', anchor: GUI_ANCHOR = GUI_ANCHOR.RIGHT) {
    this.mapper = mapper;

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
    this.pane.addBlade({
      view: 'text',
      label: 'Buffer Resolution',
      value: `${this.mapper['resolution'].width}x${this.mapper['resolution'].height}`,
      parse: (v: unknown) => v,
      disabled: true,
    });

    // Shortcuts
    this.pane.addBlade({
      view: 'text',
      label: '[G] GUI',
      value: '[H] Warp UI  [T] Test',
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
      });

    settingsFolder
      .addBinding(this.settings, 'zoom', { label: 'Zoom', min: 0.5, max: 1.0, step: 0.01 })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setPlaneScale(e.value as number);
        this.saveSettings();
      });

    // Warp UI
    this.warpFolder = this.pane.addFolder({ title: 'Warping', expanded: true });

    // Ensure folder state matches loaded settings
    this.warpFolder.disabled = !this.settings.shouldWarp;
    if (!this.settings.shouldWarp) {
      this.warpFolder.expanded = false;
    }

    const visFolder = this.warpFolder;

    // Warp Mode
    visFolder
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
      });

    visFolder
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
      });

    visFolder.addBlade({ view: 'separator' });

    visFolder.addButton({ title: 'Toggle' }).on('click', () => this.toggleWarpUI());

    visFolder.addButton({ title: 'Show All' }).on('click', () => {
      this.settings.showGridPoints = true;
      this.settings.showCornerPoints = true;
      this.settings.showOutline = true;
      this.settings.showControlLines = true;
      this.savedVisibility = null;
      this.applyVisibility();
      this.pane.refresh();
      this.saveSettings();
    });

    // Perspective visibility
    const perspFolder = visFolder.addFolder({ title: 'Perspective', expanded: true });

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

    // Grid visibility
    const gridFolder = visFolder.addFolder({ title: 'Grid', expanded: true });

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
      });

    visFolder.addBlade({ view: 'separator' });

    visFolder.addButton({ title: 'Reset Warp' }).on('click', () => {
      this.mapper.reset();
      window.location.reload();
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
      // Already hidden, nothing to do
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
  }

  toggleTestCard(): void {
    this.settings.showTestcard = !this.settings.showTestcard;
    this.mapper.setShowTestCard(this.settings.showTestcard);
    this.pane.refresh();
    this.saveSettings();
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
