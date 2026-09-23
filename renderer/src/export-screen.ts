import * as THREE from "three";

export type ExportScreenClarity = { value: number };

export function createExportScreenMesh(
  texture: THREE.Texture,
  clarity: ExportScreenClarity,
) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: "#ffffff",
    toneMapped: false,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.exportScreenClarity = clarity;
    shader.fragmentShader = `uniform float exportScreenClarity;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#ifdef USE_MAP

\t// Preserve the frosted reveal without smearing small screen text.
\tvec2 exportBlur = vec2((1.0 - exportScreenClarity) * 0.005, 0.0);
\tvec2 exportBlurY = vec2(0.0, exportBlur.x);
\tvec4 exportCenter = texture2D(map, vMapUv);
\tvec4 exportFrost = exportCenter * 0.24
\t\t+ texture2D(map, vMapUv + exportBlur) * 0.095
\t\t+ texture2D(map, vMapUv - exportBlur) * 0.095
\t\t+ texture2D(map, vMapUv + exportBlurY) * 0.095
\t\t+ texture2D(map, vMapUv - exportBlurY) * 0.095
\t\t+ texture2D(map, vMapUv + exportBlur + exportBlurY) * 0.095
\t\t+ texture2D(map, vMapUv + exportBlur - exportBlurY) * 0.095
\t\t+ texture2D(map, vMapUv - exportBlur + exportBlurY) * 0.095
\t\t+ texture2D(map, vMapUv - exportBlur - exportBlurY) * 0.095;
\tvec4 sampledDiffuseColor = mix(exportFrost, exportCenter, exportScreenClarity);
\tdiffuseColor *= sampledDiffuseColor;
\tdiffuseColor.rgb = mix(diffuseColor.rgb * 0.84 + vec3(0.16), diffuseColor.rgb, exportScreenClarity);

#endif`,
    );
  };
  material.customProgramCacheKey = () => "yesmusic-export-screen-frosted";

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.18, 1.78), material);
  screen.position.set(0.1, 1.82, 0.258);
  screen.renderOrder = 20;
  screen.userData.exportScreen = true;
  screen.userData.exportScreenClarity = clarity;
  return screen;
}
