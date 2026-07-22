import { describe, it, expect } from 'vitest';
import {
  scopedStorageKey,
  surfaceStorageNamespace as storageNamespace,
  planeSizeFor,
  WORLD_PLANE_HEIGHT,
  DEFAULT_SURFACE_ID,
} from '../core/defaults';

const warpKey = (namespace?: string) =>
  namespace ? `warp-grid-control-points:${namespace}` : 'warp-grid-control-points';

describe('scopedStorageKey', () => {
  it('leaves a key untouched when nothing scopes it', () => {
    expect(scopedStorageKey('projection-mapper-surfaces')).toBe('projection-mapper-surfaces');
    expect(scopedStorageKey('projection-mapper-surfaces', undefined)).toBe('projection-mapper-surfaces');
  });

  it('separates apps sharing one origin', () => {
    expect(scopedStorageKey('projection-mapper-surfaces', 'single-window')).toBe(
      'projection-mapper-surfaces:single-window',
    );
    expect(scopedStorageKey('projection-mapper-surfaces', 'multi-surface')).not.toBe(
      scopedStorageKey('projection-mapper-surfaces', 'single-window'),
    );
  });
});

describe('surface storage namespace', () => {
  it('keeps legacy keys for the default surface of an unscoped app', () => {
    expect(storageNamespace(DEFAULT_SURFACE_ID)).toBeUndefined();
    expect(warpKey(storageNamespace(DEFAULT_SURFACE_ID))).toBe('warp-grid-control-points');
  });

  it('scopes by surface, by app, and by both', () => {
    expect(storageNamespace('1')).toBe('surface-1');
    expect(storageNamespace(DEFAULT_SURFACE_ID, 'p5-canvas')).toBe('p5-canvas');
    expect(storageNamespace('1', 'p5-canvas')).toBe('p5-canvas:surface-1');
  });

  it('never collides across apps — the bug that showed two surfaces in single-surface examples', () => {
    const keys = [
      warpKey(storageNamespace(DEFAULT_SURFACE_ID, 'single-window')),
      warpKey(storageNamespace(DEFAULT_SURFACE_ID, 'multi-surface')),
      warpKey(storageNamespace('1', 'multi-surface')),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('planeSizeFor', () => {
  it('gives every surface the same height and an aspect-correct width', () => {
    expect(planeSizeFor({ width: 1920, height: 1080 })).toEqual({ width: WORLD_PLANE_HEIGHT * (16 / 9), height: 10 });
    expect(planeSizeFor({ width: 1080, height: 1080 })).toEqual({ width: 10, height: 10 });
  });

  it('is driven by aspect alone, so pixel scale does not change the plane', () => {
    expect(planeSizeFor({ width: 1920, height: 1080 })).toEqual(planeSizeFor({ width: 3840, height: 2160 }));
  });

  it('lets two surfaces of different shapes sample one buffer', () => {
    // The multi-surface example: a 2160x1080 atlas, each half square
    const square = planeSizeFor({ width: 1080, height: 1080 });
    const wholeBuffer = planeSizeFor({ width: 2160, height: 1080 });
    expect(square.width).toBe(10);
    expect(wholeBuffer.width).toBe(20);
  });
});
