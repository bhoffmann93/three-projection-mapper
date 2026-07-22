export const MUTLI_WINDOW_CONFIG = {
  projectionResolution: { width: 1280, height: 800 },
  bufferResOversampling: 1, //increase resolution for warping
  // Controller and projector are one app and must share a calibration, so they
  // share one storage scope — distinct from the other examples on this origin
  appId: 'multi-window',
};

export default MUTLI_WINDOW_CONFIG;
