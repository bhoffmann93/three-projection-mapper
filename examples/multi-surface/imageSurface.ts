/*
The surface that samples its own image rather than the shared atlas. Both windows
run this: a texture cannot cross a BroadcastChannel, so each loads its own copy
and binds it to the surface with the agreed id. Media is the app's business —
the library only cares that a surface has a texture.
*/

import * as THREE from 'three';
import type { ProjectionMapper } from '../../src/lib';
import type { WarpSurface } from '../../src/lib';
import { MULTI_SURFACE_CONFIG } from './multi-surface.config';

export function loadImageSurface(
  mapper: ProjectionMapper,
  onReady: (surface: WarpSurface, isNew: boolean) => void,
): void {
  new THREE.TextureLoader().load(MULTI_SURFACE_CONFIG.imagePath, (imageTexture) => {
    // Left at the loader's default NoColorSpace on purpose. projection.frag does no
    // output conversion, so the whole path passes raw values through; marking this
    // sRGB would have the GPU decode it to linear with nothing to re-encode it,
    // and the image would render dark next to the atlas surfaces.

    // The surface is created from the loaded image's real dimensions, so its plane
    // is 4:3 while the atlas surfaces stay square
    const existing = mapper.getSurface(MULTI_SURFACE_CONFIG.imageSurfaceId);
    const surface =
      existing ??
      mapper.addSurface({
        id: MULTI_SURFACE_CONFIG.imageSurfaceId,
        resolution: { width: imageTexture.image.width, height: imageTexture.image.height },
      });

    mapper.setTexture(imageTexture, surface.id); // only this surface
    onReady(surface, !existing);
  });
}
