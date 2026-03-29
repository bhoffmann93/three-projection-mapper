/*
Perspective Vertex Shader
-------------------------
Applies a perspective homography (projective transform) to each vertex, matching
the same PerspT matrix used to position the perspective drag handles in world space. 
Needed to match the perspective uv distortion of the other vertex shader.

A homography maps flat-plane world coordinates to warped world coordinates via a
3×3 matrix in homogeneous form. For a point p = [x, y, 1]:

    h = H * p  →  worldPos = h.xy / h.z  (perspective divide)

UV coordinates (0–1) are first converted to flat world space before applying H,
because the homography was computed from physical world-space corner coordinates,
not normalised UV space.
*/

varying vec2 vUv;

uniform mat3 uHomography;
uniform vec2 uFlatPlaneSize;
uniform bool uShouldWarp;

void main() {
    vUv = uv;
    if(!uShouldWarp) {
        // No warp active: render as a flat plane matching the unwarped content plane
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        return;
    }
    vec2 flatWorld = (uv - 0.5) * uFlatPlaneSize; // remap uv [0,1] → three.js world space centered at origin, e.g. [-8.89, 8.89] x [-5, 5] for 16:9
    vec3 h = uHomography * vec3(flatWorld, 1.0);
    vec2 worldPos = h.xy / h.z; //perspective divide
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 0.0, 1.0);
}
