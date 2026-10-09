import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { blockers, firstContact, bounds } from './puzzle.js';

const COLORS = { cream: 0xded4b5, teal: 0x388a80, orange: 0xdf9252, cyan: 0x77e9d2 };
const UP = new THREE.Vector3(0, 1, 0);
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const DEFAULT = [.24, -.46];

export class WorkshopScene {
  constructor(host, overlay) {
    this.host = host; this.overlay = overlay;
    this.width = 1; this.height = 1; this.views = new Map(); this.active = new Set();
    this.geometries = new Map(); this.textures = []; this.labels = new Map(); this.pickMeshes = []; this.markerData = [];
    this.animation = null; this.shake = null; this.highlightUntil = 0;
    this.pathPreview = null;
    this.stopBadge = document.createElement('div'); this.stopBadge.className = 'path-stop'; this.stopBadge.textContent = '×'; this.stopBadge.hidden = true;
    this.frameTimes = []; this.lastFrame = 0; this.frames = 0; this.lastMarkers = 0;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
    this.renderer.setClearColor(0x0b2029, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute('aria-label', 'Реактивный чайник — интерактивная 3D-конструкция');
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-3, 3, 3, -3, .1, 60);
    this.camera.position.set(0, .05, 14); this.camera.lookAt(0, .05, 0);
    this.root = new THREE.Group(); this.root.position.y = .12; this.scene.add(this.root);
    this.pathGroup = new THREE.Group(); this.root.add(this.pathGroup);
    this.pathFreeMaterial = new THREE.LineBasicMaterial({ color: 0x8bffe0, transparent: true, opacity: .72, depthTest: false, depthWrite: false });
    this.pathBlockedMaterial = new THREE.LineBasicMaterial({ color: 0xff9b73, transparent: true, opacity: .94, depthTest: false, depthWrite: false });
    this.ray = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.scene.add(new THREE.HemisphereLight(0xd2f6e7, 0x192736, 2.25));
    const key = new THREE.DirectionalLight(0xffe1b4, 4.1); key.position.set(-4, 7, 7); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 4; key.shadow.camera.bottom = -4; key.shadow.normalBias = .035; key.shadow.bias = -.0004;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x66dcd5, 3.7); rim.position.set(4, 3, -4); this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0xc6daff, 1.0); fill.position.set(2, -1, 6); this.scene.add(fill);
    this.dark = new THREE.MeshStandardMaterial({ color: 0x193d45, roughness: .43, metalness: .55 });
    this.screw = new THREE.MeshStandardMaterial({ color: 0x617b7a, metalness: .75, roughness: .30 });
    this.energy = new THREE.MeshStandardMaterial({ color: 0x8eefd8, emissive: 0x31c5ad, emissiveIntensity: .8, roughness: .23, metalness: .15 });
    this.copper = new THREE.MeshStandardMaterial({ color: 0xc7864f, roughness: .31, metalness: .72 });
    this.backdrop();
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host);
    this.resetAngle(); this.resize();
    this.tick = this.tick.bind(this); this.raf = requestAnimationFrame(this.tick);
    document.addEventListener('visibilitychange', () => { this.lastFrame = 0; });
  }
  geometry(s, radius = .10) {
    radius = Math.min(radius, ...s.map(v => v / 3));
    const key = [...s, radius].join(',');
    if (!this.geometries.has(key)) this.geometries.set(key, new RoundedBoxGeometry(...s, 2, radius));
    return this.geometries.get(key);
  }
  mesh(geometry, material, group, p = [0, 0, 0], id = null) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.fromArray(p); group.add(mesh);
    if (id) { mesh.userData.piece = id; mesh.castShadow = true; mesh.receiveShadow = true; this.pickMeshes.push(mesh); }
    return mesh;
  }
  cube(s, p, material, group, id, radius = .08) { return this.mesh(this.geometry(s, radius), material, group, p, id); }
  cylinder(radius, height, p, material, group, id, axis = 'y') {
    const key = `c:${radius}:${height}`;
    if (!this.geometries.has(key)) this.geometries.set(key, new THREE.CylinderGeometry(radius, radius, height, 20));
    const mesh = this.mesh(this.geometries.get(key), material, group, p, id);
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    return mesh;
  }
  ring(radius, tube, p, material, group, id, axis = 'y') {
    const key = `t:${radius}:${tube}`;
    if (!this.geometries.has(key)) this.geometries.set(key, new THREE.TorusGeometry(radius, tube, 6, 32));
    const mesh = this.mesh(this.geometries.get(key), material, group, p, id);
    if (axis === 'y') mesh.rotation.x = Math.PI / 2;
    if (axis === 'x') mesh.rotation.y = Math.PI / 2;
    return mesh;
  }
  backdrop() {
    const positions = []; let seed = 123;
    const rng = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
    for (let i = 0; i < 110; i++) positions.push((rng() - .5) * 18, (rng() - .5) * 16, -6 - rng() * 7);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x79b7c1, size: .018, transparent: true, opacity: .4 })); this.scene.add(stars);
    const soft = new THREE.MeshBasicMaterial({ color: 0x437d7e, transparent: true, opacity: .13, side: THREE.DoubleSide });
    this.ring(2.65, .015, [0, -2.12, 0], soft, this.scene);
    this.ring(2.85, .008, [0, -2.12, 0], soft, this.scene);
    this.ring(2.25, .004, [0, -2.13, 0], soft, this.scene);
    const floor = new THREE.Mesh(new THREE.RingGeometry(2.57, 2.67, 80), new THREE.MeshBasicMaterial({ color: 0x3cb9af, transparent: true, opacity: .11, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -2.13; this.scene.add(floor);
    // A translucent holographic cradle, not a physical obstacle in the puzzle.
    this.cradle = new THREE.Group(); this.cradle.rotation.x = .19; this.scene.add(this.cradle);
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * Math.PI * 2;
      const tick = this.cube([.045, .025, i % 3 ? .10 : .20], [Math.cos(a) * 2.66, -2.12, Math.sin(a) * 2.66], soft, this.cradle);
      tick.rotation.y = -a + Math.PI / 2;
    }
    const glowCanvas = document.createElement('canvas'); glowCanvas.width = 128; glowCanvas.height = 128;
    const ctx = glowCanvas.getContext('2d'); const gradient = ctx.createRadialGradient(64, 64, 3, 64, 64, 64);
    gradient.addColorStop(0, '#5af9cc35'); gradient.addColorStop(.5, '#28ad9b12'); gradient.addColorStop(1, '#1f889000'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    const glowTexture = new THREE.CanvasTexture(glowCanvas); this.textures.push(glowTexture);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false })); glow.position.set(0, -.3, -4); glow.scale.set(8, 7, 1); this.scene.add(glow);
  }
  makeLabel(text, width = 256, height = 128) {
    if (this.labels.has(text)) return this.labels.get(text);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#173b43'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `900 ${height * .43}px Arial`; ctx.fillText(text, width / 2, height * .40);
    ctx.fillStyle = '#405d60'; ctx.font = `600 ${height * .13}px Arial`; ctx.fillText('ГАЛАКТИЧЕСКАЯ СЛУЖБА', width / 2, height * .78);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; this.textures.push(tex);
    const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    this.labels.set(text, material); return material;
  }
  load(level) {
    this.clearPath();
    this.animation = null; this.shake = null; this.highlightUntil = 0; this.hinted = null;
    for (const view of this.views.values()) { this.root.remove(view.group); this.root.remove(view.arrow); view.arrowMaterial.dispose(); view.material.dispose(); for (const m of view.extras) m.dispose(); }
    this.views.clear(); this.pickMeshes = []; this.active.clear(); this.overlay.replaceChildren();
    this.level = level; this.resetAngle();
    // In the engineering assembly the rear release is genuinely occluded from this view.
    if (level.id === 'hard') this.root.rotation.set(0, 0, 0);
    for (const piece of level.pieces) {
      const group = new THREE.Group(); this.root.add(group);
      const material = new THREE.MeshStandardMaterial({ color: COLORS[piece.color], metalness: .34, roughness: .38, emissive: 0x000000 });
      const view = { piece, group, material, extras: [] }; this.views.set(piece.id, view); this.active.add(piece.id);
      for (const box of piece.boxes) this.makeBox(piece, box, view);
      const element = document.createElement('div'); element.className = `part-arrow${piece.core ? ' core' : ''}`; element.dataset.piece = piece.id;
      element.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 20V4M5 11l7-7 7 7"/></svg><span class="axial" hidden></span>';
      element.title = piece.name; element.hidden = true; this.overlay.appendChild(element); view.element = element;
      const arrow = new THREE.Group(); arrow.visible = false; this.root.add(arrow); view.arrow = arrow;
      const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0x9affe2, depthTest: false, depthWrite: false }); view.arrowMaterial = arrowMaterial;
      if (!this.geometries.has('arrow-shaft')) this.geometries.set('arrow-shaft', new THREE.CylinderGeometry(.023, .023, 1, 8));
      if (!this.geometries.has('arrow-head')) this.geometries.set('arrow-head', new THREE.ConeGeometry(.085, .22, 8));
      view.shaft = this.mesh(this.geometries.get('arrow-shaft'), arrowMaterial, arrow);
      view.tip = this.mesh(this.geometries.get('arrow-head'), arrowMaterial, arrow);
      view.shaft.renderOrder = 30; view.tip.renderOrder = 30;
      arrow.quaternion.setFromUnitVectors(UP, new THREE.Vector3(...piece.dir));
    }
    this.pickMeshes = this.pickMeshes.filter(m => m.userData.primary);
    this.overlay.appendChild(this.stopBadge);
    this.root.updateMatrixWorld(true); this.updateMarkers();
  }
  makeBox(piece, box, view) {
    const { p, s, style } = box; const { group, material } = view; const id = piece.id;
    const [x, y, z] = p; const [w, h, d] = s;
    if (style === 'core') {
      this.cube([w, .13, d], [x, y - .40, z], this.dark, group, id).userData.primary = true;
      this.cube([w, .13, d], [x, y + .40, z], material, group, id).userData.primary = true;
      this.cylinder(.30, .72, p, this.energy, group, id).userData.primary = true;
      for (let j = 0; j < 5; j++) this.ring(.355, .038, [x, y - .27 + j * .135, z], this.copper, group, id);
      for (const a of [-1, 1]) for (const b of [-1, 1]) this.cube([.115, .78, .115], [x + a * .445, y, z + b * .445], this.dark, group, id, .03);
      return;
    }
    if (style === 'engine') {
      this.cylinder(Math.min(w, d) / 2, h, p, material, group, id).userData.primary = true;
      this.cylinder(w * .40, h * .22, [x, y - h * .33, z], this.dark, group, id);
      this.cylinder(w * .26, .035, [x, y - h * .48 + .02, z], this.energy, group, id);
      for (const a of [-1, 1]) this.cube([.08, h * .57, .13], [x + a * w * .39, y + .02, z], this.dark, group, id, .02);
      return;
    }
    // Paint and inset fittings share one conservative mechanical envelope.
    this.cube(s.map(v => v - .03), p, material, group, id, style === 'nozzle' ? .18 : .10).userData.primary = true;
    if (style === 'front' || style === 'rear') {
      const sign = style === 'front' ? 1 : -1, face = z + sign * (d / 2 - .010);
      this.cube([w * .78, .06, .013], [x, y - h * .33, face], this.dark, group, id, .01);
      this.cube([w * .46, .035, .015], [x, y - h * .28, face], this.energy, group, id, .01);
      for (const a of [-1, 1]) for (const b of [-1, 1]) this.cylinder(.045, .032, [x + a * (w / 2 - .11), y + b * (h / 2 - .16), face - sign * .017], this.screw, group, id, 'z');
      if (style === 'front') {
        const r = Math.min(.29, w * .25);
        this.cylinder(r, .018, [x, y + .18, face - .007], this.dark, group, id, 'z');
        this.ring(r * .76, .015, [x, y + .18, face - .006], this.copper, group, id, 'z');
        this.cube([.022, r * 1.10, .015], [x, y + .20, face - .003], this.energy, group, id, .004).rotation.z = -.55;
        const labelMaterial = this.makeLabel(w > 2 ? 'ЧАЙ-9' : `0${Number(id.replace('front', ''))}`);
        const size = [Math.min(1.48, w * .9), Math.min(.55, w * .5)], key = `plane:${size.join(',')}`;
        if (!this.geometries.has(key)) this.geometries.set(key, new THREE.PlaneGeometry(...size));
        const label = this.mesh(this.geometries.get(key), labelMaterial, group, [x, y + .80, face + .002], id);
        label.castShadow = false;
      } else {
        for (let i = 0; i < 4; i++) this.cube([w * .54, .075, .018], [x, y - .25 + i * .18, face], this.dark, group, id, .025);
      }
    }
    if (style === 'lid' || style === 'beam' || style === 'rail' || style === 'base') {
      const top = y + h / 2 - .012;
      this.cube([w * .65, .02, Math.min(.075, d * .25)], [x, top, z], style === 'base' ? this.dark : this.energy, group, id, .007);
      if (w > .5 && d > .5) for (const a of [-1, 1]) for (const b of [-1, 1]) this.cylinder(.032, .021, [x + a * w * .37, top, z + b * d * .34], this.screw, group, id);
      if (style === 'beam') {
        for (const a of [-1, 1]) this.cube([.18, h * .98, d * .98], [x + a * w * .3, y, z], this.copper, group, id, .025);
      }
    }
    if (style === 'nozzle') {
      this.cylinder(.215, .034, [x, y + h / 2 - .028, z], this.dark, group, id);
      this.ring(.166, .024, [x, y + h / 2 - .029, z], this.energy, group, id);
    }
    if (style === 'knob') {
      this.cube([w * .72, .025, d * .60], [x, y + h / 2 - .023, z], this.dark, group, id);
      this.cube([w * .43, .03, .04], [x, y + h / 2 - .020, z], this.energy, group, id);
    }
    if (style === 'handle' && h > 1) {
      for (let j = 0; j < 5; j++) this.cube([w * .98, .09, d * .98], [x, y - .36 + j * .18, z], this.dark, group, id, .025);
    }
  }
  resize() {
    const r = this.host.getBoundingClientRect(); if (!r.width || !r.height) return;
    this.width = r.width; this.height = r.height;
    this.renderer.setSize(r.width, r.height, false);
    const aspect = r.width / r.height, vertical = Math.max(5.9, 6.15 / aspect);
    this.camera.left = -vertical * aspect / 2; this.camera.right = vertical * aspect / 2;
    this.camera.top = vertical / 2; this.camera.bottom = -vertical / 2; this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(); this.root.updateMatrixWorld(true); this.updateMarkers();
  }
  resetAngle() { this.root.rotation.set(DEFAULT[0], DEFAULT[1], 0); }
  rotate(dx, dy) {
    this.clearPath();
    this.root.rotation.y += dx * .010;
    this.root.rotation.x = THREE.MathUtils.clamp(this.root.rotation.x + dy * .010, -1.38, 1.38);
    this.root.updateMatrixWorld(true); this.lastMarkers = 0;
  }
  project(local, group = this.root) {
    const vector = group.localToWorld(new THREE.Vector3(...local)).project(this.camera);
    return { x: (vector.x + 1) / 2 * this.width, y: (1 - vector.y) / 2 * this.height, z: vector.z };
  }
  pick(x, y) {
    this.pointer.set(x / this.width * 2 - 1, -y / this.height * 2 + 1); this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObjects(this.pickMeshes, false);
    return hits.find(h => this.active.has(h.object.userData.piece) && h.object.parent.visible)?.object.userData.piece || null;
  }
  pickInput(x, y) {
    const geometry = this.pick(x, y);
    let nearest = null;
    for (const m of this.markerData) {
      const dx = m.tipX - m.x, dy = m.tipY - m.y, length2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((x - m.x) * dx + (y - m.y) * dy) / (length2 || 1)));
      const distance = Math.hypot(x - m.x - t * dx, y - m.y - t * dy);
      if (distance < 13 && (!nearest || distance < nearest.distance)) nearest = { id: m.id, distance };
    }
    return nearest?.id || geometry;
  }
  updateMarkers() {
    if (!this.views.size) return;
    this.camera.updateMatrixWorld(); this.root.updateMatrixWorld(true);
    const markers = [];
    for (const [id, view] of this.views) {
      view.element.hidden = true;
      view.arrow.visible = false;
      if (!this.active.has(id) || this.animation?.id === id) continue;
      let best = null;
      for (const box of view.piece.boxes) {
        for (const normal of AXES) {
          const n = new THREE.Vector3(...normal).transformDirection(this.root.matrixWorld);
          const facing = n.z; if (facing < .15) continue;
          const axis = normal.findIndex(v => v !== 0);
          const local = box.p.map((v, i) => v + normal[i] * (box.s[i] / 2 + .012));
          const screen = this.project(local, view.group);
          if (screen.x < 18 || screen.x > this.width - 18 || screen.y < 36 || screen.y > this.height - 25) continue;
          if (this.pick(screen.x, screen.y) !== id) continue;
          const area = box.s.filter((_, i) => i !== axis).reduce((a, b) => a * b, 1);
          const score = area * facing;
          if (!best || score > best.score) best = { id, x: screen.x, y: screen.y, local, score };
        }
      }
      if (view.piece.core) {
        const center = this.project([0, 0, 0], view.group);
        if (this.pick(center.x, center.y) === id) best = { id, x: center.x, y: center.y, local: [0, 0, 0], score: 2 };
      }
      if (!best) continue;
      const endpoint = this.project(best.local.map((v, i) => v + view.piece.dir[i] * .6), view.group);
      const dx = endpoint.x - best.x, dy = endpoint.y - best.y;
      best.angle = Math.atan2(dx, -dy) * 180 / Math.PI;
      const worldDir = new THREE.Vector3(...view.piece.dir).transformDirection(this.root.matrixWorld);
      best.axial = Math.hypot(dx, dy) < 12 ? (worldDir.z > 0 ? '⊙' : '⊗') : null;
      best.dir = [...view.piece.dir];
      best.blocked = blockers(view.piece, [...this.active].map(key => this.views.get(key).piece));
      markers.push(best);
    }
    markers.sort((a, b) => b.score - a.score);
    const placed = [];
    for (const mark of markers) {
      const view = this.views.get(mark.id);
      // Never displace a marker to a different part or make an occluded part clickable.
      if (placed.some(p => Math.hypot(p.x - mark.x, p.y - mark.y) < 33)) continue;
      view.element.hidden = false; view.element.style.left = `${mark.x}px`; view.element.style.top = `${mark.y}px`;
      const free = !mark.blocked.length;
      view.element.classList.toggle('free', free); view.element.classList.toggle('locked', !free);
      view.element.dataset.axial = mark.axial ? (mark.axial === '⊙' ? 'К СЕБЕ' : 'ВГЛУБЬ') : '';
      view.element.title = `${view.piece.name} · ${free ? 'путь свободен' : 'путь перекрыт'}`;
      view.arrowMaterial.color.setHex(free ? 0x8affe0 : 0xf4a47e);
      const length = Math.max(.58, (this.camera.right - this.camera.left) * 40 / this.width);
      view.arrow.position.fromArray(mark.local); view.arrow.visible = true;
      view.shaft.scale.y = length - .22; view.shaft.position.y = (length - .22) / 2;
      view.tip.position.y = length - .11;
      const end = this.project(mark.local.map((v, i) => v + view.piece.dir[i] * length));
      mark.tipX = end.x; mark.tipY = end.y; mark.length = length;
      const svg = view.element.querySelector('svg'); const axial = view.element.querySelector('.axial');
      svg.style.transform = `rotate(${mark.angle}deg)`; svg.hidden = !!mark.axial; svg.style.display = mark.axial ? 'none' : '';
      axial.hidden = !mark.axial; axial.textContent = mark.axial || '';
      placed.push(mark);
    }
    this.markerData = placed;
    if (this.pathPreview?.contact) {
      const contact = this.project(this.pathPreview.contact);
      this.stopBadge.hidden = false; this.stopBadge.style.left = `${contact.x}px`; this.stopBadge.style.top = `${contact.y}px`;
    }
  }
  marker(id) { return this.markerData.find(m => m.id === id); }
  showPath(id, duration = 1900) {
    this.clearPath();
    const view = this.views.get(id); if (!view || !this.active.has(id)) return;
    const active = [...this.active].map(key => this.views.get(key).piece), blocked = blockers(view.piece, active);
    const distance = blocked.length ? blocked[0].distance : 1.55;
    const material = blocked.length ? this.pathBlockedMaterial : this.pathFreeMaterial;
    const offset = view.piece.dir.map(v => v * distance);
    for (const box of view.piece.boxes) {
      const key = `edges:${box.s.join(',')}`;
      if (!this.geometries.has(key)) { const geometry = new THREE.BoxGeometry(...box.s); this.geometries.set(key, new THREE.EdgesGeometry(geometry)); geometry.dispose(); }
      const ghost = new THREE.LineSegments(this.geometries.get(key), material);
      ghost.position.fromArray(box.p.map((v, i) => v + offset[i])); ghost.renderOrder = 26; this.pathGroup.add(ghost);
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...box.p), new THREE.Vector3(...box.p.map((v, i) => v + offset[i]))]);
      const line = new THREE.Line(geometry, material); line.userData.dynamicGeometry = true; line.renderOrder = 27; this.pathGroup.add(line);
    }
    let contact = null;
    if (blocked.length) {
      const obstacle = this.views.get(blocked[0].id).piece;
      outer: for (const a of view.piece.boxes) for (const b of obstacle.boxes) {
        if (Math.abs(firstContact(a, b, view.piece.dir) - distance) > 1e-6) continue;
        const A = bounds({ p: a.p.map((v, i) => v + offset[i]), s: a.s }), B = bounds(b), axis = view.piece.dir.findIndex(v => v !== 0);
        contact = a.p.map((_, i) => i === axis ? (view.piece.dir[i] > 0 ? A.max[i] : A.min[i]) : (Math.max(A.min[i], B.min[i]) + Math.min(A.max[i], B.max[i])) / 2);
        const transverse = [0, 1, 2].filter(i => i !== axis), points = [];
        for (const sign of [-1, 1]) for (const end of [-1, 1]) { const p = [...contact]; p[transverse[0]] += end * .17; p[transverse[1]] += end * sign * .17; points.push(new THREE.Vector3(...p)); }
        const geometry = new THREE.BufferGeometry().setFromPoints(points), stop = new THREE.LineSegments(geometry, material);
        stop.userData.dynamicGeometry = true; stop.renderOrder = 32; this.pathGroup.add(stop); break outer;
      }
    }
    this.pathPreview = { id, direction: [...view.piece.dir], blocked: !!blocked.length, distance, obstacle: blocked[0]?.id || null, contact, expires: performance.now() + duration };
  }
  clearPath() {
    if (this.stopBadge) this.stopBadge.hidden = true;
    if (!this.pathGroup) return;
    for (const child of this.pathGroup.children) if (child.userData.dynamicGeometry) child.geometry.dispose();
    this.pathGroup.clear(); this.pathPreview = null;
  }
  arrowEvidence() {
    this.root.updateMatrixWorld(true);
    return this.markerData.map(m => {
      const v = this.views.get(m.id);
      return { id: m.id, dirLocal: [...v.piece.dir], originWorld: v.arrow.getWorldPosition(new THREE.Vector3()).toArray(), tipWorld: v.arrow.localToWorld(new THREE.Vector3(0, m.length, 0)).toArray(), projected: { x: m.x, y: m.y, tipX: m.tipX, tipY: m.tipY }, blocked: m.blocked.length > 0, axial: m.axial };
    });
  }
  motionEvidence() {
    if (!this.animation) return null;
    const v = this.views.get(this.animation.id), origin = this.root.getWorldPosition(new THREE.Vector3()), current = v.group.getWorldPosition(new THREE.Vector3());
    return { id: this.animation.id, offsetLocal: v.group.position.toArray(), offsetWorld: current.sub(origin).toArray() };
  }
  setHint(id) { this.hinted = id; for (const [key, view] of this.views) view.element.classList.toggle('hinted', key === id); }
  flash(id, blocked = []) {
    this.highlightUntil = performance.now() + 600;
    this.flashIds = new Set([id, ...blocked.map(b => b.id)]);
    const nearest = blocked[0]?.distance || 0;
    this.shake = { id, start: performance.now(), amplitude: Math.min(.07, nearest * .40) };
    const view = this.views.get(id); view?.element.classList.add('blocked');
  }
  remove(id, onComplete) {
    this.setHint(null);
    this.animation = { id, start: performance.now(), duration: this.reducedMotion ? 180 : 580, onComplete };
    this.views.get(id).element.hidden = true;
  }
  tick(now) {
    this.raf = requestAnimationFrame(this.tick);
    if (document.hidden) { this.lastFrame = 0; return; }
    if (this.lastFrame && now - this.lastFrame < 250) { this.frameTimes.push(now - this.lastFrame); if (this.frameTimes.length > 600) this.frameTimes.shift(); }
    this.lastFrame = now; this.frames++;
    if (this.pathPreview && now > this.pathPreview.expires) this.clearPath();
    if (this.shake) {
      const elapsed = (now - this.shake.start) / 270; const v = this.views.get(this.shake.id);
      if (v) v.group.position.fromArray(v.piece.dir).multiplyScalar(Math.sin(Math.min(elapsed, 1) * Math.PI) * this.shake.amplitude);
      if (elapsed >= 1) { v?.group.position.set(0, 0, 0); this.shake = null; }
    }
    for (const [id, v] of this.views) {
      const flashing = now < this.highlightUntil && this.flashIds?.has(id);
      v.material.emissive.setHex(flashing ? 0x7d2113 : this.hinted === id ? 0x4b391a : 0x000000);
      if (!flashing) v.element.classList.remove('blocked');
    }
    if (this.animation) {
      const a = this.animation, t = Math.min(1, (now - a.start) / a.duration), eased = t * t * (3 - 2 * t), view = this.views.get(a.id);
      // Straight translation only: the rules validated the complete corridor before it starts.
      view.group.position.fromArray(view.piece.dir).multiplyScalar(eased * 9);
      if (t === 1) {
        view.group.visible = false; this.active.delete(a.id); this.animation = null; this.clearPath(); a.onComplete();
      }
    }
    this.renderer.render(this.scene, this.camera);
    if (now - this.lastMarkers > 65 || this.animation) { this.updateMarkers(); this.lastMarkers = now; }
  }
  metrics() {
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    return { samples: sorted.length, medianMs: sorted[Math.floor(sorted.length * .5)] || 0, p95Ms: sorted[Math.floor(sorted.length * .95)] || 0, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, pixelRatio: this.renderer.getPixelRatio() };
  }
}
