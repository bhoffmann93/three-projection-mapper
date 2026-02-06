import { Pane, TpChangeEvent } from 'tweakpane';
import { ProjectionMapper } from './ProjectionMapper';

export interface ProjectionMapperGUISettings {
  showTestcard: boolean;
  showControlLines: boolean;
  gridSize: { x: number; y: number };
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

  private readonly STORAGE_KEY = GUI_STORAGE_KEY;

  constructor(mapper: ProjectionMapper, title = 'Projection Mapper') {
    this.mapper = mapper;

    this.settings = {
      showTestcard: mapper.isShowingTestCard(),
      showControlLines: mapper.isShowingControlLines(),
      gridSize: {
        x: mapper.getWarper().getGridSizeX(),
        y: mapper.getWarper().getGridSizeY(),
      },
      showGridPoints: true,
      showCornerPoints: true,
      showOutline: true,
    };

    this.loadSettings();
    this.applySettings();

    this.pane = new Pane({ title });
    this.initPane();
  }

  private initPane(): void {
    // Shortcuts at top
    this.pane.addBlade({
      view: 'text',
      label: '[G] GUI',
      value: '[T] Testcard',
      parse: (v: string) => v,
      disabled: true,
    } as Record<string, unknown>);
    this.pane.addBlade({
      view: 'text',
      label: '[H] Hide',
      value: '[S] Show',
      parse: (v: string) => v,
      disabled: true,
    } as Record<string, unknown>);

    this.pane.addBlade({ view: 'separator' });

    // Settings: grid size + testcard
    const settingsFolder = this.pane.addFolder({ title: 'Settings', expanded: true });

    settingsFolder
      .addBinding(this.settings, 'showTestcard', { label: 'Testcard' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setShowTestCard(e.value as boolean);
        this.saveSettings();
      });

    settingsFolder
      .addBinding(this.settings, 'gridSize', {
        label: 'Grid',
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

    settingsFolder.addBlade({ view: 'separator' });

    settingsFolder.addButton({ title: 'Reset Warp' }).on('click', () => {
      this.mapper.reset();
      window.location.reload();
    });

    // Visibility
    const visFolder = this.pane.addFolder({ title: 'Visibility', expanded: true });

    visFolder.addButton({ title: 'Toggle UI' }).on('click', () => {
      const anyVisible =
        this.settings.showGridPoints ||
        this.settings.showCornerPoints ||
        this.settings.showOutline ||
        this.settings.showControlLines;

      if (anyVisible) {
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
      } else if (this.savedVisibility) {
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

      this.applyVisibility();
      this.pane.refresh();
      this.saveSettings();
    });

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

    visFolder.addBlade({ view: 'separator' });

    visFolder
      .addBinding(this.settings, 'showCornerPoints', { label: 'Corners' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setCornerPointsVisible(e.value as boolean);
        this.saveSettings();
      });

    visFolder
      .addBinding(this.settings, 'showGridPoints', { label: 'Grid' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setGridPointsVisible(e.value as boolean);
        this.saveSettings();
      });

    visFolder
      .addBinding(this.settings, 'showOutline', { label: 'Outline' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setOutlineVisible(e.value as boolean);
        this.saveSettings();
      });

    visFolder
      .addBinding(this.settings, 'showControlLines', { label: 'Shader Lines' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setShowControlLines(e.value as boolean);
        this.saveSettings();
      });
  }

  private applyVisibility(): void {
    this.mapper.setGridPointsVisible(this.settings.showGridPoints);
    this.mapper.setCornerPointsVisible(this.settings.showCornerPoints);
    this.mapper.setOutlineVisible(this.settings.showOutline);
    this.mapper.setShowControlLines(this.settings.showControlLines);
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

      // Migrate old gridSizeX/gridSizeY format
      const legacy = loaded as Record<string, unknown>;
      if ('gridSizeX' in legacy && 'gridSizeY' in legacy && !loaded.gridSize) {
        loaded.gridSize = { x: legacy.gridSizeX as number, y: legacy.gridSizeY as number };
      }

      Object.assign(this.settings, loaded);
    } catch (error) {
      console.warn('Failed to load GUI settings:', error);
    }
  }

  private applySettings(): void {
    this.mapper.setShowTestCard(this.settings.showTestcard);
    this.mapper.setGridSize(this.settings.gridSize.x, this.settings.gridSize.y);
    this.applyVisibility();
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
}

export default ProjectionMapperGUI;
