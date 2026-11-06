// ==========================================================================
// HAVAKARE — fleetStage.js
// "Her çekime doğru drone." kartlarındaki 3D dronlar.
//
// Dört kart için dört WebGL bağlamı AÇILMAZ: tek ekran dışı renderer vardır, her
// karede yalnızca ekranda görünen kartlar sırayla çizilir ve sonuç o kartın kendi
// 2D tuvaline kopyalanır. Tuval kartın içinde olduğu için sayfayla birlikte doğal
// kayar; ek model indirmesi yoktur (Mini/Mavic önbellekten klonlanır, FPV ve Avata
// kodla kurulur — bkz. droneBuilds.js).
//
// Kartın fotoğrafı yerinde kalır: 3D hazır olana kadar (ya da WebGL yoksa) o görünür.
// Çizim, main.js'in tek döngüsüne stage olarak bağlıdır; kare hızı ve kalite düşürme
// kararları diğer dronlarla ortaktır.
// ==========================================================================

import * as THREE from 'three';
import { createStudioLights } from './scene.js';
import {
  loadDroneRig,
  MODEL_URL_MINI3,
  MODEL_URL_MAVIC3,
  MANUAL_ORIENTATION_OFFSET_Y,
  MANUAL_ORIENTATION_OFFSET_Y_MAVIC3,
} from './droneModel.js';
import { buildFpvDrone, buildAvataDrone } from './droneBuilds.js';
import { GL } from './device.js';

const CAMERA_FOV_DEG = 22;
const CAMERA_ELEVATION_DEG = 20;
const PAD_Y = -0.44; // pistin yüksekliği (dron merkezinin altında)
const AUTO_YAW = 0.32; // rad/sn — kendi kendine yavaş dönüş
const DRAG_YAW = 0.012; // sürüklenen piksel başına rad

const LOADERS = {
  fpv: () => Promise.resolve(buildFpvDrone()),
  avata: () => Promise.resolve(buildAvataDrone()),
  mavic: () => loadDroneRig(MODEL_URL_MAVIC3, MANUAL_ORIENTATION_OFFSET_Y_MAVIC3),
  mini: () => loadDroneRig(MODEL_URL_MINI3, MANUAL_ORIENTATION_OFFSET_Y),
};

// Dronun altındaki iniş pisti: ince halka + dört işaret + yumuşak gölge.
function createPad() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const m = size / 2;
  g.strokeStyle = 'rgba(32,32,30,0.34)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(m, m, 232, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    g.beginPath();
    g.moveTo(m + Math.cos(a) * 212, m + Math.sin(a) * 212);
    g.lineTo(m + Math.cos(a) * 252, m + Math.sin(a) * 252);
    g.stroke();
  }
  const ringTex = new THREE.CanvasTexture(c);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  ringTex.anisotropy = 4;

  const s = document.createElement('canvas');
  s.width = s.height = 256;
  const sg = s.getContext('2d');
  const grad = sg.createRadialGradient(128, 128, 8, 128, 128, 128);
  grad.addColorStop(0, 'rgba(20,20,18,0.5)');
  grad.addColorStop(0.55, 'rgba(20,20,18,0.2)');
  grad.addColorStop(1, 'rgba(20,20,18,0)');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 256, 256);
  const shadowTex = new THREE.CanvasTexture(s);
  shadowTex.colorSpace = THREE.SRGBColorSpace;

  const flat = (texture, width) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  };
  const group = new THREE.Group();
  group.position.y = PAD_Y;
  const ring = flat(ringTex, 1.9);
  const shadow = flat(shadowTex, 1.7);
  shadow.position.y = 0.002;
  group.add(ring, shadow);
  return { group, shadow };
}

export async function initFleetStage() {
  const medias = [...document.querySelectorAll('.fleet-media[data-fleet-model]')];
  if (!medias.length) return null;

  const renderer = new THREE.WebGLRenderer({ antialias: GL.aa, alpha: true, stencil: false, powerPreference: GL.power });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  createStudioLights(scene);
  const pad = createPad();
  scene.add(pad.group);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 4 / 3, 0.1, 30);
  let quality = 1;
  let bufW = 0;
  let bufH = 0;

  function fit() {
    const r = medias[0].getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, GL.dpr)) * quality;
    bufW = Math.round(r.width * dpr);
    bufH = Math.round(r.height * dpr);
    renderer.setPixelRatio(1);
    renderer.setSize(bufW, bufH, false);
    camera.aspect = r.width / r.height;
    // Dron + pist kadraja sığsın: dar kartta geri çekil.
    const halfTan = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV_DEG / 2));
    const dist = Math.max(0.74 / halfTan, 1.08 / (halfTan * camera.aspect));
    const el = THREE.MathUtils.degToRad(CAMERA_ELEVATION_DEG);
    camera.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
    camera.lookAt(0, -0.1, 0);
    camera.updateProjectionMatrix();
    views.forEach((v) => {
      v.canvas.width = bufW;
      v.canvas.height = bufH;
    });
  }

  const views = medias.map((media, i) => {
    const canvas = document.createElement('canvas');
    canvas.className = 'fleet-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    media.appendChild(canvas);
    const view = {
      media,
      canvas,
      ctx: canvas.getContext('2d'),
      holder: new THREE.Group(),
      tilt: new THREE.Group(),
      animateProps: null,
      ready: false,
      visible: false,
      yaw: THREE.MathUtils.degToRad(35 + i * 70),
      spin: 0, // sürükleme sonrası kalan dönüş hızı
      dragging: false,
      lastX: 0,
      lastT: 0,
      phase: i * 1.7,
    };
    view.holder.add(view.tilt);
    view.holder.visible = false;
    scene.add(view.holder);
    return view;
  });

  fit();

  views.forEach((view) => {
    LOADERS[view.media.dataset.fleetModel]()
      .then((rig) => {
        view.tilt.add(rig.orientationGroup);
        view.animateProps = rig.animateProps;
        view.ready = true;
      })
      .catch((err) => console.warn('Fleet drone failed:', err)); // kartta fotoğraf kalır

    // Parmakla / fareyle yatay sürükleme dronu çevirir; dikey kaydırma sayfada kalır
    // (touch-action: pan-y, bkz. styles.css).
    const { canvas } = view;
    canvas.addEventListener('pointerdown', (e) => {
      view.dragging = true;
      view.lastX = e.clientX;
      view.spin = 0;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!view.dragging) return;
      const d = (e.clientX - view.lastX) * DRAG_YAW;
      view.lastX = e.clientX;
      view.yaw += d;
      view.spin = d * 60;
    });
    const release = () => { view.dragging = false; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const view = views.find((v) => v.media === entry.target);
      view.visible = entry.isIntersecting;
      view.lastT = 0;
    });
  }, { rootMargin: '80px 0px 80px 0px' });
  medias.forEach((m) => io.observe(m));

  const resizeObserver = new ResizeObserver(fit);
  resizeObserver.observe(medias[0]);

  function drawView(view, now) {
    const dt = view.lastT ? Math.min((now - view.lastT) / 1000, 0.05) : 0;
    view.lastT = now;
    const t = now / 1000 + view.phase;

    if (!view.dragging) {
      view.spin *= Math.exp(-2.4 * dt);
      view.yaw += (AUTO_YAW + view.spin) * dt;
    }
    // Havada asılı duran dronun küçük salınımı; sürüklerken dönüş yönüne hafif yatar.
    const bob = Math.sin(t * 1.15) * 0.018 + Math.sin(t * 2.3) * 0.006;
    view.holder.position.y = bob;
    view.holder.rotation.y = view.yaw;
    view.tilt.rotation.z = Math.sin(t * 0.8) * 0.018;
    view.tilt.rotation.x = Math.sin(t * 0.63 + 1) * 0.02 + THREE.MathUtils.clamp(view.spin * 0.02, -0.12, 0.12);
    pad.shadow.scale.setScalar(1 - bob * 1.6);
    if (view.animateProps) view.animateProps();

    view.holder.visible = true;
    renderer.render(scene, camera);
    view.holder.visible = false;

    view.ctx.clearRect(0, 0, bufW, bufH);
    view.ctx.drawImage(renderer.domElement, 0, 0);
    if (!view.live) {
      view.live = true;
      view.media.classList.add('is-live');
    }
  }

  function render() {
    if (!bufW) return;
    const now = performance.now();
    for (let i = 0; i < views.length; i++) {
      const v = views[i];
      if (v.ready && v.visible) drawView(v, now);
    }
  }

  function setQualityScale(scale) {
    if (scale === quality) return;
    quality = scale;
    fit();
  }

  function destroy() {
    io.disconnect();
    resizeObserver.disconnect();
    renderer.dispose();
    views.forEach((v) => v.canvas.remove());
  }

  return { render, destroy, setQualityScale };
}
