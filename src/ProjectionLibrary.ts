/**
 * ProjectionLibrary - Main library class for projection mapping
 * Manages windows, rendering, and warping
 */

import * as THREE from 'three';
import { ProjectionMapper } from './ProjectionMapper';
import { WindowManager } from './windows/WindowManager';
import { EventChannel } from './ipc/EventChannel';

export interface ProjectionLibraryConfig {
  /** Resolution for projection (default: 1280x800) */
  resolution?: { width: number; height: number };

  /** Initial grid control points (default: 5x5) */
  gridControlPoints?: { x: number; y: number };

  /** Display mode for main window (default: 'controller') */
  mode?: 'controller' | 'projector' | 'none';
}

export class ProjectionLibrary {
  private config: Required<ProjectionLibraryConfig>;
  private windowManager: WindowManager;
  private eventChannel: EventChannel;
  private renderer: THREE.WebGLRenderer;
  private renderTarget: THREE.WebGLRenderTarget;
  private mapper: ProjectionMapper;

  constructor(config: ProjectionLibraryConfig = {}) {
    this.config = {
      resolution: config.resolution ?? { width: 1280, height: 800 },
      gridControlPoints: config.gridControlPoints ?? { x: 5, y: 5 },
      mode: config.mode ?? 'controller',
    };

    // Create renderer and render target for this window
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x000000);

    this.renderTarget = new THREE.WebGLRenderTarget(
      this.config.resolution.width,
      this.config.resolution.height,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      }
    );

    this.mapper = new ProjectionMapper(this.renderer, this.renderTarget.texture);
    this.windowManager = new WindowManager();
    this.eventChannel = new EventChannel('projection-mapper-sync', this.config.mode);
  }

  start(): void {
    // Add canvas to DOM
    document.body.appendChild(this.renderer.domElement);

    // Open windows based on mode
    if (this.config.mode === 'controller') {
      // This IS the controller, user can manually open projector via window manager
    } else if (this.config.mode === 'projector') {
      // This IS the projector (opened by controller)
    }

    // Start render loop will be called by user
  }

  render(userRenderFn: (renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) => void): void {
    // User renders their content to the render target
    userRenderFn(this.renderer, this.renderTarget);

    // Mapper renders the warped result
    this.mapper.render();
  }

  getMapper(): ProjectionMapper {
    return this.mapper;
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  getRenderTarget(): THREE.WebGLRenderTarget {
    return this.renderTarget;
  }

  getWindowManager(): WindowManager {
    return this.windowManager;
  }

  getEventChannel(): EventChannel {
    return this.eventChannel;
  }
}
