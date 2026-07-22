/*
WarpPointStore
--------------
Persistence for one surface's control points.

Points are stored as fractions of the plane rather than world units, so a
calibration survives a change of resolution. That only works if the plane they
were measured against is stored too — denormalising onto a different plane
silently distorts the quad, which is what a surface changing shape used to do.
*/

import { STORAGE_VERSION } from '../core/defaults';

const STORAGE_KEY = 'warp-grid-control-points';

export interface NormalizedPosition {
  x: number;
  y: number;
  z: number;
}

export interface PlaneSize {
  width: number;
  height: number;
}

export interface StoredControlPoints {
  version?: number;
  /** Grid dimensions at time of save, used for validation on load */
  gridSize?: { x: number; y: number };
  /** The plane the points are fractions of */
  planeSize?: PlaneSize;
  corners: NormalizedPosition[];
  grid: NormalizedPosition[];
  referenceGrid: NormalizedPosition[];
}

export const toNormalized = (point: { x: number; y: number; z: number }, plane: PlaneSize): NormalizedPosition => ({
  x: (point.x + plane.width / 2) / plane.width,
  y: (point.y + plane.height / 2) / plane.height,
  z: point.z,
});

export const fromNormalized = (normalized: NormalizedPosition, plane: PlaneSize): NormalizedPosition => ({
  x: normalized.x * plane.width - plane.width / 2,
  y: normalized.y * plane.height - plane.height / 2,
  z: normalized.z,
});

export class WarpPointStore {
  private key: string;

  constructor(storageNamespace?: string) {
    this.key = WarpPointStore.keyFor(storageNamespace);
  }

  static keyFor(storageNamespace?: string): string {
    return storageNamespace ? `${STORAGE_KEY}:${storageNamespace}` : STORAGE_KEY;
  }

  /** Grid size persisted with a warper's points, so it can be built at that size */
  static readGridSize(storageNamespace?: string): { x: number; y: number } | null {
    try {
      const stored = localStorage.getItem(WarpPointStore.keyFor(storageNamespace));
      if (!stored) return null;
      const data: StoredControlPoints = JSON.parse(stored);
      if (data.gridSize?.x && data.gridSize?.y) return { x: data.gridSize.x, y: data.gridSize.y };
    } catch {
      // ignore parse errors
    }
    return null;
  }

  /** Null when absent, unreadable, or written by an incompatible version */
  read(): StoredControlPoints | null {
    try {
      const stored = localStorage.getItem(this.key);
      if (!stored) return null;

      const data: StoredControlPoints = JSON.parse(stored);
      if (data.version !== STORAGE_VERSION) {
        this.clear();
        return null;
      }
      return data;
    } catch (e) {
      console.warn('Failed to load control points from localStorage:', e);
      return null;
    }
  }

  write(data: Omit<StoredControlPoints, 'version'>): void {
    try {
      localStorage.setItem(this.key, JSON.stringify({ ...data, version: STORAGE_VERSION }));
    } catch (e) {
      console.warn('Failed to save control points to localStorage:', e);
    }
  }

  clear(): void {
    localStorage.removeItem(this.key);
  }
}
