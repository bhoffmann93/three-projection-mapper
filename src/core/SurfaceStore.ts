/*
SurfaceStore
------------
Persistence for the surface list: which surfaces exist, their order, which is
selected, and the per-surface settings that are not warp points.

Order matters and is the array's own order — it is the overlap order surfaces are
drawn in, so it has to round-trip.
*/

import { SURFACES_STORAGE_KEY, STORAGE_VERSION, scopedStorageKey } from './defaults';
import type { UvRect, EdgeMaskSettings, PolygonMaskSettings, ImageSettings, Resolution } from './defaults';

export interface StoredSurface {
  id: string;
  uvRect: UvRect;
  /** Absent means inherit the mapper's default surface shape */
  resolution?: Resolution;
  edgeMask?: EdgeMaskSettings;
  polygonMask?: PolygonMaskSettings;
  imageSettings?: ImageSettings;
}

export interface StoredSurfaces {
  version: number;
  activeId: string;
  surfaces: StoredSurface[];
}

export class SurfaceStore {
  private key: string;

  constructor(appId?: string) {
    this.key = scopedStorageKey(SURFACES_STORAGE_KEY, appId);
  }

  /** Null when absent, unreadable, or written by an incompatible version */
  read(): StoredSurfaces | null {
    try {
      const stored = localStorage.getItem(this.key);
      if (!stored) return null;

      const parsed = JSON.parse(stored) as StoredSurfaces;
      if (!Array.isArray(parsed.surfaces)) return null;
      if (parsed.version !== STORAGE_VERSION) {
        localStorage.removeItem(this.key);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  write(activeId: string, surfaces: StoredSurface[]): void {
    try {
      localStorage.setItem(this.key, JSON.stringify({ version: STORAGE_VERSION, activeId, surfaces }));
    } catch (e) {
      console.warn('Failed to save surfaces to localStorage:', e);
    }
  }
}
