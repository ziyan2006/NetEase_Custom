import * as THREE from "three";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/** Only the HDR emitter exceeds the threshold; covers and UI stay sharp. */
export class SongGapBloom extends UnrealBloomPass {
  constructor() {
    super(new THREE.Vector2(960, 540), .28, 0, 1.1);
    // Keep the glow near the seam; large mip levels would wash over the UI.
    this.compositeMaterial.uniforms.bloomFactors.value = [.72, .08, 0, 0, 0];
  }
  override setSize(width: number, height: number) { super.setSize(Math.max(1, width / 2), Math.max(1, height / 2)); }
}

/** A recessed emitter in the seam between archive lanes, in world space. */
export class SongGapLight {
  readonly group = new THREE.Group();
  private color = new THREE.Color();
  private white = new THREE.Color(1, 1, 1);
  private available = false;
  private opacity = 0;
  private housing = new THREE.Mesh(new THREE.PlaneGeometry(.5, 1, 1, 96).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: "#222c30", roughness: .6, metalness: .3 }));
  private emitter: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private halo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private core: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor(scene: THREE.Scene) {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 2;
    const context = canvas.getContext("2d")!;
    const fade = context.createLinearGradient(0, 0, 64, 0);
    fade.addColorStop(0, "rgba(255,255,255,0)");
    fade.addColorStop(.2, "rgba(255,255,255,.1)");
    fade.addColorStop(.5, "rgba(255,255,255,1)");
    fade.addColorStop(.8, "rgba(255,255,255,.1)");
    fade.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = fade;
    context.fillRect(0, 0, 64, 2);
    const glowTexture = new THREE.CanvasTexture(canvas);
    const material = (glow = false) => new THREE.MeshBasicMaterial({
      color: "#ffffff", transparent: true, opacity: 0,
      depthWrite: false, depthTest: true, toneMapped: false,
      ...(glow ? { map: glowTexture, blending: THREE.AdditiveBlending } : {}),
    });
    this.emitter = new THREE.Mesh(new THREE.PlaneGeometry(.4, 1, 1, 96).rotateX(-Math.PI / 2), material());
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(.86, 1, 1, 96).rotateX(-Math.PI / 2), material(true));
    this.core = new THREE.Mesh(new THREE.PlaneGeometry(.12, 1, 1, 96).rotateX(-Math.PI / 2), material());
    for (const mesh of [this.emitter, this.halo, this.core]) {
      mesh.position.y = .012;
      mesh.raycast = () => {};
    }
    this.halo.position.y = .014;
    this.core.position.y = .016;
    this.housing.raycast = () => {};
    this.group.name = "song-secondary-gap-light";
    this.group.add(this.housing, this.emitter, this.halo, this.core);
    this.group.visible = false;
    scene.add(this.group);
  }

  setColor(rgb: [number, number, number] | null) {
    this.available = Boolean(rgb);
    if (rgb) this.color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
  }

  update(dt: number, presence: number, x: number, y: number, startZ: number, endZ: number, reduced: boolean,
    heightAt: (progress: number) => number) {
    const target = this.available ? presence : 0;
    this.opacity = THREE.MathUtils.damp(this.opacity, target, reduced ? 30 : 7, dt);
    if (Math.abs(this.opacity - target) < .0001) this.opacity = target;
    this.group.visible = this.opacity > .001;
    this.group.position.set(x, y, (startZ + endZ) / 2);
    const length = Math.max(.62, endZ - startZ);
    for (const mesh of [this.housing, this.emitter, this.halo, this.core]) {
      const positions = mesh.geometry.attributes.position;
      const uv = mesh.geometry.attributes.uv;
      let changed = false;
      for (let index = 0; index < positions.count; index++) {
        const progress = 1 - uv.getY(index);
        const height = heightAt(progress);
        const z = (progress - .5) * length;
        if (Math.abs(positions.getY(index) - height) > .00001 || Math.abs(positions.getZ(index) - z) > .00001) {
          positions.setY(index, height);
          positions.setZ(index, z);
          changed = true;
        }
      }
      if (changed) { positions.needsUpdate = true; mesh.geometry.computeBoundingSphere(); }
    }
    // Dark pigments still produce a bright emitter. Normalize brightness,
    // keeping the secondary hue; the narrow hot core drives optical bloom.
    const peak = Math.max(.015, this.color.r, this.color.g, this.color.b);
    this.emitter.material.color.copy(this.color).multiplyScalar(2.3 / peak);
    this.halo.material.color.copy(this.color).multiplyScalar(.85 / peak);
    this.core.material.color.copy(this.color).multiplyScalar(1 / peak).lerp(this.white, .1).multiplyScalar(2.8);
    this.emitter.material.opacity = this.opacity;
    this.core.material.opacity = this.opacity;
    this.halo.material.opacity = this.opacity * .28;
  }

  getStats() {
    return { visible: this.group.visible, rgb: this.color.getHexString(),
      position: this.group.position.toArray(), width: .4, opacity: this.opacity };
  }
}
