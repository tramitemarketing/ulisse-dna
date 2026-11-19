// Confronto di scala "potenze di dieci": dal DNA al capello. Unità della scena: nanometri.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, transparent: true, ...extra });

// handed = 1 → destrorsa (con y verso l'alto: x → −z mentre si sale)
function helixTube(radius, pitch, turns, tubeR, color, phase = 0, handed = 1, center = [0, 0, 0]) {
  const pts = [];
  const n = Math.ceil(turns * 40);
  for (let i = 0; i <= n; i++) {
    const a = handed * ((i / n) * turns * Math.PI * 2) + phase;
    pts.push(new THREE.Vector3(radius * Math.cos(a) + center[0], (i / n) * turns * pitch + center[1], -radius * Math.sin(a) + center[2]));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, tubeR, 8, false), mat(color));
}

function dnaPiece(len) {
  const g = new THREE.Group();
  const turns = len / 3.4;
  const h1 = helixTube(0.9, 3.4, turns, 0.22, "#dcc9a6", 0);
  const h2 = helixTube(0.9, 3.4, turns, 0.22, "#7fa3bd", (Math.PI * 2 * 0.38));
  g.add(h1, h2);
  const cols = ["#4cc38a", "#e4606d", "#e8b84a", "#5a9be0"];
  const rungGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6);
  for (let i = 0; i < len / 0.34; i++) {
    const y = i * 0.34, a = (y / 3.4) * Math.PI * 2 + Math.PI * 0.38;
    const r = new THREE.Mesh(rungGeo, mat(cols[i % 4]));
    r.position.set(0.0, y, 0);
    r.rotation.z = Math.PI / 2;
    r.rotation.y = a; // stesso verso dei filamenti (destrorsa)
    g.add(r);
  }
  g.position.y = -len / 2;
  const w = new THREE.Group(); w.add(g); w.rotation.z = Math.PI / 2;
  return w;
}

function nucleosome() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 5.6, 40), mat("#b98d6a"));
  g.add(core);
  // 147 coppie (~50 nm) avvolte 1,65 volte, superelica sinistrorsa
  const pts = [];
  const turns = 1.65, R = 4.3, pitch = 2.6;
  for (let i = 0; i <= 200; i++) {
    const u = i / 200, a = u * turns * Math.PI * 2; // con z = R·sin(a) e y che sale: superelica sinistrorsa
    pts.push(new THREE.Vector3(R * Math.cos(a), (u - 0.5) * turns * pitch, R * Math.sin(a)));
  }
  // DNA "linker" in uscita
  const first = pts[0], last = pts[pts.length - 1];
  const t0 = first.clone().sub(pts[3]).normalize(), t1 = last.clone().sub(pts[pts.length - 4]).normalize();
  pts.unshift(first.clone().addScaledVector(t0, 10), first.clone().addScaledVector(t0, 5));
  pts.push(last.clone().addScaledVector(t1, 5), last.clone().addScaledVector(t1, 10));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 260, 1.0, 10, false), mat("#7fa3bd")));
  g.rotation.x = 0.5;
  return g;
}

function nucleosomeDisk() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 5.7, 20), mat("#b98d6a")));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 1.0, 8, 24), mat("#7fa3bd"));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  return g;
}

function beadsOnString() {
  const g = new THREE.Group();
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const x = (k - 2.5) * 17, y = (k % 2 ? 4 : -4);
    const n = nucleosomeDisk();
    n.position.set(x, y, 0); n.rotation.set(0.6, k * 0.7, 0.2);
    g.add(n);
    pts.push(new THREE.Vector3(x - 8, y * 0.4, 2), new THREE.Vector3(x + 8, -y * 0.4, -2));
  }
  pts.unshift(new THREE.Vector3(-60, 0, 0)); pts.push(new THREE.Vector3(60, 0, 0));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 1.0, 8, false), mat("#7fa3bd")));
  return g;
}

function fiber30() {
  const g = new THREE.Group();
  const perTurn = 6, pitch = 11, R = 10;
  for (let k = 0; k < 66; k++) {
    const a = (k / perTurn) * Math.PI * 2;
    const n = nucleosomeDisk();
    n.scale.setScalar(0.9);
    n.position.set(R * Math.cos(a), (k / perTurn) * pitch - 60, R * Math.sin(a));
    n.lookAt(0, n.position.y, 0);
    g.add(n);
  }
  g.rotation.z = Math.PI / 2;
  return g;
}

function bumpy(geo, amp, seed = 1) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 0.013 + seed) * Math.sin(v.y * 0.011 + 2 * seed) * Math.sin(v.z * 0.017 + 3);
    v.multiplyScalar(1 + amp * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function chromosome(color = "#c9825a") {
  const g = new THREE.Group();
  const m = mat(color);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const len = sy > 0 ? 1500 : 2200;
    const arm = new THREE.Mesh(bumpy(new THREE.CapsuleGeometry(330, len, 10, 24), 0.06, sx + sy * 2), m);
    arm.position.set(sx * 290 + sx * Math.sin(0.12) * (len / 2), sy * (len / 2 + 250), 0);
    arm.rotation.z = -sx * sy * 0.12;
    g.add(arm);
  }
  const cen = new THREE.Mesh(new THREE.SphereGeometry(300, 20, 16), mat("#a86a45"));
  g.add(cen);
  return g;
}

function nucleus() {
  const g = new THREE.Group();
  const env = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 32), mat("#7f9cc0", { opacity: 0.28, depthWrite: false }));
  g.add(env);
  const nucleolo = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 24), mat("#5a4636"));
  nucleolo.position.set(600, 400, 0);
  g.add(nucleolo);
  // cromatina: fili irregolari
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (let k = 0; k < 18; k++) {
    const pts = [];
    let p = new THREE.Vector3((rnd() - 0.5) * 3000, (rnd() - 0.5) * 3000, (rnd() - 0.5) * 3000);
    for (let i = 0; i < 14; i++) {
      p = p.clone().add(new THREE.Vector3((rnd() - 0.5) * 900, (rnd() - 0.5) * 900, (rnd() - 0.5) * 900));
      if (p.length() > 2600) p.multiplyScalar(2400 / p.length());
      pts.push(p);
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 90, 6, false), mat(k % 2 ? "#dcc9a6" : "#7fa3bd", { opacity: 0.9 })));
  }
  return g;
}

function redCell() {
  const pts = [];
  // profilo biconcavo (Evans & Fung, 1972), raggio 3,9 µm
  const R = 3910;
  for (let i = 0; i <= 40; i++) {
    const x = (i / 40) * R, r = x / R;
    const h = 0.5 * R * Math.sqrt(Math.max(0, 1 - r * r)) * (0.207 + 2.003 * r * r - 1.123 * r ** 4);
    pts.push(new THREE.Vector2(x, h));
  }
  for (let i = 40; i >= 0; i--) pts.push(new THREE.Vector2(pts[i].x, -pts[i].y));
  const geo = new THREE.LatheGeometry(pts, 48);
  const m = new THREE.Mesh(geo, mat("#d6334a", { side: THREE.DoubleSide }));
  m.rotation.x = 1.1;
  return m;
}

function cell() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(bumpy(new THREE.SphereGeometry(10000, 64, 48), 0.04, 3), mat("#a9c9c2", { opacity: 0.22, depthWrite: false })));
  const n = nucleus(); n.position.set(1500, 800, 0); g.add(n);
  const rnd = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (let k = 0; k < 22; k++) {
    const mito = new THREE.Mesh(new THREE.CapsuleGeometry(300, 1300, 6, 12), mat("#ff9f6e"));
    const v = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(4500 + rnd() * 4000);
    mito.position.copy(v); mito.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    g.add(mito);
  }
  return g;
}

function hair() {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(35000, 35000, 600000, 64, 60, true);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ang = Math.atan2(v.z, v.x);
    const sc = 1 + 0.025 * (((v.y + ang * 3000) / 9000) % 1); // squame della cuticola
    p.setXYZ(i, v.x * sc, v.y, v.z * sc);
  }
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, mat("#6b4a2e", { side: THREE.DoubleSide })));
  g.rotation.z = 0.25;
  return g;
}

export const LEVELS = [
  { id: "dna", nome: "Doppia elica di DNA", breve: "2 nm", misura: "larga 2 nm", frame: 9, make: () => dnaPiece(24), fatto: "Larga 2 nanometri: 35.000 doppie eliche affiancate fanno lo spessore di un capello." },
  { id: "nuc", nome: "Nucleosoma", breve: "11 nm", misura: "≈ 11 nm", frame: 30, make: nucleosome, fatto: "147 coppie di basi avvolte 1,65 volte attorno a 8 proteine (gli istoni). Una cellula umana ne ha circa 30 milioni." },
  { id: "perle", nome: "Filo di perle", breve: "10 nm", misura: "≈ 10 nm di spessore", frame: 120, make: beadsOnString, fatto: "Nucleosomi uno dopo l'altro, separati da tratti di DNA «linker» di 20–80 coppie di basi." },
  { id: "f30", nome: "Fibra da 30 nm", breve: "30 nm", misura: "≈ 30 nm", frame: 170, make: fiber30, fatto: "È il modello dei libri. In provetta si forma; nelle cellule vive la cromatina sembra più disordinata (studi del 2017 con la tecnica ChromEMT): <b>è un punto ancora discusso</b>." },
  { id: "crom", nome: "Cromosoma in metafase", breve: "1,4 µm", misura: "≈ 1,4 µm × 5 µm", frame: 8500, make: () => chromosome(), fatto: "Due cromatidi fratelli uniti al centromero, prima della divisione. Qui un cromosoma di taglia media; il più grande, il cromosoma 1, in metafase misura 8–10 µm e contiene circa 249 milioni di coppie di basi: srotolato sarebbe lungo 8,5 cm." },
  { id: "nucleo", nome: "Nucleo della cellula", breve: "6 µm", misura: "≈ 6 µm", frame: 9500, make: nucleus, fatto: "Dentro ci sono circa 2 metri di DNA (6,4 miliardi di coppie × 0,34 nm). È come infilare 20 km di filo sottilissimo in una pallina da tennis." },
  { id: "cell", nome: "Cellula umana e globulo rosso", breve: "10–30 µm", misura: "cellula 10–30 µm · globulo rosso 7,8 µm", frame: 42000, make: () => { const g = new THREE.Group(); g.add(cell()); const r = redCell(); r.position.set(16500, -4000, 0); g.add(r); return g; }, fatto: "Una cellula tipica misura 10–30 µm. Il globulo rosso (a destra) è largo circa 7,8 µm e non ha il nucleo." },
  { id: "hair", nome: "Capello umano", breve: "70 µm", misura: "≈ 70 µm (da 17 a 180)", frame: 190000, make: () => { const g = new THREE.Group(); const h = hair(); h.position.x = -62000; g.add(h); const c = cell(); g.add(c); const r = redCell(); r.position.set(16500, -4000, 0); g.add(r); return g; }, fatto: "Un capello è largo circa 70 µm: ci stanno affiancate 3–4 cellule, oppure 35.000 doppie eliche." },
];

export class ScaleScene {
  constructor(renderer, dom) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1e7);
    this.scene.add(new THREE.HemisphereLight("#dfe8ff", "#1a1f33", 1.4));
    const dl = new THREE.DirectionalLight("#ffffff", 2.2); dl.position.set(1, 2, 3); this.scene.add(dl);
    this.objects = LEVELS.map((L) => { const o = L.make(); o.visible = false; this.scene.add(o); return o; });
    this.objects.forEach((o) => o.traverse((m) => { if (m.material) m.userData.baseOpacity = m.material.opacity ?? 1; }));
    this.logW = Math.log10(LEVELS[0].frame);
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enableZoom = false; this.controls.enablePan = false; this.controls.enableDamping = true;
    this.controls.enabled = false;
    this.camera.position.set(0, 0, 10);
  }
  get minLog() { return Math.log10(LEVELS[0].frame); }
  get maxLog() { return Math.log10(LEVELS[LEVELS.length - 1].frame); }
  setLog(v) { this.logW = Math.max(this.minLog, Math.min(this.maxLog, v)); }
  weights() {
    const logs = LEVELS.map((L) => Math.log10(L.frame));
    const w = logs.map(() => 0);
    let k = 0;
    while (k < logs.length - 1 && this.logW > logs[k + 1]) k++;
    if (k >= logs.length - 1) { w[logs.length - 1] = 1; return w; }
    const u = (this.logW - logs[k]) / (logs[k + 1] - logs[k]);
    const s = Math.max(0, Math.min(1, (u - 0.35) / 0.3));
    w[k] = 1 - s; w[k + 1] = s;
    return w;
  }
  current() { const w = this.weights(); let b = 0; w.forEach((x, i) => { if (x > w[b]) b = i; }); return b; }
  render(dt) {
    const W = 10 ** this.logW;
    const dist = W / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) / Math.min(1, this.camera.aspect);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (!isFinite(dir.x) || dir.length() < 0.5) dir.set(0, 0, 1);
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.camera.near = dist / 200; this.camera.far = dist * 50;
    this.camera.updateProjectionMatrix();
    const w = this.weights();
    this.objects.forEach((o, i) => {
      o.visible = w[i] > 0.01;
      if (!o.visible) return;
      o.rotation.y += dt * 0.12;
      o.traverse((m) => { if (m.material) { m.material.opacity = m.userData.baseOpacity * w[i]; m.material.depthWrite = w[i] > 0.97 && m.userData.baseOpacity > 0.5; } });
    });
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
  viewWidthNm() { return 10 ** this.logW; }
}
