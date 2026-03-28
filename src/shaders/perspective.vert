/*
Perspective Vertex Shader
-------------------------
Applies a perspective homography (projective transform) to each vertex, matching
the same PerspT matrix used to position the drag handles in world space.

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

void main() {
    vUv = uv;
    vec2 flatWorld = (uv - 0.5) * uFlatPlaneSize;
    vec3 h = uHomography * vec3(flatWorld, 1.0);
    vec2 worldPos = h.xy / h.z;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 0.0, 1.0);
}
