import { describe, it, expect } from 'vitest';
import { scopedStorageKey, DEFAULT_SURFACE_ID } from '../core/defaults';

// WarpSurface pulls in three.js, so mirror only the static key composition here
const storageNamespace = (id: string, appId?: string): string | undefined => {
  const surfacePart = id === DEFAULT_SURFACE_ID ? undefined : `surface-${id}`;
  const parts = [appId, surfacePart].filter((part): part is string => !!part);
  return parts.length ? parts.join(':') : undefined;
};

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
