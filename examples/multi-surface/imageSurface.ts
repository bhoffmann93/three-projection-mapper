/*
The surface that samples its own image rather than the shared atlas.

Both windows run this: a texture cannot cross a BroadcastChannel, so each loads
its own copy and binds it to the surface with the agreed id. Media is the app's
business — the library only cares that a surface has a texture.

Binding once at startup is not enough where surfaces arrive over the wire. A
surface removed and re-added on the controller is rebuilt from scratch on the
projector, with the shared buffer as its texture, so the binding has to be
re-applied whenever the surface list changes.
*/

import * as THREE from 'three';
import type { ProjectionMapper, WarpSurface } from '../../src/lib';
import { MULTI_SURFACE_CONFIG } from './multi-surface.config';

export interface ImageSurfaceOptions {
  /** Re-bind whenever the surface list changes. For windows that receive surfaces by sync. */
  rebindOnSurfacesChanged?: boolean;
  /** Called only when this window created the surface itself */
  onCreated?: (surface: WarpSurface) => void;
}

export function loadImageSurface(mapper: ProjectionMapper, options: ImageSurfaceOptions = {}): void {
  new THREE.TextureLoader().load(MULTI_SURFACE_CONFIG.imagePath, (imageTexture) => {
    const bind = (): WarpSurface | null => {
      const surface = mapper.getSurface(MULTI_SURFACE_CONFIG.imageSurfaceId);
      if (!surface) return null;
      if (surface.getTexture() !== imageTexture) mapper.setTexture(imageTexture, surface.id);
      return surface;
    };

    if (options.rebindOnSurfacesChanged) {
      mapper.onSurfacesChanged(() => bind());
    }

    if (bind()) return;

    // The surface takes its shape from the loaded image's real dimensions, not from
    // the buffer's — swap in a non-square image and the plane follows it
    const created = mapper.addSurface({
      id: MULTI_SURFACE_CONFIG.imageSurfaceId,
      resolution: { width: imageTexture.image.width, height: imageTexture.image.height },
    });
    if (!created) return; // a single-surface mapper has nowhere to put it
    mapper.setTexture(imageTexture, created.id); // only this surface
    options.onCreated?.(created);
  });
}
