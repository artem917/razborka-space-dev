import { LEVELS } from './levels.js';
import { Puzzle, Gesture, available, validateLevel } from './puzzle.js';

const $ = id => document.getElementById(id);
const TUTORIAL_KEY = 'razborka.tutorial.v1';
const SOUND_KEY = 'razborka.sound.v1';
const storage = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* Private mode still supports play. */ } } };
let view, puzzle, levelIndex = 0, generation = 0, gesture = new Gesture(), pointerPiece = null;
let tutorial = null, rotationDistance = 0, feedbackTimer, startTime = 0, blockedTaps = 0, rotations = 0;
let soundOn = storage.get(SOUND_KEY) !== 'off', audioContext;
const telemetry = [];
function record(type, data = {}) { telemetry.push({ type, time: Math.round(performance.now()), level: LEVELS[levelIndex].id, ...data }); if (telemetry.length > 1000) telemetry.shift(); }
function sound(kind) {
  if (!soundOn) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const notes = kind === 'win' ? [523, 659, 784, 1046] : kind === 'blocked' ? [140, 110] : [450 + puzzle.removed.length * 25, 850];
    notes.forEach((freq, i) => {
      const osc = audioContext.createOscillator(), gain = audioContext.createGain(), t = audioContext.currentTime + i * .08;
      osc.type = kind === 'blocked' ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(freq, t); osc.frequency.exponentialRampToValueAtTime(freq * .75, t + .13);
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.035, t + .009); gain.gain.exponentialRampToValueAtTime(.0001, t + .18);
      osc.connect(gain).connect(audioContext.destination); osc.start(t); osc.stop(t + .20);
    });
  } catch { /* Audio is an optional enhancement. */ }
}
function updateSound() { $('sound').setAttribute('aria-pressed', String(soundOn)); $('sound').setAttribute('aria-label', soundOn ? 'Выключить звук' : 'Включить звук'); }
function feedback(text, bad = false, duration = 2100) {
  clearTimeout(feedbackTimer); $('feedback').textContent = text; $('feedback').className = `feedback show${bad ? ' bad' : ''}`;
  feedbackTimer = setTimeout(() => $('feedback').classList.remove('show'), duration);
}
function updateProgress() {
  const total = puzzle.level.pieces.length, n = puzzle.removed.length;
  $('counter').innerHTML = `${n}<small>/${total}</small>`;
  $('progress-dial').style.setProperty('--progress', `${n / total * 100}%`);
  $('stage-status').textContent = puzzle.won ? 'ЯДРО ИЗВЛЕЧЕНО' : puzzle.active.size === 1 ? 'ТЕРМОЯДРО ДОСТУПНО' : n ? 'РАЗБОРКА В ПРОЦЕССЕ' : 'ОЖИДАЕТ РАЗБОРКИ';
}
function endTutorial() {
  if (!tutorial) return;
  tutorial = null; storage.set(TUTORIAL_KEY, 'seen'); $('tutorial').hidden = true; $('guide-hand').hidden = true; view.setHint(null); record('tutorial-complete');
}
function guideStep(step) {
  tutorial = step; $('tutorial').hidden = false; $('guide-hand').hidden = false;
  $('guide-step').textContent = step === 'rotate' ? '01 / 02 · ОСМОТРИ' : '02 / 02 · СНИМИ';
  $('guide-title').textContent = step === 'rotate' ? 'Потяни, чтобы осмотреть' : 'Нажми на подставку';
  $('guide-text').textContent = step === 'rotate' ? 'Поверни чайник одним пальцем.' : 'Бирюзовая стрелка: путь вниз свободен.';
  $('guide-hand').className = `guide-hand ${step === 'rotate' ? 'drag' : 'tap'}`;
  if (step === 'remove') view.setHint('base');
  positionHand();
}
function positionHand() {
  if (!tutorial || !view) return;
  const marker = tutorial === 'remove' ? view.marker('base') : null;
  $('guide-hand').style.left = `${marker ? marker.x - 13 : view.width * .52}px`;
  $('guide-hand').style.top = `${marker ? marker.y + 4 : view.height * .42}px`;
}
function loadLevel(index) {
  generation++; levelIndex = index; puzzle = new Puzzle(LEVELS[index]); gesture.reset(); pointerPiece = null;
  view.load(puzzle.level); rotations = 0; blockedTaps = 0; rotationDistance = 0; startTime = performance.now();
  $('win').hidden = true; $('feedback').classList.remove('show'); clearTimeout(feedbackTimer);
  $('brakych-line').textContent = ['Чайник обычный. Просто тяга — девять тонн.', 'По инструкции внутри только вода. Инструкция врёт.', 'Не забудь заглянуть сзади. Там обычно и прячут брак.'][index];
  document.querySelectorAll('[data-level]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.level) === index)));
  updateProgress(); record('load', { parts: puzzle.active.size });
  if (storage.get(TUTORIAL_KEY) !== 'seen') guideStep('rotate');
  else { tutorial = null; $('tutorial').hidden = true; $('guide-hand').hidden = true; }
}
function attempt(id) {
  if (!id || !puzzle || puzzle.won || puzzle.busy) return;
  if (tutorial === 'rotate') { feedback('Сначала потяни чайник в сторону.'); return; }
  const result = puzzle.begin(id);
  if (!result.ok) {
    if (!result.blocked?.length) return;
    blockedTaps++; record('blocked', { id, blockers: result.blocked }); view.flash(id, result.blocked);
    const blocker = puzzle.active.get(result.blocked[0].id);
    view.showPath(id);
    feedback(`Мешает: ${blocker.name.toLowerCase()}. Крестик — место упора.`, true);
    sound('blocked'); navigator.vibrate?.(12); return;
  }
  clearTimeout(feedbackTimer); $('feedback').classList.remove('show');
  view.showPath(id, 900); record('remove-start', { id }); sound('remove');
  const token = generation;
  view.remove(id, () => {
    if (token !== generation) return;
    puzzle.complete(id); updateProgress(); record('remove-complete', { id });
    if (tutorial && id === 'base') endTutorial();
    if (puzzle.won) win();
    else if (puzzle.active.size === 1) feedback('Вот оно! Нажми на термоядро.', false, 2500);
  });
}
function win() {
  endTutorial(); sound('win'); navigator.vibrate?.([15, 35, 25]);
  const elapsed = Math.round((performance.now() - startTime) / 1000);
  $('win-detail').textContent = `${puzzle.removed.length} деталей · ${elapsed} сек · ни капли лишнего чая`;
  $('win-stamp').textContent = puzzle.level.stamp;
  $('brakych-line').textContent = `«${puzzle.level.reaction}»`;
  $('next-level').innerHTML = levelIndex < 2 ? 'Следующий чайник <span>→</span>' : 'Ещё один разбор <span>↻</span>';
  $('win').hidden = false; $('next-level').focus({ preventScroll: true });
  record('win', { seconds: elapsed, blockedTaps, rotations, removed: [...puzzle.removed] });
}
function bindInput() {
  const stage = $('stage');
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || !puzzle || puzzle.won || puzzle.busy) return;
    e.preventDefault();
    if (!gesture.down(e.pointerId, e.clientX, e.clientY, performance.now())) return;
    stage.setPointerCapture(e.pointerId);
    const r = stage.getBoundingClientRect();
    const markerId = e.target.closest('[data-piece]')?.dataset.piece;
    pointerPiece = markerId && view.marker(markerId) ? markerId : view.pickInput(e.clientX - r.left, e.clientY - r.top);
    if (pointerPiece && tutorial !== 'rotate') view.showPath(pointerPiece);
  });
  stage.addEventListener('pointermove', e => {
    const delta = gesture.move(e.pointerId, e.clientX, e.clientY); if (!delta) return;
    if (delta[0] || delta[1]) {
      view.rotate(...delta); rotationDistance += Math.hypot(...delta);
      if (tutorial === 'rotate' && rotationDistance > 35) guideStep('remove');
      positionHand();
    }
  });
  stage.addEventListener('pointerup', e => {
    if (gesture.pointer !== e.pointerId) return;
    const wasDragged = gesture.dragged, tap = gesture.up(e.pointerId, e.clientX, e.clientY, performance.now());
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    if (wasDragged) { rotations++; record('rotate', { x: view.root.rotation.x, y: view.root.rotation.y }); }
    if (tap) {
      const r = stage.getBoundingClientRect(), fromGeometry = view.pickInput(e.clientX - r.left, e.clientY - r.top);
      // Markers are anchored to a currently visible, ray-tested face. No picking through shells.
      const marker = view.marker(pointerPiece);
      const nearMarker = marker && Math.hypot(marker.x - (e.clientX - r.left), marker.y - (e.clientY - r.top)) < 25;
      if (fromGeometry === pointerPiece || nearMarker) attempt(pointerPiece);
    }
    pointerPiece = null;
  });
  stage.addEventListener('pointercancel', () => { gesture.reset(); pointerPiece = null; record('pointer-cancel'); });
  stage.addEventListener('lostpointercapture', () => { gesture.reset(); pointerPiece = null; });
  window.addEventListener('blur', () => { gesture.reset(); pointerPiece = null; });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && tutorial) endTutorial();
    if (document.activeElement !== stage || puzzle.won || puzzle.busy) return;
    const delta = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[e.key];
    if (delta) { e.preventDefault(); view.rotate(...delta); rotationDistance += 12; if (tutorial === 'rotate' && rotationDistance > 35) guideStep('remove'); }
  });
  $('skip-tutorial').addEventListener('click', endTutorial);
  $('restart').addEventListener('click', () => loadLevel(levelIndex));
  $('win-restart').addEventListener('click', () => loadLevel(levelIndex));
  $('next-level').addEventListener('click', () => loadLevel((levelIndex + 1) % LEVELS.length));
  document.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => loadLevel(Number(b.dataset.level))));
  $('sound').addEventListener('click', () => { soundOn = !soundOn; storage.set(SOUND_KEY, soundOn ? 'on' : 'off'); updateSound(); if (soundOn) sound('remove'); });
  $('hint').addEventListener('click', () => {
    if (puzzle.won || puzzle.busy) return;
    if (tutorial === 'rotate') { feedback('Потяни чайник, чтобы изменить ракурс.'); return; }
    const free = available([...puzzle.active.values()]);
    const visible = free.find(p => view.marker(p.id));
    view.setHint(visible?.id || free[0]?.id);
    if (visible) view.showPath(visible.id, 3000);
    feedback(visible ? `Свободна: ${visible.name.toLowerCase()}` : 'Поверни чайник — свободная деталь с другой стороны.', false, 3000);
    record('hint', { id: (visible || free[0])?.id });
  });
  new ResizeObserver(positionHand).observe(stage);
}
async function boot() {
  try {
    for (const level of LEVELS) { const errors = validateLevel(level); if (errors.length) throw new Error(`${level.id}: ${errors.join('; ')}`); }
    const { WorkshopScene } = await import('./scene.js');
    view = new WorkshopScene($('canvas-host'), $('indicators')); bindInput(); updateSound(); loadLevel(0); $('loading').hidden = true;
    view.renderer.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault(); $('fatal-message').textContent = 'Браузер приостановил 3D. Перезапусти стенд.'; $('fatal').hidden = false;
    });
    // Read-only inspection for repeatable browser evidence. No solve/remove/rotation backdoors.
    Object.defineProperty(window, '__salvage', { value: Object.freeze({
      snapshot: () => ({ level: puzzle.level.id, total: puzzle.level.pieces.length, active: [...puzzle.active.keys()], removed: [...puzzle.removed], busy: puzzle.busy, won: puzzle.won, tutorial, blockedTaps, rotations, angle: { x: view.root.rotation.x, y: view.root.rotation.y }, available: available([...puzzle.active.values()]).map(p => p.id), markers: view.markerData.map(m => ({ id: m.id, x: m.x, y: m.y })), arrows: view.arrowEvidence(), path: view.pathPreview ? structuredClone(view.pathPreview) : null, motion: view.motionEvidence(), metrics: view.metrics() }),
      events: () => structuredClone(telemetry),
      hit: (x, y) => view.pick(x, y),
    }) });
  } catch (error) {
    console.error(error); $('loading').hidden = true; $('fatal-message').textContent = 'Нужен браузер с WebGL 2 и аппаратным ускорением. ' + error.message; $('fatal').hidden = false;
  }
}
boot();
