// ==========================================================================
// HAVAKARE — droneBuilds.js
// Envanterdeki FPV Aksiyon Dronu ve Avata 360 için GLB dosyası yok. Bu iki dron
// kodla (three.js geometrileriyle) kurulur: indirme yok, dosya boyutu birkaç KB.
// Biçimleri images/fpv-aksiyon-drone.jpg ve images/avata-360.webp fotoğraflarına
// göre verildi. Ölçü birimi serbest; finish() en büyük boyutu GLB'lerle aynı
// değere (1.6) getirir. Burun +Z yönündedir (droneModel.js ile aynı).
//
// Pervaneler droneProps.js'in pivot sözleşmesini kullanır (userData.isPropPivot +
// propDir), yani createPropAnimator ile Mini 3 Pro'yla aynı hızda döner.
//
// PERFORMANS: Modeller yüzlerce küçük parçadan oluşur ama finish() dönmeyen tüm
// parçaları malzemeye göre birleştirir; dron başına yalnızca birkaç çizim çağrısı kalır.
// ==========================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPropAnimator } from './droneProps.js';

const NORMALIZED_SIZE = 1.6;

/**
 * Yumuşak kutu ışıklı küçük bir stüdyo ortamı üretir (PMREM). Metal ve cam yüzeyler
 * yansıyacak bir şey bulamazsa siyah görünür; bu ortam onlara stüdyo yansıması verir.
 */
export function createStudioEnv(renderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(20, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x4a4a48, side: THREE.BackSide })
  ));
  const panel = (w, h, x, y, z, power) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(power, power, power), side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  panel(14, 8, 0, 12, 2, 7); // üst tepe ışığı
  panel(5, 12, 12, 3, 6, 5); // sağ şerit
  panel(4, 10, -13, 2, 3, 3); // sol dolgu
  panel(10, 3, 0, 2, -14, 4); // arka kenar ışığı
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  return texture;
}

function materialFactory(env) {
  return (color, roughness, metalness = 0, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, envMap: env, envMapIntensity: 0.75, ...extra });
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

/** a ve b noktaları arasında ince çubuk (destek, tel, anten). */
function rod(a, b, radius, material, sides = 8) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, A.distanceTo(B), sides), material);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}

function roundedRectShape(w, l, r) {
  const s = new THREE.Shape();
  const x = w / 2;
  const y = l / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}

function slotPath(cx, cy, w, l) {
  const r = Math.min(w, l) * 0.45;
  const p = new THREE.Path();
  const x = w / 2;
  const y = l / 2;
  p.moveTo(cx - x + r, cy - y);
  p.lineTo(cx + x - r, cy - y);
  p.quadraticCurveTo(cx + x, cy - y, cx + x, cy - y + r);
  p.lineTo(cx + x, cy + y - r);
  p.quadraticCurveTo(cx + x, cy + y, cx + x - r, cy + y);
  p.lineTo(cx - x + r, cy + y);
  p.quadraticCurveTo(cx - x, cy + y, cx - x, cy + y - r);
  p.lineTo(cx - x, cy - y + r);
  p.quadraticCurveTo(cx - x, cy - y, cx - x + r, cy - y);
  return p;
}

/** Şekli yatay plakaya çevirir: şeklin Y'si +Z'ye, kalınlık aşağı (-Y) doğru. Kenarlar pahlı. */
function plateGeometry(shape, depth, bevel = 0.003, curveSegments = 10) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  g.rotateX(Math.PI / 2);
  return g;
}

/** Köşeleri yuvarlatılmış kutu (kalıp plastik parçalar için). */
function softBox(w, h, d, r, material, x = 0, y = 0, z = 0) {
  const inner = Math.max(r * 1.2, 0.001);
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w - r * 2, d - r * 2, inner), {
    depth: h - r * 2,
    curveSegments: 6,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: 4,
  });
  g.rotateX(Math.PI / 2);
  g.translate(0, h / 2 - r, 0);
  return mesh(g, material, x, y, z);
}

// Karbon fiber 2×2 örgü dokusu.
function carbonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#121214';
  g.fillRect(0, 0, 128, 128);
  const cell = 16;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const warp = ((x + y * 3) % 4) < 2;
      const gr = warp
        ? g.createLinearGradient(x * cell, 0, (x + 1) * cell, 0)
        : g.createLinearGradient(0, y * cell, 0, (y + 1) * cell);
      gr.addColorStop(0, '#17171a');
      gr.addColorStop(0.5, '#38383e');
      gr.addColorStop(1, '#17171a');
      g.fillStyle = gr;
      g.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 9); // plakaların UV'si dünya ölçüsünde
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Gerçek pervane kanadı: kesitler boyunca kamburlu kanat profili, kökten uca azalan
 * burulma açısı ve geriye süpürülmüş uç. +X yönüne uzanır. dir dönüş yönüne göre
 * hücum kenarını doğru tarafa çevirir.
 */
function bladeGeometry({ radius, chord, root, dir, twistRoot = 0.52, twistTip = 0.13, sweep = 0.5 }) {
  const N = 16; // kesit sayısı
  const M = 10; // kesit başına nokta
  const pos = [];
  const idx = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const r = root + t * (radius - root);
    const c = chord * Math.pow(Math.sin(Math.PI * (0.14 + 0.8 * t)), 0.75) * Math.sqrt(Math.max(0.0004, 1 - Math.pow(t, 7)));
    const tw = -dir * (twistRoot + (twistTip - twistRoot) * t);
    const zc = dir * sweep * chord * t * t;
    for (let k = 0; k < M; k++) {
      const a = (k / M) * Math.PI * 2;
      const u = 0.5 * Math.cos(a);
      const z = u * c;
      const y = 0.055 * c * Math.sin(a) + 0.05 * c * (1 - 4 * u * u);
      pos.push(r, z * Math.sin(tw) + y * Math.cos(tw), z * Math.cos(tw) - y * Math.sin(tw) + zc);
    }
  }
  for (let i = 0; i < N - 1; i++) {
    for (let k = 0; k < M; k++) {
      const a = i * M + k;
      const b = i * M + ((k + 1) % M);
      const c2 = a + M;
      const d = b + M;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Kanatlar + göbek + somun. Pervane pivotu (droneProps.js sözleşmesi). */
function propeller({ radius, chord, blades, material, hubMaterial, nutMaterial, dir, root = 0.03 }) {
  const pivot = new THREE.Group();
  pivot.userData.isPropPivot = true;
  pivot.userData.propDir = dir;
  const geo = bladeGeometry({ radius, chord, root, dir });
  for (let i = 0; i < blades; i++) {
    const blade = new THREE.Mesh(geo, material);
    blade.rotation.y = (i / blades) * Math.PI * 2;
    pivot.add(blade);
  }
  pivot.add(mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.03, 24), hubMaterial));
  pivot.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 6), nutMaterial, 0, 0.024, 0));
  return pivot;
}

/**
 * Parçaları malzemeye göre birleştirir (dönen pervaneler hariç), ortalar ve boyutlandırır.
 * Sonuç GLB rig'leriyle aynı biçimdedir: { orientationGroup, animateProps }.
 */
function finish(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const byMaterial = new Map();
  const statics = [];
  const collect = (node) => {
    if (node.userData.isPropPivot) return;
    if (node.isMesh) statics.push(node);
    node.children.forEach(collect);
  };
  collect(root);
  statics.forEach((m) => {
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    Object.keys(g.attributes).forEach((k) => { if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); });
    if (!byMaterial.has(m.material)) byMaterial.set(m.material, []);
    byMaterial.get(m.material).push(g);
  });

  const out = new THREE.Group();
  byMaterial.forEach((list, material) => out.add(new THREE.Mesh(mergeGeometries(list), material)));
  const pivots = [];
  root.traverse((n) => { if (n.userData.isPropPivot) pivots.push(n); });
  pivots.forEach((p) => out.attach(p));
  out.position.sub(center);

  const group = new THREE.Group();
  group.add(out);
  group.scale.setScalar(NORMALIZED_SIZE / Math.max(size.x, size.y, size.z));
  return { orientationGroup: group, animateProps: createPropAnimator(group) };
}

/** Fırçasız motor: taban, sargı halkası, soğutma yarıklı çan, cıvatalar. */
function addBrushlessMotor(root, x, z, y, { base, band, bell, slot, bolt }) {
  root.add(mesh(new THREE.CylinderGeometry(0.066, 0.07, 0.02, 32), base, x, y + 0.01, z));
  root.add(mesh(new THREE.CylinderGeometry(0.056, 0.058, 0.016, 32), slot, x, y + 0.028, z));
  root.add(mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.012, 32), band, x, y + 0.042, z));
  root.add(mesh(new THREE.CylinderGeometry(0.058, 0.065, 0.044, 32), bell, x, y + 0.07, z));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const s = mesh(new THREE.BoxGeometry(0.03, 0.004, 0.016), slot, x + Math.cos(a) * 0.036, y + 0.0925, z + Math.sin(a) * 0.036);
    s.rotation.y = -a;
    root.add(s);
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    root.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 8), bolt, x + Math.cos(a) * 0.056, y + 0.022, z + Math.sin(a) * 0.056));
  }
}

// --------------------------------------------------------------------------
// FPV: gerçek X şasi, delikli ince uzun karbon gövde, öne eğik kamera kafesi, üstte
// aksiyon kamerası yuvası, kolları bağlayan ince destekler, arkada iki anten, turkuaz
// halkalı motorlar, yarı saydam füme 3 kanatlı pervaneler.
// --------------------------------------------------------------------------
export function buildFpvDrone(env) {
  const std = materialFactory(env);
  const root = new THREE.Group();
  const carbon = std(0xffffff, 0.36, 0.35, { map: carbonTexture() });
  const black = std(0x0e0e10, 0.42, 0.45);
  const rubber = std(0x161618, 0.82);
  const alu = std(0x34343a, 0.3, 0.9);
  const steel = std(0x9a9ca0, 0.28, 1);
  const teal = std(0x27a3b4, 0.3, 0.75);
  const glass = std(0x0a1820, 0.04, 1, { envMapIntensity: 1.6 });
  const propMat = std(0x34383a, 0.3, 0.05, { transparent: true, opacity: 0.74, side: THREE.DoubleSide, envMapIntensity: 0.45 });

  // Kol: gövdede geniş, uca doğru incelir, motor ucunda yuvarlak yuva; içinde hafifletme yarığı
  const armLen = 0.74;
  const armShape = new THREE.Shape();
  armShape.moveTo(0, -0.056);
  armShape.lineTo(armLen - 0.08, -0.03);
  armShape.absarc(armLen, 0, 0.08, Math.PI + 0.38, Math.PI - 0.38, false);
  armShape.lineTo(0, 0.056);
  armShape.closePath();
  armShape.holes.push(slotPath(0.3, 0, 0.2, 0.024));
  const armGeo = plateGeometry(armShape, 0.024, 0.002, 18);

  const corners = [
    { x: 1, z: 1, dir: -1 },
    { x: -1, z: 1, dir: 1 },
    { x: 1, z: -1, dir: 1 },
    { x: -1, z: -1, dir: -1 },
  ];
  const motorParts = { base: alu, band: teal, bell: black, slot: rubber, bolt: steel };
  const ends = {};
  corners.forEach(({ x, z, dir }) => {
    const ang = Math.atan2(z, x);
    const arm = new THREE.Mesh(armGeo, carbon);
    arm.rotation.y = -ang;
    arm.position.y = 0.026;
    root.add(arm);

    const mx = Math.cos(ang) * armLen;
    const mz = Math.sin(ang) * armLen;
    ends[`${x},${z}`] = [Math.cos(ang) * 0.5, 0.012, Math.sin(ang) * 0.5];
    addBrushlessMotor(root, mx, mz, 0.03, motorParts);
    // Motor altındaki iniş takozu
    root.add(softBox(0.07, 0.06, 0.09, 0.012, rubber, mx, -0.03, mz));

    const prop = propeller({
      radius: 0.43, chord: 0.1, blades: 3, material: propMat, hubMaterial: alu, nutMaterial: steel, dir, root: 0.03,
    });
    prop.position.set(mx, 0.138, mz);
    root.add(prop);
  });

  // Yan destekler: ön ve arka kolu birbirine bağlayan ince karbon çubuklar
  root.add(rod(ends['1,1'], ends['1,-1'], 0.0065, rubber));
  root.add(rod(ends['-1,1'], ends['-1,-1'], 0.0065, rubber));

  // Üst ve alt plaka: yuvarlak köşeli, sıra sıra hafifletme delikli
  const plate = roundedRectShape(0.27, 0.84, 0.03);
  [[-0.27, 0.09], [-0.12, 0.13], [0.06, 0.13], [0.22, 0.09]].forEach(([cy, l]) => {
    plate.holes.push(slotPath(-0.056, cy, 0.066, l));
    plate.holes.push(slotPath(0.056, cy, 0.066, l));
  });
  const plateGeo = plateGeometry(plate, 0.014, 0.0025, 8);
  root.add(mesh(plateGeo, carbon, 0, 0.046, 0));
  root.add(mesh(plateGeo, carbon, 0, 0.17, 0));

  // Plakalar arası: elektronik yığını, ayaklar, cıvatalar
  root.add(softBox(0.16, 0.09, 0.28, 0.01, black, 0, 0.115, -0.05));
  root.add(softBox(0.1, 0.012, 0.16, 0.004, teal, 0, 0.122, -0.05));
  [[-0.115, -0.37], [0.115, -0.37], [-0.115, 0.02], [0.115, 0.02], [-0.115, 0.3], [0.115, 0.3]].forEach(([x, z]) => {
    root.add(mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.13, 10), alu, x, 0.112, z));
    root.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.007, 10), steel, x, 0.178, z));
  });

  // Üstte aksiyon kamerası yuvası (fotoğraftaki iki dişli bağlantı)
  [-0.022, 0.022].forEach((x) => root.add(softBox(0.014, 0.05, 0.062, 0.004, black, x, 0.2, 0.25)));
  root.add(rod([-0.04, 0.208, 0.25], [0.04, 0.208, 0.25], 0.007, steel, 12));

  // Kamera: yan kafes plakaları + öne eğik gövde + çok halkalı lens
  const cageShape = new THREE.Shape();
  cageShape.moveTo(-0.1, -0.06);
  cageShape.lineTo(0.1, -0.06);
  cageShape.quadraticCurveTo(0.14, 0.04, 0.05, 0.09);
  cageShape.lineTo(-0.1, 0.09);
  cageShape.closePath();
  cageShape.holes.push(slotPath(0.0, 0.015, 0.09, 0.05));
  const cageGeo = new THREE.ExtrudeGeometry(cageShape, { depth: 0.012, bevelEnabled: false, curveSegments: 8 });
  cageGeo.rotateY(-Math.PI / 2);
  [-0.09, 0.102].forEach((x) => root.add(mesh(cageGeo, black, x, 0.11, 0.36)));

  const cam = new THREE.Group();
  cam.position.set(0, 0.118, 0.39);
  cam.rotation.x = -0.42;
  cam.add(softBox(0.158, 0.14, 0.13, 0.02, black));
  const ring = (rTop, rBottom, len, material, z) => {
    const m = mesh(new THREE.CylinderGeometry(rTop, rBottom, len, 36), material, 0, 0, z);
    m.rotation.x = Math.PI / 2;
    cam.add(m);
  };
  ring(0.06, 0.066, 0.03, rubber, 0.076);
  ring(0.052, 0.056, 0.03, alu, 0.098);
  ring(0.042, 0.042, 0.012, rubber, 0.112);
  const lens = mesh(new THREE.SphereGeometry(0.04, 32, 20), glass, 0, 0, 0.106);
  lens.scale.z = 0.5;
  cam.add(lens);
  root.add(cam);

  // Arka: anten yuvası + iki anten (ince tel, kalın uç)
  root.add(softBox(0.13, 0.03, 0.08, 0.01, rubber, 0, 0.192, -0.37));
  [-1, 1].forEach((s) => {
    const base = [s * 0.04, 0.2, -0.385];
    const tip = [s * 0.082, 0.36, -0.46];
    root.add(rod(base, tip, 0.0075, rubber));
    const capFrom = [s * 0.078, 0.345, -0.453];
    const capTo = [s * 0.098, 0.42, -0.488];
    root.add(rod(capFrom, capTo, 0.03, rubber, 16));
    root.add(rod([s * 0.0975, 0.418, -0.487], [s * 0.1, 0.426, -0.491], 0.022, alu, 16));
  });

  return finish(root);
}

// --------------------------------------------------------------------------
// Avata: kalıp plastik gövde, iki yanda birbirine yaslanan kanal halkaları, içlerinde
// korunaklı pervaneler ve alt ızgara, siyah burun, yeşil yansımalı büyük kamera lensi.
// --------------------------------------------------------------------------
export function buildAvataDrone(env) {
  const std = materialFactory(env);
  const root = new THREE.Group();
  // Plastikler: açık gri tonlar stüdyo ışığında beyaza kaçar, bu yüzden renkler koyu tutulur.
  const plastic = { envMapIntensity: 0.4 };
  const shell = std(0x5e5f5d, 0.5, 0.05, plastic);
  const shellDark = std(0x2f3030, 0.55, 0.1, plastic);
  const duct = std(0x6b6c69, 0.48, 0.03, plastic);
  const inner = std(0x1f2021, 0.65, 0.1, { ...plastic, side: THREE.DoubleSide });
  const dark = std(0x141416, 0.34, 0.3);
  const rubber = std(0x1a1a1c, 0.85);
  const ringMetal = std(0x6a6d70, 0.24, 0.95);
  const glass = std(0x0e3a2a, 0.03, 1, { envMapIntensity: 2 });
  const led = std(0x220404, 0.4, 0, { emissive: 0xe84a3c, emissiveIntensity: 1.4 });
  const propMat = std(0x1e1e20, 0.36, 0.1, { side: THREE.DoubleSide });

  // Gövde üst görünüşü: dar burun, geniş orta, yuvarlak kıç
  const outline = (s) => {
    const o = new THREE.Shape();
    o.moveTo(0, 0.43 * s);
    o.bezierCurveTo(0.13 * s, 0.43 * s, 0.13 * s, 0.3 * s, 0.17 * s, 0.14 * s);
    o.bezierCurveTo(0.2 * s, 0, 0.19 * s, -0.2 * s, 0.15 * s, -0.33 * s);
    o.bezierCurveTo(0.12 * s, -0.42 * s, -0.12 * s, -0.42 * s, -0.15 * s, -0.33 * s);
    o.bezierCurveTo(-0.19 * s, -0.2 * s, -0.2 * s, 0, -0.17 * s, 0.14 * s);
    o.bezierCurveTo(-0.13 * s, 0.3 * s, -0.13 * s, 0.43 * s, 0, 0.43 * s);
    return o;
  };
  const bodyGeo = (s, depth, bevel) => {
    const g = new THREE.ExtrudeGeometry(outline(s), {
      depth, curveSegments: 18, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6,
    });
    g.rotateX(Math.PI / 2);
    return g;
  };
  root.add(mesh(bodyGeo(0.98, 0.07, 0.045), shell, 0, 0.1, 0)); // üst kabuk
  root.add(mesh(bodyGeo(0.84, 0.05, 0.03), shellDark, 0, -0.03, 0)); // alt kabuk
  root.add(mesh(bodyGeo(0.66, 0.006, 0.006), shellDark, 0, 0.152, -0.04)); // üst kapak paneli
  root.add(softBox(0.09, 0.008, 0.02, 0.003, dark, 0, 0.16, 0.13)); // ön ışık yarığı
  // Üstte boyuna iki kabartma ve yanlarda havalandırma yarıkları
  [-1, 1].forEach((s) => {
    root.add(softBox(0.016, 0.012, 0.36, 0.005, shellDark, s * 0.102, 0.15, -0.03));
    [0.06, 0.0, -0.06, -0.12].forEach((z) => {
      const vent = softBox(0.012, 0.03, 0.036, 0.004, dark, s * 0.208, 0.055, z);
      vent.rotation.y = s * 0.06;
      root.add(vent);
    });
  });

  // Kıç: batarya kavrama çizgileri ve kırmızı arka ışık
  [-0.25, -0.285, -0.32].forEach((z) => root.add(softBox(0.17, 0.012, 0.014, 0.004, dark, 0, 0.138, z)));
  root.add(softBox(0.08, 0.016, 0.01, 0.004, led, 0, 0.075, -0.4));

  // Burun kutusu ve kamera
  root.add(softBox(0.22, 0.215, 0.19, 0.04, dark, 0, 0.012, 0.325));
  const cam = new THREE.Group();
  cam.position.set(0, 0.02, 0.425);
  const ring = (rTop, rBottom, len, material, z) => {
    const m = mesh(new THREE.CylinderGeometry(rTop, rBottom, len, 48), material, 0, 0, z);
    m.rotation.x = Math.PI / 2;
    cam.add(m);
  };
  ring(0.086, 0.094, 0.026, rubber, 0);
  ring(0.08, 0.084, 0.02, ringMetal, 0.02);
  ring(0.066, 0.066, 0.008, rubber, 0.03);
  const lens = mesh(new THREE.SphereGeometry(0.064, 36, 22), glass, 0, 0, 0.018);
  lens.scale.z = 0.55;
  cam.add(lens);
  root.add(cam);
  // Altta iki küçük görüş sensörü
  [-0.045, 0.045].forEach((x) => {
    const s = mesh(new THREE.SphereGeometry(0.014, 16, 12), glass, x, -0.095, 0.385);
    s.scale.z = 0.5;
    root.add(s);
  });

  // Kanal halkası: kesiti yuvarlak dudaklı tek parça (spline → lathe)
  const R = 0.285;
  const profile = new THREE.SplineCurve([
    [R, -0.06], [R - 0.002, 0.0], [R + 0.004, 0.052], [R + 0.022, 0.07], [R + 0.042, 0.058],
    [R + 0.05, 0.02], [R + 0.046, -0.04], [R + 0.03, -0.066], [R + 0.01, -0.07], [R, -0.06],
  ].map(([x, y]) => new THREE.Vector2(x, y))).getPoints(36).reverse(); // ters sıra: yüzler dışa baksın
  const ductGeo = new THREE.LatheGeometry(profile, 72);
  const linerGeo = new THREE.CylinderGeometry(R - 0.002, R - 0.002, 0.1, 72, 1, true);
  const gridRing = new THREE.TorusGeometry(0.17, 0.0065, 8, 56);
  gridRing.rotateX(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(R * 2 - 0.01, 0.012, 0.02);
  const motorParts = { base: dark, band: shellDark, bell: dark, slot: rubber, bolt: ringMetal };

  [
    { x: 1, z: 1, dir: -1 },
    { x: -1, z: 1, dir: 1 },
    { x: 1, z: -1, dir: 1 },
    { x: -1, z: -1, dir: -1 },
  ].forEach(({ x, z, dir }) => {
    const cx = x * 0.475;
    const cz = z * 0.325;
    root.add(mesh(ductGeo, duct, cx, 0, cz));
    root.add(mesh(linerGeo, inner, cx, 0, cz));
    root.add(mesh(gridRing, inner, cx, -0.052, cz));
    [0, Math.PI / 3, -Math.PI / 3].forEach((a) => {
      const spoke = mesh(spokeGeo, inner, cx, -0.052, cz);
      spoke.rotation.y = a;
      root.add(spoke);
    });
    addBrushlessMotor(root, cx, cz, -0.062, motorParts);

    const prop = propeller({
      radius: 0.262, chord: 0.12, blades: 3, material: propMat, hubMaterial: dark, nutMaterial: ringMetal, dir, root: 0.028,
    });
    prop.position.set(cx, 0.044, cz);
    root.add(prop);

    // Gövdeden halkaya uzanan kalıp kol ve halkanın altındaki iniş ayağı
    const link = softBox(0.24, 0.06, 0.13, 0.024, shell, x * 0.215, 0.018, z * 0.2);
    link.rotation.y = x * z * 0.52;
    root.add(link);
    root.add(softBox(0.06, 0.03, 0.05, 0.012, rubber, x * 0.72, -0.08, cz));
  });

  // Ön ve arka halkayı yan tarafta birleştiren köprüler
  [-1, 1].forEach((x) => root.add(softBox(0.09, 0.09, 0.13, 0.03, duct, x * 0.5, 0, 0)));

  return finish(root);
}
