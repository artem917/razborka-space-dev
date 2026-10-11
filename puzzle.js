// One ruleset for shell, handles, mechanism and core. Units are model-space metres.
export const EPS = 1e-7;
export function bounds(box) {
  return { min: box.p.map((v, i) => v - box.s[i] / 2), max: box.p.map((v, i) => v + box.s[i] / 2) };
}
export function overlap(a, b) {
  const A = bounds(a), B = bounds(b);
  return [0, 1, 2].every(i => A.max[i] > B.min[i] + EPS && B.max[i] > A.min[i] + EPS);
}
// Exact continuous swept AABB against every component of every remaining part.
// Adjacent parallel faces are not intersections; any positive penetration is.
export function firstContact(moving, obstacle, direction) {
  const axis = direction.findIndex(v => v !== 0);
  if (axis < 0 || direction.filter(v => v !== 0).length !== 1 || Math.abs(direction[axis]) !== 1) throw new Error('Direction must be a signed unit axis');
  // Avoid per-cell bounds allocations: curved modules have many envelope cells.
  // This is the same strict overlap/contact test as above, with unchanged EPS.
  for (let i = 0; i < 3; i++) {
    if (i === axis) continue;
    if (moving.p[i] + moving.s[i]/2 <= obstacle.p[i] - obstacle.s[i]/2 + EPS || obstacle.p[i] + obstacle.s[i]/2 <= moving.p[i] - moving.s[i]/2 + EPS) return Infinity;
  }
  const aMin = moving.p[axis] - moving.s[axis]/2, aMax = moving.p[axis] + moving.s[axis]/2;
  const bMin = obstacle.p[axis] - obstacle.s[axis]/2, bMax = obstacle.p[axis] + obstacle.s[axis]/2;
  if (direction[axis] > 0) {
    if (bMax <= aMin + EPS) return Infinity;
    return Math.max(0, bMin - aMax);
  }
  if (bMin >= aMax - EPS) return Infinity;
  return Math.max(0, aMin - bMax);
}
export function blockers(piece, active) {
  if(piece.pathBlockers){const ids=new Set(active.map(p=>p.id));return piece.pathBlockers.filter(b=>ids.has(b.id)).map(b=>({...b})).sort((a,b)=>a.distance-b.distance);}
  const result = [];
  for (const other of active) {
    if (other.id === piece.id) continue;
    let distance = Infinity;
    for (const a of piece.boxes) for (const b of other.boxes) distance = Math.min(distance, firstContact(a, b, piece.dir));
    if (Number.isFinite(distance)) result.push({ id: other.id, distance });
  }
  return result.sort((a, b) => a.distance - b.distance);
}
export function available(active) { return active.filter(p => blockers(p, active).length === 0); }
export function solve(pieces) {
  let active = [...pieces];
  const solution = [];
  while (active.length) {
    const next = available(active).find(p => !p.core) || available(active)[0];
    if (!next) return null;
    solution.push(next.id);
    active = active.filter(p => p !== next);
  }
  return solution;
}
export function validateLevel(level) {
  const errors = [];
  const ids = new Set();
  for (const piece of level.pieces) {
    if (ids.has(piece.id)) errors.push(`duplicate ${piece.id}`);
    ids.add(piece.id);
    if (piece.dir.filter(v => v !== 0).length !== 1 || !piece.dir.every(v => [-1, 0, 1].includes(v))) errors.push(`direction ${piece.id}`);
    for (const b of piece.boxes||[]) if (b.s.some(v => v <= 0) || [...b.p, ...b.s].some(v => !Number.isFinite(v))) errors.push(`bounds ${piece.id}`);
    if(piece.pathBlockers&&piece.pathBlockers.some(b=>!level.pieces.some(p=>p.id===b.id)||b.id===piece.id))errors.push(`invalid mesh path ${piece.id}`);
  }
  if(!level.assetSHA256) for (let i = 0; i < level.pieces.length; i++) for (let j = i + 1; j < level.pieces.length; j++) {
    if (level.pieces[i].boxes.some(a => level.pieces[j].boxes.some(b => overlap(a, b)))) errors.push(`overlap ${level.pieces[i].id}/${level.pieces[j].id}`);
  }
  if (level.pieces.filter(p => p.core).length !== 1) errors.push('exactly one core required');
  if (!solve(level.pieces)) errors.push('unsolvable');
  if(level.assetSHA256){const seen=new Set();let exhausted=false;const visit=mask=>{if(seen.has(mask)||exhausted)return;if(seen.size>=200000){exhausted=true;errors.push('state budget exceeded; configuration rejected');return;}seen.add(mask);const active=level.pieces.filter((_,i)=>!(mask&(1n<<BigInt(i))));if(!active.length)return;const free=available(active);if(!free.length)errors.push('reachable deadlock');if(free.some(p=>p.core)&&active.length!==1)errors.push('early core');for(const p of free)visit(mask|(1n<<BigInt(level.pieces.indexOf(p))));};visit(0n);if(seen.size!==level.reachableStates)errors.push('native state mismatch');}
  return errors;
}
export class Puzzle {
  constructor(level) { this.level = level; this.active = new Map(level.pieces.map(p => [p.id, p])); this.removed = []; this.busy = false; this.won = false;this.pendingId=null; }
  inspect(id) {
    const piece = this.active.get(id);
    if (!piece) return { ok: false, reason: 'missing' };
    const blocked = blockers(piece, [...this.active.values()]);
    return { ok: !blocked.length, piece, blocked };
  }
  begin(id) {
    if (this.busy || this.won) return { ok: false, reason: 'busy' };
    const check = this.inspect(id);
    if (check.ok) {this.busy = true;this.pendingId=id;}
    return check;
  }
  complete(id) {
    if (!this.busy||id!==this.pendingId) return false;
    const piece = this.active.get(id);
    if (!piece) return false;
    this.active.delete(id); this.removed.push(id); this.busy = false;this.pendingId=null;
    this.won = !!piece.core;
    return true;
  }
}
export class Gesture {
  constructor(threshold = 9) { this.threshold = threshold; this.reset(); }
  reset() { this.pointer = null; this.dragged = false; }
  down(id, x, y, t) { if (this.pointer !== null) { this.dragged = true; return false; } this.pointer = id; this.x = x; this.y = y; this.lastX = x; this.lastY = y; this.t = t; this.dragged = false; return true; }
  move(id, x, y) {
    if (id !== this.pointer) return null;
    if (Math.hypot(x - this.x, y - this.y) >= this.threshold) this.dragged = true;
    const delta = this.dragged ? [x - this.lastX, y - this.lastY] : [0, 0];
    this.lastX = x; this.lastY = y;
    return delta;
  }
  up(id, x, y, t) {
    if (id !== this.pointer) return false;
    const tap = !this.dragged && Math.hypot(x - this.x, y - this.y) < this.threshold && t - this.t < 600;
    this.reset(); return tap;
  }
}
