import * as THREE from "three";

const surfaces: Record<string, string> = {
  Frosted_Polymer: "#626b70", Ivory_Edges: "#687277", Optical_Diffuser: "#192226",
  Titanium_Fasteners: "#b1b9bb", Index_Inlay: "#c6a36b", Printed_Label: "#303a3e",
  Subsurface_Optics: "#939e9f", Optical_Edges: "#bbc3bc", Carbon_Ink: "#b6bdb8",
};
/** Extend existing optical shaders; one float per instance avoids new meshes or passes. */
export function themeMaterial(material: THREE.Material, name: string, instanced = false, subduedIndex = { value: 0 }, whiteBalance = { value: 0 }) {
  const amount = { value: 0 };
  const before = material.onBeforeCompile;
  const cache = material.customProgramCacheKey.bind(material)();
  const color = new THREE.Color(surfaces[name] ?? (name.includes("Orange") ? "#bb8850" : "#969f9f"));
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.rhineTheme = amount;
    shader.uniforms.rhineWhiteBalance = whiteBalance;
    shader.uniforms.rhineDarkSurface = { value: color };
    shader.uniforms.rhineSubduedIndex = subduedIndex;
    if (instanced) {
      shader.vertexShader = "attribute float archiveTheme; varying float vRhineTheme;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvRhineTheme = archiveTheme;");
      shader.fragmentShader = "varying float vRhineTheme;\n" + shader.fragmentShader;
    }
    shader.fragmentShader = "uniform float rhineTheme; uniform float rhineWhiteBalance; uniform vec3 rhineDarkSurface; uniform float rhineSubduedIndex;\n" + shader.fragmentShader;
    const mix = instanced ? "vRhineTheme" : "rhineTheme";
    const printed = name === "Printed_Canvas";
    const anchor = printed ? "#include <opaque_fragment>" : "#include <roughnessmap_fragment>";
    const dark = printed
      ? "mix(vec3(0.023, 0.032, 0.037), vec3(0.78, 0.78, 0.71), 1.0 - smoothstep(0.12, 0.65, dot(diffuseColor.rgb, vec3(.2126,.7152,.0722))))"
      : name === "Frosted_Polymer" && !instanced
        ? "mix(rhineDarkSurface, vec3(0.92, 0.96, 0.97), glassRevealAtHeight(archiveClarity, vArchiveHeight))"
        : name === "Index_Inlay" ? "mix(rhineDarkSurface, vec3(0.030, 0.042, 0.048), rhineSubduedIndex)" : "rhineDarkSurface";
    const output = printed ? "outgoingLight" : "diffuseColor.rgb";
    // Neutralize pigment before lighting, so colored illumination keeps its hue.
    const neutral = printed ? "" : `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(.2126, .7152, .0722))), rhineWhiteBalance * (1.0 - ${mix}) * .95);\n`;
    shader.fragmentShader = shader.fragmentShader.replace(anchor, `${neutral}${output} = mix(${output}, ${dark}, ${mix});\n${anchor}`);
    if (!printed) shader.fragmentShader = shader.fragmentShader.replace(
      "#include <transmission_fragment>",
      THREE.ShaderChunk.transmission_fragment.replace("material.attenuationColor = attenuationColor;", "material.attenuationColor = mix(attenuationColor, vec3(1.0), rhineWhiteBalance);"),
    );
  };
  material.customProgramCacheKey = () => `${cache}-rhine-theme-${name}-${instanced}`;
  return amount;
}

export type SongLighting = { color: THREE.Color; strength: number; keyColor: THREE.Color; keyStrength: number };
type Baseline = { background: THREE.Color; fog?: THREE.Color; intensity: number; exposure: number; lights: { light: THREE.Light; color: THREE.Color; position: THREE.Vector3; groundColor?: THREE.Color; intensity: number }[]; floor?: { material: THREE.MeshStandardMaterial; color: THREE.Color } };
const scenes = new WeakMap<THREE.Scene, Baseline>();
const background = new THREE.Color("#11181b"), floorColor = new THREE.Color("#192125"), mistColor = new THREE.Color("#263136");
const whiteBackground = new THREE.Color("#f3f4f4"), whiteFloor = new THREE.Color("#d7d9d8");
const neutralLamp = new THREE.Color("#ffffff"), neutralBounce = new THREE.Color("#b6bcc3");
const songKeyPosition = new THREE.Vector3(-8, 14, 6), songFillPosition = new THREE.Vector3(8, 7, 10);
export function themeEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, amount: number, whiteBalance = 0, songLighting?: SongLighting) {
  let baseline = scenes.get(scene);
  if (!baseline) {
    const lights: Baseline["lights"] = [];
    scene.traverse(object => {
      if (object instanceof THREE.Light) lights.push({ light: object, color: object.color.clone(), position: object.position.clone(),
        groundColor: object instanceof THREE.HemisphereLight ? object.groundColor.clone() : undefined, intensity: object.intensity });
    });
    const floor = scene.getObjectByName("archive-floor") as THREE.Mesh | undefined;
    const material = floor?.material as THREE.MeshStandardMaterial | undefined;
    baseline = { background: (scene.background as THREE.Color).clone(), fog: scene.fog?.color.clone(), intensity: scene.environmentIntensity,
      exposure: renderer.toneMappingExposure, lights, floor: material ? { material, color: material.color.clone() } : undefined };
    scenes.set(scene, baseline);
  }
  (scene.background as THREE.Color).copy(baseline.background).lerp(whiteBackground, whiteBalance).lerp(background, amount);
  if (scene.fog && baseline.fog) scene.fog.color.copy(baseline.fog).lerp(whiteBackground, whiteBalance).lerp(mistColor, amount);
  if (baseline.floor) baseline.floor.material.color.copy(baseline.floor.color).lerp(whiteFloor, whiteBalance).lerp(floorColor, amount);
  const activation = Math.min(1, ((songLighting?.keyStrength ?? 0) + (songLighting?.strength ?? 0)) * 4);
  scene.environmentIntensity = THREE.MathUtils.lerp(baseline.intensity, .32, amount) * (1 - .35 * activation);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(baseline.exposure, .98, Math.max(amount, .7 * activation));
  for (const { light, color, position, groundColor, intensity } of baseline.lights) {
    light.color.copy(color).lerp(neutralLamp, whiteBalance);
    light.position.copy(position);
    if (light instanceof THREE.HemisphereLight && groundColor) light.groundColor.copy(groundColor).lerp(neutralBounce, whiteBalance);
    light.intensity = intensity * (1 - .35 * amount);
    if (light instanceof THREE.HemisphereLight && songLighting) {
      // Colored bounce in the shadows, neutral highlights above it.
      light.color.lerp(songLighting.keyColor, songLighting.keyStrength * .28);
      light.groundColor.lerp(songLighting.keyColor, songLighting.keyStrength * .8);
      light.intensity *= 1 - .22 * activation;
    }
    if (light.name === "archive-key" && songLighting) {
      const strength = songLighting.keyStrength * (1 - .15 * amount);
      light.position.lerp(songKeyPosition, activation);
      light.color.lerp(songLighting.keyColor, Math.min(.96, strength * 1.6));
      light.intensity *= 1 + .35 * strength;
    }
    if (light.name === "archive-fill" && songLighting) {
      // The secondary hue lights facing surfaces; artwork and UI stay unfiltered.
      const strength = songLighting.strength * (.65 + .35 * amount);
      light.position.lerp(songFillPosition, activation);
      light.color.lerp(songLighting.color, Math.min(.9, strength * 1.8));
      light.intensity *= (1 - .25 * activation) * (1 + 1.2 * strength);
    }
  }
}
