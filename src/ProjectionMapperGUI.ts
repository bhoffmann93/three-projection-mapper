import { Pane, TpChangeEvent } from 'tweakpane';
import { ProjectionMapper } from './ProjectionMapper';

export interface ProjectionMapperGUISettings {
  showTestcard: boolean;
  showControlLines: boolean;
  gridSizeX: number;
  gridSizeY: number;
  showAllControls: boolean;
  showGridPoints: boolean;
  showCornerPoints: boolean;
  showOutline: boolean;
}

export const GUI_STORAGE_KEY = 'projection-mapper-gui-settings';

export class ProjectionMapperGUI {
  private mapper: ProjectionMapper;
  private pane: Pane;
  private settings: ProjectionMapperGUISettings;

  private readonly STORAGE_KEY = GUI_STORAGE_KEY;

  constructor(mapper: ProjectionMapper, title = 'Projection Mapper') {
    this.mapper = mapper;

    // Initialize settings with defaults
    this.settings = {
      showTestcard: mapper.isShowingTestCard(),
      showControlLines: mapper.isShowingControlLines(),
      gridSizeX: mapper.getWarper().getGridSizeX(),
      gridSizeY: mapper.getWarper().getGridSizeY(),
      showAllControls: true,
      showGridPoints: true,
      showCornerPoints: true,
      showOutline: true,
    };

    // Load saved settings
    this.loadSettings();

    // Apply loaded settings
    this.applySettings();

    // Create GUI
    this.pane = new Pane();
    this.initPane(title);
  }

  private initPane(title: string): void {
    const folder = this.pane.addFolder({ title });

    // Testcard toggle
    folder
      .addBinding(this.settings, 'showTestcard', { label: 'Show Testcard' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setShowTestCard(e.value as boolean);
        this.saveSettings();
      });

    // Grid size controls
    const gridFolder = this.pane.addFolder({ title: 'Grid Settings', expanded: true });

    gridFolder
      .addBinding(this.settings, 'gridSizeX', { label: 'Grid X', min: 2, max: 10, step: 1 })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setGridSize(e.value as number, this.settings.gridSizeY);
        this.saveSettings();
      });

    gridFolder
      .addBinding(this.settings, 'gridSizeY', { label: 'Grid Y', min: 2, max: 10, step: 1 })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setGridSize(this.settings.gridSizeX, e.value as number);
        this.saveSettings();
      });

    // Visibility controls
    const visibilityFolder = this.pane.addFolder({ title: 'Visibility', expanded: true });

    visibilityFolder
      .addBinding(this.settings, 'showAllControls', { label: 'Show All' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        const visible = e.value as boolean;
        this.mapper.setControlsVisible(visible);
        this.settings.showGridPoints = visible;
        this.settings.showCornerPoints = visible;
        this.settings.showOutline = visible;
        this.settings.showControlLines = visible;
        this.pane.refresh();
        this.saveSettings();
      });

    visibilityFolder
      .addBinding(this.settings, 'showGridPoints', { label: 'Grid Points' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setGridPointsVisible(e.value as boolean);
        this.saveSettings();
      });

    visibilityFolder
      .addBinding(this.settings, 'showCornerPoints', { label: 'Corner Points' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setCornerPointsVisible(e.value as boolean);
        this.saveSettings();
      });

    visibilityFolder
      .addBinding(this.settings, 'showOutline', { label: 'Outline' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setOutlineVisible(e.value as boolean);
        this.saveSettings();
      });

    visibilityFolder
      .addBinding(this.settings, 'showControlLines', { label: 'Control Lines' })
      .on('change', (e: TpChangeEvent<unknown>) => {
        this.mapper.setShowControlLines(e.value as boolean);
        this.saveSettings();
      });

    // Reset button
    this.pane.addButton({ title: 'Reset Warp' }).on('click', () => {
      this.mapper.reset();
      window.location.reload();
    });
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
      if (saved) {
        const loaded = JSON.parse(saved) as Partial<ProjectionMapperGUISettings>;
        Object.assign(this.settings, loaded);
      }
    } catch (error) {
      console.warn('Failed to load GUI settings:', error);
    }
  }

  private applySettings(): void {
    this.mapper.setShowTestCard(this.settings.showTestcard);
    this.mapper.setShowControlLines(this.settings.showControlLines);
    this.mapper.setGridSize(this.settings.gridSizeX, this.settings.gridSizeY);
    this.mapper.setControlsVisible(this.settings.showAllControls);
    this.mapper.setGridPointsVisible(this.settings.showGridPoints);
    this.mapper.setCornerPointsVisible(this.settings.showCornerPoints);
    this.mapper.setOutlineVisible(this.settings.showOutline);
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
