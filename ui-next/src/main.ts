import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import "./style.css";

type View = "copilot" | "playlists";

const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing prototype element: ${selector}`);
  return element;
};

const viewCopy: Record<View, { module: string; code: string; title: string; description: string }> = {
  copilot: {
    module: "COPILOT",
    code: "MODULE 01 / CREATIVE ANALYSIS",
    title: "从现场线索<br /><em>构建下一场演出。</em>",
    description: "解析 Setlist、检索曲库、分析调性。把每一次选曲决策留在同一张工作台。",
  },
  playlists: {
    module: "PLAYLIST ARCHIVE",
    code: "MODULE 02 / MUSIC ARCHIVE",
    title: "让每一份歌单<br /><em>都有清晰的去向。</em>",
    description: "从云端管理到本地导出，保留曲目顺序、来源与试听入口。",
  },
};

const playlistSamples = [
  { code: "YM–001", title: "Peak Hour Reference", count: 24, description: "峰值时段曲目草稿。实际歌单名称、封面和曲目将来自网易云账号。" },
  { code: "YM–002", title: "Melodic Techno Sketch", count: 18, description: "旋律科技舞曲的编排示意。曲目详情区域用于验证密集信息布局。" },
  { code: "YM–003", title: "Warm-up Library", count: 32, description: "暖场曲库的呈现示意。试听与导出操作将在业务迁移阶段接入。" },
];

let toastTimer: number | undefined;

function toast(message: string) {
  const element = $<HTMLDivElement>("#toast");
  element.textContent = message;
  element.hidden = false;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { element.hidden = true; }, 3300);
}

function showView(view: View) {
  for (const button of document.querySelectorAll<HTMLButtonElement>(".nav-item[data-view]")) {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  $<HTMLElement>("#view-copilot").hidden = view !== "copilot";
  $<HTMLElement>("#view-playlists").hidden = view !== "playlists";
  $<HTMLElement>("#current-module").textContent = viewCopy[view].module;
  $<HTMLElement>("#hero-code").textContent = viewCopy[view].code;
  $<HTMLElement>("#hero-title").innerHTML = viewCopy[view].title;
  $<HTMLElement>("#hero-description").textContent = viewCopy[view].description;
  document.title = `YesMusic · ${viewCopy[view].module} / Visual Prototype`;
}

function selectPlaylist(index: number) {
  const sample = playlistSamples[index];
  if (!sample) return;
  for (const button of document.querySelectorAll<HTMLButtonElement>(".playlist-row")) {
    button.classList.toggle("active", Number(button.dataset.playlist) === index);
  }
  $<HTMLElement>("#playlist-file-code").textContent = sample.code;
  $<HTMLElement>("#playlist-title").textContent = sample.title;
  $<HTMLElement>("#playlist-description").textContent = sample.description;
  $<HTMLElement>("#playlist-count").textContent = String(sample.count);
}

function setupInteractions() {
  for (const button of document.querySelectorAll<HTMLButtonElement>(".nav-item[data-view]")) {
    button.addEventListener("click", () => showView(button.dataset.view as View));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>(".nav-item[data-pending]")) {
    button.addEventListener("click", () => toast(`${button.dataset.pending}将在下一轮原型中展开。`));
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>(".playlist-row")) {
    button.addEventListener("click", () => selectPlaylist(Number(button.dataset.playlist)));
  }
  $<HTMLInputElement>("#playlist-filter").addEventListener("input", (event) => {
    const value = (event.target as HTMLInputElement).value.trim().toLowerCase();
    for (const button of document.querySelectorAll<HTMLButtonElement>(".playlist-row")) {
      button.hidden = !button.textContent?.toLowerCase().includes(value);
    }
  });

  const themeButton = $<HTMLButtonElement>("#theme-toggle");
  themeButton.addEventListener("click", () => {
    const dark = document.body.dataset.theme !== "dark";
    document.body.dataset.theme = dark ? "dark" : "light";
    themeButton.querySelector("span")!.textContent = dark ? "LIGHT MODE" : "DARK MODE";
  });

  const composer = $<HTMLTextAreaElement>("#copilot-input");
  const send = () => {
    if (!composer.value.trim()) {
      composer.focus();
      return;
    }
    toast("这是视觉原型；Copilot API 会在功能迁移阶段接入。");
  };
  $<HTMLButtonElement>("#send-demo").addEventListener("click", send);
  composer.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });
  $<HTMLButtonElement>("#new-session").addEventListener("click", () => {
    composer.value = "";
    composer.focus();
    toast("新建会话的视觉位置已确定；数据操作将在迁移阶段接入。");
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-demo-action]")) {
    button.addEventListener("click", () => toast(`${button.dataset.demoAction}将在功能迁移阶段接入。`));
  }
  $<HTMLButtonElement>("#player-toggle").addEventListener("click", () => toast("播放器尚未接入；此处为布局预览。"));
}

function showModelFallback() {
  $<HTMLElement>("#artifact-fallback").hidden = false;
}

function createYesMusicLabel() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 220;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#222822";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#e48a2e";
  context.fillRect(0, 0, 15, canvas.height);
  context.fillStyle = "#f2eee6";
  context.font = "bold 76px Arial, sans-serif";
  context.fillText("YESMUSIC", 44, 112);
  context.font = "bold 30px Arial, sans-serif";
  context.letterSpacing = "5px";
  context.fillText("MUSIC ARCHIVE / 01", 48, 173);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.33, .46),
    new THREE.MeshBasicMaterial({ map: texture, transparent: false, side: THREE.DoubleSide }),
  );
  label.position.set(-1.25, 3.02, .28);
  return label;
}

function setupArtifact() {
  const mount = $<HTMLDivElement>("#artifact-canvas");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  } catch {
    showModelFallback();
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .9;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
  camera.position.set(0.35, 0.3, 5.4);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8e8a7f, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffbd83, 1.2);
  rim.position.set(5, -2, -1);
  scene.add(rim);

  let model: THREE.Object3D | null = null;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  new GLTFLoader().load(
    "/assets/archive-cassette.glb",
    (gltf) => {
      model = gltf.scene;
      model.traverse((node) => {
        if (/Moulded_Lettering|Case_Engraving|Printed_Label|Carbon_Ink/.test(node.name)) {
          node.visible = false;
        }
        if (node.name.startsWith("Frosted_Polymer") && node instanceof THREE.Mesh) {
          const material = (node.material as THREE.MeshPhysicalMaterial).clone();
          material.transmission = 0;
          material.transparent = true;
          material.opacity = .44;
          material.depthWrite = false;
          node.material = material;
        }
      });
      model.add(createYesMusicLabel());
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 3.05 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(scale);
      model.position.copy(center.multiplyScalar(-scale));
      model.rotation.set(-.18, -.22, -.14);
      scene.add(model);
    },
    undefined,
    showModelFallback,
  );

  const resize = () => {
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(mount);
  resize();

  const clock = new THREE.Clock();
  const animate = () => {
    requestAnimationFrame(animate);
    if (document.hidden) return;
    if (model && !reducedMotion.matches) {
      const t = clock.getElapsedTime();
      model.rotation.y = -.22 + Math.sin(t * .36) * .12;
      model.rotation.x = -.18 + Math.sin(t * .25) * .025;
    }
    renderer.render(scene, camera);
  };
  animate();
}

setupInteractions();
setupArtifact();
