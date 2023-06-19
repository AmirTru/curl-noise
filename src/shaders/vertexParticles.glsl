varying vec2 vUv;
varying vec3 vColor;

uniform float uTime;
uniform sampler2D positionTexture;

attribute vec2 reference;
attribute float randomSize;

void main() {
    vUv = reference;
    vec3 pos = texture2D(positionTexture, vUv).xyz;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    gl_PointSize = 10. * (1.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;

}
