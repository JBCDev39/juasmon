// ============================================================
//  INTERFAZ (lo que se ve y se oye)
//  Solo dibuja el estado y manda acciones al motor.
//  Para jugar en línea, dispatch() enviará la acción al servidor y
//  render() se llamará cuando llegue el estado nuevo.
// ============================================================
import * as E from './engine.js';
import { connectCloud } from './nube.js';

{
const $app = document.getElementById('app');
const $ov = document.getElementById('overlay');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TYPE_COLORS = { 1: '#A8A77A', 2: '#C22E28', 3: '#A98FF3', 4: '#A33EA1', 5: '#E2BF65', 6: '#B6A136', 7: '#A6B91A', 8: '#735797', 9: '#B7B7CE', 10: '#EE8130', 11: '#6390F0', 12: '#7AC74C', 13: '#F7D02C', 14: '#F95587', 15: '#96D9D6', 16: '#6F35FC', 17: '#705746', 18: '#D685AD' };
const DARK_INK = new Set([1, 3, 5, 6, 7, 9, 12, 13, 15]);
const PCOLORS = ['var(--red)', 'var(--blue)', '#c98a00', '#8a4fd8'];
const SHORT = { masomenos: 'Más o Menos', idioma: 'Idioma', preguntas: 'Preguntas', quien: '¿Quién es?', pokedex: 'Pokédex', intruso: 'Intruso', estimacion: 'Estimación', pokedle: 'Pokédle', mezcla: 'Partida' };
const SCORING = {
  masomenos: '1 punto por acierto.', idioma: '3 puntos sin pistas, 2 con una pista, 1 con dos.', preguntas: '1 punto por acierto; medio punto si casi.',
  quien: '3 puntos con una pista, 2 con dos, 1 con más.', pokedex: '1 punto por acierto.', intruso: '1 punto por acierto.',
  estimacion: 'En multijugador, el punto es para quien quede más cerca.', pokedle: 'En multijugador, el punto es para quien lo adivine primero.',
  mezcla: 'Cada pregunta vale 1 punto (medio si casi). Pokeidioma y ¿Quién es? valen hasta 3.',
};
// Rangos según la experiencia acumulada (puntos ganados en todas las partidas).
const RANKS = [[0, 'Novato'], [25, 'Entrenador'], [75, 'Líder de gimnasio'], [175, 'Campeón'], [350, 'Jovensaso']];
const rankOf = xp => { let r = RANKS[0]; for (const x of RANKS) if (xp >= x[0]) r = x; const i = RANKS.indexOf(r); return { name: r[1], next: RANKS[i + 1] || null, i }; };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches;
const APP_VERSION = 7;
const FLAG_REASONS = ['La respuesta está mal', 'La pregunta no tiene sentido o es confusa', 'Un nombre o dato está mal escrito', 'Es demasiado fácil o difícil', 'Otro'];
const FLAG_SVG = '<svg class="flagico" viewBox="0 0 10 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="0" width="1" height="12" fill="currentColor"/><rect x="2" y="1" width="6" height="1" fill="var(--red)"/><rect x="2" y="2" width="7" height="3" fill="var(--red)"/><rect x="2" y="5" width="5" height="1" fill="var(--red)"/></svg>';
const store = {
  load(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } },
};

// ---------- sonidos 8 bits (generados aquí mismo, sin archivos) ----------
const Sound = {
  ac: null, muted: store.load('pt-mute', false),
  ensure() {
    if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (this.ac.state === 'suspended') this.ac.resume().catch(() => {});
    return this.ac;
  },
  tone(f, at, dur, type = 'square', vol = 0.05) {
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, at);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(ac.destination); o.start(at); o.stop(at + dur + 0.02);
  },
  SEQ: {
    select: [[880, 0, .06]], back: [[520, 0, .06]], type: [[700, 0, .025, 'square', .018]],
    start: [[523, 0, .09], [659, .09, .09], [784, .18, .09], [1047, .27, .22]],
    correct: [[784, 0, .08], [1175, .08, .18]],
    wrong: [[247, 0, .14, 'sawtooth', .04], [175, .13, .26, 'sawtooth', .04]],
    hint: [[660, 0, .06], [990, .07, .08]], tick: [[1320, 0, .03, 'square', .03]],
    round: [[392, 0, .1], [523, .1, .1], [659, .2, .1], [784, .3, .25]],
    win: [[523, 0, .12], [523, .13, .12], [523, .26, .12], [698, .4, .35], [880, .78, .12], [784, .9, .12], [1047, 1.02, .5]],
    over: [[392, 0, .18, 'triangle', .07], [330, .2, .18, 'triangle', .07], [262, .4, .4, 'triangle', .07]],
    ok: [[880, 0, .05], [1320, .05, .08]],
    juas: [[740, 0, .04, 'square', .07], [220, .03, .1, 'sawtooth', .08], [110, .09, .16, 'square', .06], [988, .2, .12, 'square', .05]],
    crit: [[740, 0, .04, 'square', .07], [220, .03, .1, 'sawtooth', .08], [110, .09, .14, 'square', .06], [1175, .2, .08], [1568, .28, .2]],
    rankup: [[523, 0, .1], [659, .1, .1], [784, .2, .1], [1047, .3, .1], [1319, .4, .3]],
    boom: [[160, 0, .35, 'sawtooth', .09], [90, .05, .5, 'square', .07], [55, .15, .6, 'sawtooth', .06]],
  },
  play(name) {
    if (this.muted || !this.SEQ[name] || !this.ensure()) return;
    const t = this.ac.currentTime + 0.01;
    for (const [f, off, d, type, vol] of this.SEQ[name]) this.tone(f, t + off, d, type, vol);
  },
  toggle() { this.muted = !this.muted; store.save('pt-mute', this.muted); if (!this.muted) this.play('select'); },
};

// ---------- dibujos pixelados ----------
// Medallas: diseños pixelados propios.
const MEDALS = [
  { id: 'primera', name: 'Medalla Inicio', how: 'Termina tu primera partida.', color: '#c98a00', pix: ['....##....', '...####...', '..######..', '.########.', '##########', '##########', '.########.', '..######..', '...####...', '....##....'] },
  { id: 'racha10', name: 'Medalla Racha', how: '10 aciertos seguidos en una partida.', color: '#e3350d', pix: ['....#.....', '...##.....', '..###.....', '.#######..', '..#######.', '.....###..', '.....##...', '.....#....', '..........', '..........'] },
  { id: 'veloz', name: 'Medalla Rayo', how: '15 puntos o más en Contrarreloj.', color: '#f7d02c', pix: ['.....###..', '....###...', '...###....', '..#######.', '.....###..', '....###...', '...###....', '..##......', '.#........', '..........'] },
  { id: 'superviviente', name: 'Medalla Corazón', how: '20 puntos o más en Supervivencia.', color: '#d7263d', pix: ['..........', '.##...##..', '####.####.', '#########.', '#########.', '.#######..', '..#####...', '...###....', '....#.....', '..........'] },
  { id: 'rosco20', name: 'Medalla Rosco', how: '20 letras o más en un Juasrosco.', color: '#e8722a', pix: ['...####...', '..#....#..', '.#......#.', '#........#', '#........#', '#........#', '#........#', '.#......#.', '..#....#..', '...####...'] },
  { id: 'retos5', name: 'Medalla Constancia', how: 'Completa 5 retos del día.', color: '#2f6fdb', pix: ['.########.', '.#......#.', '.########.', '.#.#.#.#..', '.########.', '.#.#.#.#..', '.########.', '.#.#.#.#..', '.########.', '..........'] },
  { id: 'perfecto', name: 'Medalla Perfecta', how: '10 de 10 en un reto del día.', color: '#2e9e4f', pix: ['....#.....', '....#.....', '...###....', '#########.', '.#######..', '..#####...', '.###.###..', '.##...##..', '.#.....#..', '..........'] },
  { id: 'jovensaso', name: 'Medalla Jovensaso', how: 'Llega al rango Jovensaso.', color: '#8a4fd8', pix: ['#..#..#..#', '##.##.##.#', '##########', '##########', '#.######.#', '.########.', '.########.', '..........', '..........', '..........'] },
];
const crDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
let daily = store.load('pt-daily', {});
let dailyBoard = null, userId = null;

const PIX = {
  star: ['.....##.....', '.....##.....', '....####....', '############', '.##########.', '..########..', '...######...', '..###..###..', '.###....###.', '.##......##.', '............', '............'],
  ring: ['....####....', '..##....##..', '.#........#.', '.#........#.', '#..........#', '#..........#', '#..........#', '#..........#', '.#........#.', '.#........#.', '..##....##..', '....####....'],
  play: ['............', '...#........', '...##.......', '...###......', '...####.....', '...#####....', '...#####....', '...####.....', '...###......', '...##.......', '...#........', '............'],
  one: ['....####....', '...######...', '...######...', '...######...', '....####....', '............', '..########..', '.##########.', '.##########.', '.##########.', '.##########.', '............'],
  two: ['............', '..##....##..', '.####..####.', '.####..####.', '..##....##..', '............', '.####..####.', '#####..#####', '#####..#####', '#####..#####', '#####..#####', '............'],
  pencil: ['.........##.', '........####', '.......####.', '......####..', '.....####...', '....####....', '...####.....', '..####......', '.####.......', '.##.........', '#...........', '............'],
  trophy: ['############', '#.########.#', '#.########.#', '.#.######.#.', '...######...', '....####....', '.....##.....', '.....##.....', '....####....', '...######...', '...######...', '............'],
  heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
};
function pixSvg(rows, color = '#1d2321', cls = '') {
  const h = rows.length, w = rows[0].length;
  let r = '';
  rows.forEach((row, y) => { for (let x = 0; x < w; x++) if (row[x] === '#') r += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`; });
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" fill="${color}" aria-hidden="true">${r}</svg>`;
}
const ICON_SOUND_ON = '<svg viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><path d="M2 6h3l5-4v14l-5-4H2z"/><path d="M12.5 5.5a5 5 0 0 1 0 7M14.5 3.5a8 8 0 0 1 0 11" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>';
const ICON_SOUND_OFF = '<svg viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><path d="M2 6h3l5-4v14l-5-4H2z"/><path d="M12 6l5 6M17 6l-5 6" stroke="currentColor" stroke-width="1.8"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><rect x="4" y="3" width="3.5" height="12"/><rect x="10.5" y="3" width="3.5" height="12"/></svg>';

// Paisaje pixelado de 320×180, se escala nítido a cualquier pantalla.
let sceneCache = '';
function scene() {
  if (sceneCache) return sceneCache;
  let s = 12345;
  const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
  const W = 320, H = 180;
  let out = `<svg class="scene" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges" aria-hidden="true">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset="1" style="stop-color:var(--sky2)"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  for (let i = 0; i < 40; i++) out += `<rect class="twinkle" x="${Math.floor(rnd() * W)}" y="${Math.floor(rnd() * 90)}" width="1" height="1" fill="var(--star)" style="animation-delay:${(-rnd() * 2.4).toFixed(2)}s"/>`;
  // sol o luna
  const cx = 252, cy = 38, rad = 13;
  for (let y = -rad; y <= rad; y++) { const half = Math.floor(Math.sqrt(rad * rad - y * y)); out += `<rect x="${cx - half}" y="${cy + y}" width="${half * 2}" height="1" fill="var(--sun)"/>`; }
  // nubes que se mueven despacio
  const cloud = (w) => { let c = ''; const blocks = [[0, 4, w, 4], [4, 0, w - 10, 5], [w * .3 | 0, -3, w * .35 | 0, 4]]; for (const [x, y, bw, bh] of blocks) c += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="var(--cloud)"/>`; return c + `<rect x="2" y="8" width="${w - 2}" height="2" fill="var(--cloud2)"/>`; };
  for (let i = 0; i < 5; i++) {
    const dur = 70 + rnd() * 70;
    out += `<g class="drift" style="animation-duration:${dur.toFixed(0)}s;animation-delay:${(-rnd() * dur).toFixed(0)}s"><g transform="translate(0 ${Math.floor(14 + rnd() * 58)})">${cloud(Math.floor(22 + rnd() * 26))}</g></g>`;
  }
  // tres capas de colinas escalonadas
  const hills = (base, amp, step, fill, f1, f2) => {
    let d = `M0 ${H}`;
    for (let x = 0; x <= W; x += step) { const y = Math.round(base - amp * (Math.sin(x * f1 + base) * .6 + Math.sin(x * f2 + base * 2) * .4)); d += ` L${x} ${y} L${x + step} ${y}`; }
    return `<path d="${d} L${W} ${H} Z" fill="${fill}"/>`;
  };
  out += hills(112, 16, 8, 'var(--h1)', 0.021, 0.047) + hills(128, 12, 6, 'var(--h2)', 0.031, 0.013) + hills(144, 8, 4, 'var(--h3)', 0.045, 0.02);
  out += `<rect y="152" width="${W}" height="${H - 152}" fill="var(--gr)"/>`;
  // hierba alta que se mece
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rnd() * W), y = 156 + Math.floor(rnd() * 22);
    out += `<path class="sway" style="animation-delay:${(-rnd() * 2.6).toFixed(2)}s" d="M${x} ${y}h1v-4h1v4h1v-3h1v3h1v-5h1v5h1v-3h1v3h1v1h-9z" fill="var(--tuft)"/>`;
  }
  sceneCache = out + '</svg>';
  return sceneCache;
}

// ---------- estado de la interfaz ----------
let raw = null, bank = [], world = null, historia = [], pokedex = {}, roscoHand = [], extra = null, ctx = null, state = null, view = 'title', overlay = null, flash = '';
const DEFAULT_UI = { players: ['Rojo', 'Azul'], structure: 'mezclada', formats: Object.keys(E.FORMATS), rounds: ['masomenos', 'idioma', 'preguntas'], perPlayer: 3, gens: [1, 2, 3, 4, 5, 6, 7, 8, 9], cats: Object.keys(E.CATS), idiomaMode: 'opciones', timer: 0, solo: { type: 'supervivencia', name: 'Rojo', perRound: 5, duration: 60 }, rosco: { players: ['Rojo', 'Azul'], time: 150 } };
let cfg = { ...DEFAULT_UI, ...store.load('pt-config', {}) };
cfg.solo = { ...DEFAULT_UI.solo, ...(cfg.solo || {}) };
if (cfg.players.length < 2) cfg.players = DEFAULT_UI.players.slice();
if (!Array.isArray(cfg.cats) || !cfg.cats.length) cfg.cats = Object.keys(E.CATS);
if (!Array.isArray(cfg.formats) || !cfg.formats.length) cfg.formats = Object.keys(E.FORMATS);
cfg.rosco = { ...DEFAULT_UI.rosco, ...(cfg.rosco || {}) };
cfg.rounds = cfg.rounds.filter(r => E.ROUND_MODES.includes(r)); if (!cfg.rounds.length) cfg.rounds = DEFAULT_UI.rounds.slice();
let custom = store.load('pt-custom', []);
let records = store.load('pt-records', { solo: {}, duels: {}, games: 0, xp: {} });
records.xp ||= {};
let last = { screen: '', q: '', view: '', scores: [] };
let F = { newScreen: true, newQ: true };
let clock = { qKey: '', qEnd: 0, qLeft: 0, tEnd: 0, tLeft: 0, paused: false, id: null, lastSec: -1 };
let autoNext = null, endInfo = { newRecord: false }, typers = [];
let draft = { order: [], links: [], sel: null, multi: [] };
let reports = store.load('pt-reports', []), flagged = new Set(reports.map(r => r.key)), flagCtx = null, remoteReports = null, dbRef = null, toastTimer = null;
// La nube (Firebase, o la base de la página dentro de Claude): ahí llegan los reportes y la tabla del día.
(async () => {
  try { ({ db: dbRef, userId } = await connectCloud()); } catch { dbRef = null; userId = null; }
  if (dbRef) { syncReports(); if (view === 'daily') loadDailyBoard(); if (view === 'reports') loadRemote(); }
})();

// App instalable: el botón «Instalar» aparece cuando el navegador lo permite.
let installEvt = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (view === 'menu') render(); });
window.addEventListener('appinstalled', () => { installEvt = null; toast('¡JUASmon instalado!'); if (view === 'menu') render(); });
if ('serviceWorker' in navigator && window.isSecureContext && !window.claude && window.self === window.top) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
async function syncReports() {
  if (!dbRef) return;
  for (const r of reports.filter(x => !x.synced)) {
    try { await dbRef.collection('reportes').doc(r.id).set(r.data); r.synced = true; } catch { break; }
  }
  store.save('pt-reports', reports);
  if (view === 'reports') render();
}
function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast px'; t.textContent = msg; document.body.appendChild(t);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2600);
}
const pokeName = id => ctx?.byId.get(+id)?.name ?? id;
function snapQuestion() {
  const q = JSON.parse(JSON.stringify(state.q));
  if (Array.isArray(q.valid) && q.valid.length > 40) q.valid = q.valid.slice(0, 40);
  const r = state.result || {};
  return { q, given: r.given ?? null, points: r.points ?? null, correct: !!r.correct };
}
function qSummary(d) {
  const q = d.q || {};
  if (q.kind === 'rosco') return `Juasrosco, letra ${q.L}: ${q.clue} → ${q.answer}`;
  if (q.q) return q.q.replace(/\{t:(\d+)\}/g, (_, id) => ctx?.typeName.get(+id) || '');
  if (q.kind === 'masomenos') return `Más o Menos: ${pokeName(q.b)} contra ${pokeName(q.a)} (${q.label})`;
  if (['idioma', 'quien', 'pokedex', 'pokedle'].includes(q.kind)) return `${E.FORMATS[q.kind]}: ${pokeName(q.answer)}`;
  return E.FORMATS[q.kind] || 'Pregunta';
}
function saveReport(reason, note) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const reporter = state ? (state.config.type === 'rosco' ? state.players[flagCtx.player ?? 0]?.name : state.players[E.currentPlayer(state)]?.name) : '';
  const data = { at: Date.now(), version: APP_VERSION, reason, note: note.slice(0, 500), reporter: reporter || '', mode: state?.config.type || '', ...flagCtx.data };
  data.summary = qSummary(data);
  reports = [{ id, key: flagCtx.key, synced: false, data }, ...reports].slice(0, 300);
  flagged.add(flagCtx.key);
  store.save('pt-reports', reports);
  syncReports();
}
const recorded = new Set();

const saveCfg = () => store.save('pt-config', cfg);
const pColor = i => PCOLORS[i % PCOLORS.length];
const badge = id => `<span class="type" style="--t:${TYPE_COLORS[id]};--ti:${DARK_INK.has(id) ? '#1d2321' : '#fff'}">${esc(ctx.typeName.get(id))}</span>`;
const typePills = p => `<div class="types">${p.types.map(badge).join('')}</div>`;
// {t:10} → etiqueta de tipo. Una opción que es solo un tipo (o "Planta / Volador") también se dibuja como etiquetas.
const richText = str => esc(str).replace(/\{t:(\d+)\}/g, (_, id) => badge(+id));
let typeByName = null;
function optText(str) {
  typeByName ||= new Map(ctx.types.map(t => [t.name, t.id]));
  const parts = String(str).split(' / ');
  if (parts.every(x => typeByName.has(x))) return `<span class="types inline">${parts.map(x => badge(typeByName.get(x))).join('')}</span>`;
  return richText(str);
}
const fmtPts = x => Number.isInteger(x) ? String(x) : String(x).replace('.', ',');
const dexNo = id => `#${String(id).padStart(4, '0')}`;
const fmtVal = (v, unit) => `${Number(v).toLocaleString('es')}${unit ? ' ' + unit : ''}`;
const tog = (act, val, on, label) => `<button class="tog" data-act="${act}" data-val="${esc(val)}" aria-pressed="${on}">${label}</button>`;
const soundBtn = () => `<button class="ibtn" data-act="mute" aria-label="${Sound.muted ? 'Activar sonido' : 'Silenciar'}">${Sound.muted ? ICON_SOUND_OFF : ICON_SOUND_ON}<span>${Sound.muted ? 'Sin sonido' : 'Sonido'}</span></button>`;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

function dispatch(action) {
  const prev = state;
  state = E.reduce(state, action, ctx);
  if (state === prev) return;
  afterAction(prev, action);
  persist();
  render();
}

function afterAction(prev, action) {
  const s = state;
  if (action.type === 'BOMB_ANSWER') Sound.play(s.q.bomb.last?.ok ? 'ok' : 'back');
  if (action.type === 'BOMB_END') { Sound.play('boom'); store.save('pt-history', { mons: s.used.slice(-800), bank: s.usedBank }); }
  if (s.phase === 'reveal' && prev.phase === 'question') {
    const r = s.result;
    if (action.type !== 'BOMB_END') Sound.play(r.correct ? (r.streak >= 3 ? 'crit' : 'juas') : r.partial ? 'ok' : 'wrong');
    store.save('pt-history', { mons: s.used.slice(-800), bank: s.usedBank });
    if (s.config.type === 'contrarreloj') scheduleAuto();
  }
  if (action.type === 'PD_GUESS' && s.phase === 'question') Sound.play(s.q.pd.last ? 'back' : 'select');
  if (action.type === 'EST_ANSWER' && s.phase === 'question') Sound.play('select');
  if (action.type === 'ROSCO_ANSWER' && s.rosco?.last) Sound.play(s.rosco.last.ok ? 'juas' : 'wrong');
  if (action.type === 'ROSCO_PASS') Sound.play('hint');
  if (action.type === 'ROSCO_TIME') Sound.play('boom');
  if (action.type === 'HINT') Sound.play('hint');
  if (action.type === 'START' || action.type === 'REMATCH') {
    clock.qKey = ''; clock.qEnd = 0;
    clock.tEnd = 0; clock.tLeft = s.config.duration * 1000;
    if (action.type === 'START') { Sound.play('start'); if (s.config.type === 'contrarreloj') clock.tEnd = Date.now() + clock.tLeft; }
    if (action.type === 'REMATCH') last.scores = [];
  }
  if (s.phase === 'roundEnd' && prev.phase !== 'roundEnd') Sound.play('round');
  if (s.phase === 'end' && prev.phase !== 'end') {
    recordEnd();
    Sound.play(endInfo.medals?.length || endInfo.rankUp?.length ? 'rankup' : s.players.length > 1 || endInfo.newRecord || s.config.daily ? 'win' : 'over');
    if (endInfo.medals?.length) setTimeout(() => toast(`¡Nueva medalla: ${endInfo.medals[0].medal.name}!`), 900);
  }
}

function scheduleAuto() {
  clearTimeout(autoNext);
  autoNext = setTimeout(() => { autoNext = null; if (!clock.paused && state?.phase === 'reveal') dispatch({ type: 'NEXT' }); }, 750);
}

function persist() {
  if (view !== 'game' || !state || state.config.type === 'contrarreloj') return;
  if (state.phase === 'rosco') { store.save('pt-save', { state, at: Date.now() }); return; }
  if (state.phase === 'end') store.del('pt-save');
  else store.save('pt-save', { state, at: Date.now() });
}

function recordEnd() {
  if (recorded.has(state.seed)) return;
  recorded.add(state.seed);
  const c = state.config;
  endInfo = { newRecord: false, prev: null, xp: [], rankUp: [] };
  // Experiencia: cada punto ganado suma, para todos los jugadores con nombre.
  state.players.forEach((p, i) => {
    const k = p.name.trim(); if (!k) return;
    const before = records.xp[k] || 0, gained = Math.round(state.scores[i] * 2) / 2;
    records.xp[k] = before + gained;
    endInfo.xp[i] = gained;
    const a = rankOf(before), b = rankOf(records.xp[k]);
    if (b.i > a.i) endInfo.rankUp.push({ name: k, rank: b.name });
  });
  if (state.players.length === 1 && !c.daily) {
    const nr = E.roundList(state).length;
    const key = c.type === 'clasica' ? `clasica:${c.perPlayer}:${E.isMixed(state) ? 'mix' : nr}` : c.type === 'contrarreloj' ? `contrarreloj:${c.duration}` : c.type === 'rosco' ? `rosco:${c.roscoTime}` : c.type;
    const label = c.type === 'clasica' ? `Clásica · ${c.perPlayer} preguntas${E.isMixed(state) ? ' · mezclada' : ` por ronda · ${plural(nr, 'ronda', 'rondas')}`}` : c.type === 'contrarreloj' ? `Contrarreloj · ${c.duration} s` : c.type === 'rosco' ? `Juasrosco · ${c.roscoTime} s` : E.GAME_TYPES[c.type].name;
    const old = records.solo[key];
    const score = state.scores[0];
    endInfo.prev = old ? old.best : null;
    if (!old || score > old.best) { endInfo.newRecord = score > 0; records.solo[key] = { label, best: score, streak: Math.max(state.bestStreak, old?.streak || 0), at: Date.now() }; }
    else records.solo[key] = { ...old, streak: Math.max(state.bestStreak, old.streak || 0) };
  } else if (state.players.length > 1) {
    const w = E.winners(state);
    if (w.length === 1) { const k = w[0].name.trim(); records.duels[k] = (records.duels[k] || 0) + 1; }
    records.games = (records.games || 0) + 1;
  }
  if (c.daily) recordDaily(state);
  // Medallas
  records.medals ||= {};
  endInfo.medals = [];
  const doneDaily = Object.keys(daily).length;
  state.players.forEach((p, i) => {
    const k = p.name.trim(); if (!k) return;
    const have = new Set(records.medals[k] || []), sc = state.scores[i];
    const earn = id => { if (!have.has(id)) { have.add(id); endInfo.medals.push({ name: k, medal: MEDALS.find(m => m.id === id) }); } };
    earn('primera');
    if ((state.bestStreaks?.[i] || 0) >= 10) earn('racha10');
    if (c.type === 'contrarreloj' && sc >= 15) earn('veloz');
    if (c.type === 'supervivencia' && sc >= 20) earn('superviviente');
    if (c.type === 'rosco' && sc >= 20) earn('rosco20');
    if (c.daily && doneDaily >= 5) earn('retos5');
    if (c.daily && state.log.filter(l => l.correct).length === 10) earn('perfecto');
    if (rankOf(records.xp[k] || 0).name === 'Jovensaso') earn('jovensaso');
    records.medals[k] = [...have];
  });
  store.save('pt-records', records);
}

// Reto del día: se guarda una sola vez por fecha (y en la tabla compartida, si se puede).
function recordDaily(s) {
  const date = s.config.daily;
  if (daily[date]) return;
  const right = s.log.filter(l => l.correct).length;
  daily[date] = { score: s.scores[0], right, total: s.log.length, at: Date.now(), name: s.players[0].name };
  store.save('pt-daily', daily);
  if (dbRef) {
    const id = (userId || E.normalize(s.players[0].name) || 'anon').replace(/[^A-Za-z0-9_.~:@+-]/g, '').slice(0, 60) || 'anon';
    dbRef.collection(`retos/${date}/puntajes`).doc(id).set({ name: s.players[0].name.slice(0, 24), score: s.scores[0], right, at: Date.now() }).then(loadDailyBoard).catch(() => {});
  }
}
function dailyStreak() {
  let n = 0, d = new Date();
  if (!daily[crDate(d)]) d = new Date(d.getTime() - 864e5);
  while (daily[crDate(d)]) { n++; d = new Date(d.getTime() - 864e5); }
  return n;
}
async function loadDailyBoard() {
  if (!dbRef) return;
  try {
    const snap = await dbRef.collection(`retos/${crDate()}/puntajes`).orderBy('score', 'desc').limit(50).get();
    dailyBoard = snap.docs.map(d => d.data());
  } catch { dailyBoard = null; }
  if (view === 'daily' || (view === 'game' && state?.config.daily)) render();
}
function startDaily() {
  const date = crDate();
  const saved = store.load('pt-save', null);
  if (saved?.state?.config.daily === date) { rebuildCtx(true); state = saved.state; last.scores = state.scores.slice(); clock.qKey = ''; clock.paused = false; goto('game'); return; }
  rebuildCtx(true);
  state = E.createGame(E.dailyConfig(date, cfg.solo.name.trim() || 'Rojo'), E.dailySeed(date), {});
  last.scores = []; endInfo = { newRecord: false, prev: null };
  clock.qKey = ''; clock.tEnd = 0; clock.paused = false;
  goto('game');
}
function boardHtml() {
  if (!dbRef) return '<p class="hint">La tabla compartida no está disponible ahora. Tu resultado se guardó en este dispositivo.</p>';
  if (!dailyBoard) return '<p class="hint">Cargando la tabla del día…</p>';
  if (!dailyBoard.length) return '<p class="hint">Nadie ha terminado el reto de hoy todavía.</p>';
  return `<ol class="olist plain board">${dailyBoard.map((r, i) => `<li class="ok"><span class="num px">${i + 1}</span><span class="tx">${esc(r.name)}</span><span class="mark px">${fmtPts(r.score)} / 10</span></li>`).join('')}</ol>`;
}
function dailyView() {
  const date = crDate(), mine = daily[date];
  const past = Object.entries(daily).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  return `${screenHead('Reto del día')}<main class="${F.newScreen ? 'enter' : ''}">
    <div class="box"><p class="q">${mine ? `Hoy hiciste <b>${fmtPts(mine.score)} / 10</b>.` : 'Todavía no has jugado el reto de hoy.'}</p>
      <p class="hint">10 preguntas, las mismas para todos. Hay un reto nuevo cada día a medianoche, hora de Costa Rica. Racha: ${plural(dailyStreak(), 'día', 'días')} seguidos.</p>
      ${mine ? '' : '<div class="row end" style="margin-top:12px"><button class="btn" data-act="playDaily">Jugar el reto</button></div>'}</div>
    <div class="setup"><div class="box field"><span class="l px">Tabla de hoy</span>${boardHtml()}</div>
      <div class="box field"><span class="l px">Tus últimos retos</span>${past.length ? `<ol class="olist plain">${past.map(([d, r]) => `<li class="ok"><span class="tx">${d}</span><span class="mark px">${fmtPts(r.score)} / 10</span></li>`).join('')}</ol>` : '<p class="hint">Aquí aparecerán tus resultados.</p>'}</div></div>
  </main>`;
}
function medalsHtml(name) {
  const have = new Set(records.medals?.[name] || []);
  return `<div class="medals">${MEDALS.map(m => `<div class="medal ${have.has(m.id) ? 'on' : ''}" title="${esc(m.how)}"><span class="mico" style="--mc:${m.color}">${pixSvg(m.pix, have.has(m.id) ? m.color : 'currentColor')}</span><b>${m.name}</b><span class="hint">${m.how}</span></div>`).join('')}</div>`;
}

// ---------- pantallas fuera de la partida ----------
function titleView() {
  return `<div class="title" data-act="press">${scene()}
    <div class="wordmark"><span class="wm2 px"><b>JUAS</b><i>mon</i></span><span class="wm3 px">Trivia para entrenadores</span></div>
    <div class="press"><b>Pulsa START</b><span class="px">${TOUCH ? 'Toca la pantalla' : 'Pulsa Enter'}</span></div></div>`;
}

function cart(act, title, desc, icon, color, i, wide = false) {
  return `<button class="cart ${wide ? 'wide' : ''}" data-act="${act}" style="--cc:${color};--i:${i}"><span class="ico">${pixSvg(PIX[icon], '#1d2321')}</span><span class="ct">${title}</span><span class="cd">${desc}</span></button>`;
}

function menuView() {
  const saved = store.load('pt-save', null);
  let cont = '';
  if (saved?.state) {
    const s = saved.state;
    const who = s.players.map((p, i) => `${esc(p.name)} ${fmtPts(s.scores[i])}`).join(' · ');
    const what = s.config.type === 'clasica' ? (E.isMixed(s) ? `Pregunta ${s.qi + 1} de ${E.questionsPerRound(s)}` : `Ronda ${s.ri + 1} de ${s.config.rounds.length}`) : E.GAME_TYPES[s.config.type].name;
    cont = cart('continue', 'Continuar partida', `${what} · ${who}`, 'play', 'var(--yellow)', 0, true);
  }
  const me = cfg.solo.name.trim() || 'Rojo', xp = records.xp[me] || 0, rk = rankOf(xp);
  return `<div class="menu-screen">${scene()}<div class="menu-inner">
    <div class="row between"><button class="mini-wm" data-act="title"><b>JUAS</b><i>mon</i></button>${soundBtn()}</div>
    <div class="row"><div class="rankchip"><span class="px">${esc(me)}</span><span>Rango: <b>${rk.name}</b> · ${fmtPts(xp)} XP${rk.next ? ` · faltan ${fmtPts(rk.next[0] - xp)} para ${rk.next[1]}` : ''}</span></div>
      <button class="rankchip linkchip" data-act="reports">${FLAG_SVG}<span>Reportes${reports.length ? ` (${reports.length})` : ''}</span></button>
      ${installEvt && !standalone() ? '<button class="rankchip linkchip install" data-act="install"><span>⬇ Instalar app</span></button>' : ''}</div>
    <div class="carts">${cont}
      ${cart('solo', '1 jugador', 'Clásica, supervivencia o contrarreloj.', 'one', 'var(--red)', 1)}
      ${cart('multi', 'Multijugador', 'De 2 a 4 jugadores en la misma pantalla.', 'two', 'var(--blue)', 2)}
      ${cart('daily', 'Reto del día', daily[crDate()] ? `Hoy: ${fmtPts(daily[crDate()].score)} / 10. Vuelve mañana por otro.` : `10 preguntas, las mismas para todos. Racha: ${plural(dailyStreak(), 'día', 'días')}.`, 'star', '#2f6fdb', 3, false)}
      ${cart('roscoSetup', 'Juasrosco', 'Una pista por cada letra del abecedario. Solo o en duelo.', 'ring', '#e8722a', 3)}
      ${cart('custom', 'Mis preguntas', custom.length ? `${plural(custom.length, 'pregunta propia', 'preguntas propias')}.` : 'Escriban sus propias preguntas para retarse.', 'pencil', 'var(--yellow)', 4)}
      ${cart('records', 'Récords y medallas', `Medallas: ${(records.medals?.[me] || []).length} de 8. Tus marcas, tu rango y los duelos.`, 'trophy', 'var(--ok)', 5)}
    </div></div></div>`;
}

function screenHead(title) {
  return `<header class="hud"><div class="topline"><div class="screen-head"><button class="ibtn" data-act="menu" aria-label="Volver al menú">◀ <span>Menú</span></button><h1 class="px">${title}</h1></div><div class="tools">${soundBtn()}</div></div></header>`;
}

function commonSettings(type, solo = false) {
  const perTitle = solo ? 'Preguntas por partida' : 'Preguntas por jugador';
  const perOpts = solo ? [5, 10, 15] : [3, 5, 8];
  const perVal = solo ? cfg.solo.perRound : cfg.perPlayer;
  const mixed = type !== 'clasica' || cfg.structure === 'mezclada';
  const qFormats = ['preguntas', 'vf', 'orden', 'pares', 'multi', 'escribir', 'bomba', 'intruso', 'estimacion'];
  const banned = type === 'contrarreloj' ? ['bomba', 'pokedle'] : [];
  const showCats = mixed ? cfg.formats.some(f => qFormats.includes(f)) : cfg.rounds.some(r => ['preguntas', 'intruso', 'estimacion'].includes(r));
  return `
    <div class="box field full">
      ${type === 'clasica' ? `<span class="l px">Estructura</span><div class="togs">${tog('structure', 'mezclada', cfg.structure === 'mezclada', 'Mezclada')}${tog('structure', 'rondas', cfg.structure === 'rondas', 'Por rondas')}</div>` : ''}
      ${mixed ? `<span class="l px">Formatos</span>
        <div class="togs">${Object.entries(E.FORMATS).filter(([k]) => !banned.includes(k)).map(([k, n]) => tog('fmt', k, cfg.formats.includes(k), n)).join('')}${tog('fmts', 'all', Object.keys(E.FORMATS).every(f => cfg.formats.includes(f)), 'Todos')}</div>
        <p class="hint">Cada pregunta sale de uno de los formatos elegidos, al azar.</p>`
      : `<span class="l px">Rondas</span>
        <div class="togs">${E.ROUND_MODES.map(k => tog('round', k, cfg.rounds.includes(k), E.MODES[k].name)).join('')}</div>
        <p class="hint">Se juegan en este orden: ${cfg.rounds.map(r => E.MODES[r].name).join(', ')}.</p>`}
      ${type === 'clasica' ? `<span class="l px">${mixed ? perTitle : solo ? 'Preguntas por ronda' : 'Preguntas por jugador y ronda'}</span><div class="togs">${perOpts.map(n => tog(solo ? 'soloPer' : 'per', n, perVal === n, n)).join('')}</div>` : ''}
      ${type === 'contrarreloj' ? `<span class="l px">Duración</span><div class="togs">${[30, 60, 90].map(n => tog('soloDur', n, cfg.solo.duration === n, `${n} s`)).join('')}</div>` : ''}
    </div>
    ${showCats ? `<div class="box field full">
      <span class="l px">Temas de las preguntas</span>
      <div class="togs">${Object.entries(E.CATS).map(([k, n]) => tog('cat', k, cfg.cats.includes(k), n)).join('')}${tog('cats', 'all', cfg.cats.length === Object.keys(E.CATS).length, 'Todos')}</div>
    </div>` : ''}
    <div class="box field">
      <span class="l px">Generaciones</span>
      <div class="togs">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(g => tog('gen', g, cfg.gens.includes(g), g)).join('')}</div>
      <div class="row">${tog('gens', 'all', cfg.gens.length === 9, 'Todas')}${tog('gens', 'retro', cfg.gens.join() === '1,2,3', 'Solo 1 a 3')}</div>
    </div>
    ${type !== 'contrarreloj' ? `<div class="box field">
        <span class="l px">Adivinar Pokémon</span><div class="togs">${tog('idioma', 'opciones', cfg.idiomaMode === 'opciones', '4 opciones')}${tog('idioma', 'escribir', cfg.idiomaMode === 'escribir', 'Escribir el nombre')}</div>
        <span class="l px">Tiempo por pregunta</span><div class="togs">${[[0, 'Sin tiempo'], [20, '20 s'], [40, '40 s']].map(([v, l]) => tog('timer', v, cfg.timer === v, l)).join('')}</div>
      </div>` : ''}`;
}

function roscoSetupView() {
  const p = cfg.rosco.players, rec = records.solo[`rosco:${cfg.rosco.time}`];
  return `${screenHead('Juasrosco')}<main class="${F.newScreen ? 'enter' : ''}">
    <div class="box"><p class="q">Una pista por cada letra. Si aciertas, sigues; si fallas o dices «¡Paso!», le toca al siguiente. Las letras que pases vuelven en la siguiente vuelta.</p>
      <p class="hint">Gana quien acierte más letras; si empatan, quien tenga menos errores.${rec ? ` Tu récord en solitario: ${rec.best} letras.` : ''}</p></div>
    <div class="setup">
      <div class="box field">
        <span class="l px">Jugadores</span>
        ${p.map((n, i) => `<div class="row"><input class="input" data-rplayer="${i}" value="${esc(n)}" maxlength="16" aria-label="Jugador ${i + 1}" style="flex:1;border-left:8px solid ${pColor(i)}">${p.length > 1 ? `<button class="tog" data-act="rdel" data-val="${i}" aria-label="Quitar jugador">✕</button>` : ''}</div>`).join('')}
        ${p.length < 4 ? `<div><button class="tog" data-act="radd">+ Agregar jugador</button></div>` : ''}
        <p class="hint">Con un solo jugador juegas contra tu récord.</p>
      </div>
      <div class="box field">
        <span class="l px">Tiempo por jugador</span><div class="togs">${[120, 150, 200].map(n => tog('rtime', n, cfg.rosco.time === n, `${n} s`)).join('')}</div>
        <span class="l px">Generaciones de los Pokémon</span>
        <div class="togs">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(g => tog('gen', g, cfg.gens.includes(g), g)).join('')}</div>
        <div class="row">${tog('gens', 'all', cfg.gens.length === 9, 'Todas')}${tog('gens', 'retro', cfg.gens.join() === '1,2,3', 'Solo 1 a 3')}</div>
      </div>
    </div>
    <div class="row end"><button class="btn" data-act="startRosco">¡Comenzar!</button></div>
  </main>`;
}

function soloView() {
  const t = cfg.solo.type;
  const recFor = k => {
    const key = k === 'clasica' ? `clasica:${cfg.solo.perRound}:${cfg.structure === 'rondas' ? cfg.rounds.length : 'mix'}` : k === 'contrarreloj' ? `contrarreloj:${cfg.solo.duration}` : k;
    const r = records.solo[key]; return r ? `Récord: ${fmtPts(r.best)}` : 'Sin récord todavía';
  };
  return `${screenHead('1 jugador')}<main class="${F.newScreen ? 'enter' : ''}">
    <div class="modes">${Object.entries(E.GAME_TYPES).filter(([k]) => k !== 'rosco').map(([k, g]) => `<button class="mode" data-act="soloType" data-val="${k}" aria-pressed="${t === k}"><b>${g.name}</b><span>${g.blurb}</span><small>${recFor(k)}</small></button>`).join('')}</div>
    <div class="setup">
      <div class="box field full"><label class="field"><span class="l px">Tu nombre</span><input class="input" id="solo-name" data-solo-name="1" value="${esc(cfg.solo.name)}" maxlength="16"></label></div>
      ${commonSettings(t, true)}
    </div>
    <div class="row end">${flash ? `<span class="hint">${esc(flash)}</span>` : ''}<button class="btn" data-act="startSolo">¡Comenzar!</button></div>
  </main>`;
}

function multiView() {
  const p = cfg.players;
  return `${screenHead('Multijugador')}<main class="${F.newScreen ? 'enter' : ''}">
    <div class="setup">
      <div class="box field full">
        <span class="l px">Jugadores</span>
        <div class="setup">${p.map((n, i) => `<div class="row"><input class="input" id="player-${i}" data-player="${i}" value="${esc(n)}" maxlength="16" aria-label="Jugador ${i + 1}" style="flex:1;border-left:8px solid ${pColor(i)}">${p.length > 2 ? `<button class="tog" data-act="delplayer" data-val="${i}" aria-label="Quitar jugador">✕</button>` : ''}</div>`).join('')}</div>
        ${p.length < 4 ? `<div><button class="tog" data-act="addplayer">+ Agregar jugador</button></div>` : ''}
        <p class="hint">Jueguen en la misma pantalla y pásense el turno: cada pregunta le toca a uno distinto.</p>
      </div>
      ${commonSettings('clasica')}
    </div>
    <div class="row end"><button class="btn" data-act="startMulti">¡Comenzar!</button></div>
  </main>`;
}

function customView() {
  return `${screenHead('Mis preguntas')}<main class="${F.newScreen ? 'enter' : ''}">
  <div class="box field">
    <label class="field"><span class="hint">Pregunta</span><input class="input" id="c-q" maxlength="200" placeholder="¿Qué Pokémon usé contra Brock la primera vez?"></label>
    <div class="setup">
      <label class="field"><span class="hint">Respuesta correcta</span><input class="input" id="c-a" maxlength="80"></label>
      <label class="field"><span class="hint">Categoría</span><input class="input" id="c-cat" maxlength="30" value="Entre nosotros"></label>
      ${[1, 2, 3].map(i => `<label class="field"><span class="hint">Incorrecta ${i}</span><input class="input" id="c-w${i}" maxlength="80"></label>`).join('')}
    </div>
    <div class="row end">${flash ? `<span class="hint">${esc(flash)}</span>` : ''}<button class="btn" data-act="addq">Agregar</button></div>
  </div>
  <div class="box field">
    <span class="l px">Guardadas (${custom.length})</span>
    ${custom.length ? `<ul class="list">${custom.map((q, i) => `<li><span>${esc(q.q)} <span class="hint">· ${esc(q.a)}</span></span><button class="tog" data-act="delq" data-val="${i}" aria-label="Borrar">✕</button></li>`).join('')}</ul>` : '<p class="hint">Todavía no hay preguntas propias.</p>'}
    <p class="hint">Se mezclan en Pokepreguntas y se guardan en este navegador. Para pasárselas a tu amigo, copia el texto y que él lo pegue abajo.</p>
    <textarea class="input" id="c-io" rows="3" placeholder="Pega aquí preguntas copiadas"></textarea>
    <div class="row end"><button class="btn ghost" data-act="copyq">Copiar todas</button><button class="btn ghost" data-act="importq">Agregar desde texto</button></div>
  </div></main>`;
}

async function loadRemote() {
  if (!dbRef) return;
  try {
    const snap = await dbRef.collection('reportes').orderBy('at', 'desc').limit(200).get();
    remoteReports = snap.docs.map(d => ({ id: d.id, data: d.data() }));
  } catch { remoteReports = null; }
  if (view === 'reports') render();
}
function reportsView() {
  const mine = new Set(reports.map(r => r.id));
  const all = reports.map(r => ({ ...r, mine: true })).concat((remoteReports || []).filter(r => !mine.has(r.id)).map(r => ({ ...r, synced: true, mine: false })))
    .sort((a, b) => (b.data.at || 0) - (a.data.at || 0));
  const date = t => new Date(t).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `${screenHead('Reportes')}<main class="${F.newScreen ? 'enter' : ''}">
    <div class="box"><p class="q">Preguntas que marcaron con «Reportar».</p>
      <p class="hint">${dbRef ? (dbRef.kind === 'firebase' ? 'Se guardan en la nube, así se ven desde cualquier dispositivo.' : 'Se guardan en la página, así Claude los puede leer y corregir en la siguiente versión.') : 'Sin conexión a la nube: se guardan en este dispositivo y se enviarán cuando haya conexión.'}</p>
      ${all.length ? '<div class="row end"><button class="btn ghost" data-act="copy-reports">Copiar para Claude</button></div>' : ''}</div>
    ${all.length ? `<ul class="list reports">${all.map(r => `<li><div class="rp"><span class="px catl">${esc(r.data.reason || '')}</span><span>${esc(r.data.summary || '')}</span>${r.data.note ? `<span class="hint">«${esc(r.data.note)}»</span>` : ''}<span class="hint">${date(r.data.at)}${r.data.reporter ? ` · ${esc(r.data.reporter)}` : ''} · ${r.synced ? 'Enviado' : 'Pendiente de enviar'}${r.mine ? '' : ' · de otro dispositivo'}</span></div><button class="tog" data-act="del-report" data-val="${esc(r.id)}" aria-label="Borrar reporte">✕</button></li>`).join('')}</ul>`
      : '<div class="box"><p class="hint">Todavía no hay reportes. Después de responder una pregunta, toca «Reportar» si algo está mal.</p></div>'}
  </main>`;
}

function recordsView() {
  const solo = Object.values(records.solo).sort((a, b) => a.label.localeCompare(b.label));
  const names = [...new Set([...Object.keys(records.xp), ...Object.keys(records.duels)])].sort((a, b) => (records.xp[b] || 0) - (records.xp[a] || 0));
  const date = t => new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  return `${screenHead('Récords')}<main class="${F.newScreen ? 'enter' : ''}">
    <div class="setup">
      <div class="box field"><span class="l px">1 jugador</span>
        ${solo.length ? `<div class="scroll"><table><thead><tr><th>Modo</th><th>Mejor</th><th>Racha</th><th>Fecha</th></tr></thead><tbody>${solo.map(r => `<tr><td>${esc(r.label)}</td><td class="px" style="font-size:12px">${fmtPts(r.best)}</td><td>${r.streak || 0}</td><td>${date(r.at)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Juega una partida de 1 jugador para estrenar la tabla.</p>'}
      </div>
      <div class="box field"><span class="l px">Rangos y duelos</span>
        ${names.length ? `<div class="scroll"><table><thead><tr><th>Entrenador</th><th>XP</th><th>Rango</th><th>Duelos</th></tr></thead><tbody>${names.map(n => { const xp = records.xp[n] || 0, rk = rankOf(xp); return `<tr><td>${esc(n)}</td><td>${fmtPts(xp)}</td><td class="${rk.next ? '' : 'top'}">${rk.name}</td><td>${records.duels[n] || 0}</td></tr>`; }).join('')}</tbody></table></div>
          <p class="hint">Cada punto que ganas suma 1 XP. Rangos: ${RANKS.map(r => `${r[1]} (${r[0]})`).join(' → ')}.</p><p class="hint">${plural(records.games || 0, 'partida jugada', 'partidas jugadas')} en multijugador. Los empates no cuentan como duelo ganado.</p>` : '<p class="hint">Juega una partida para estrenar la tabla.</p>'}
      </div>
    </div>
    <div class="box field"><span class="l px">Medallas de ${esc(cfg.solo.name.trim() || 'Rojo')}</span>${medalsHtml(cfg.solo.name.trim() || 'Rojo')}
      ${Object.keys(records.medals || {}).filter(n => n !== (cfg.solo.name.trim() || 'Rojo')).map(n => `<p class="hint">${esc(n)}: ${(records.medals[n] || []).length} de 8 medallas.</p>`).join('')}</div>
    <div class="row end"><button class="btn ghost" data-act="ask-reset">Borrar récords</button></div>
  </main>`;
}

// ---------- barra de combate ----------
function hudView() {
  const s = state, n = s.players.length;
  const active = s.phase === 'question' || s.phase === 'reveal';
  const rosco = s.phase === 'rosco' || (s.rosco && s.phase === 'end');
  const panels = s.players.map((p, i) => {
    if (rosco) {
      const R = s.rosco, ok = R.status[i].filter(x => x === 'ok').length, on = s.phase === 'rosco' && R.turn === i && s.players.length > 1;
      return `<div class="panel ${on ? 'on' : ''}" style="--c:${pColor(i)}"><div class="pn"><i></i><span>${esc(p.name)}</span><em>▶ Turno</em></div>
        <div class="ps"><span class="pts keep" data-score="${i}">${fmtPts(last.scores[i] ?? s.scores[i])}</span><span class="pa">${R.errors[i]} errores · ${fmtClock(R.time[i])}</span></div>
        <div class="hp"><i style="--w:${ok / 27 * 100}%"></i></div></div>`;
    }
    const mine = s.log.filter(l => l.player === i), ok = mine.filter(l => l.correct).length + mine.filter(l => l.points > 0 && !l.correct).length * 0.5;
    const pct = mine.length ? ok / mine.length * 100 : 0;
    const on = active && n > 1 && E.currentPlayer(s) === i;
    const shown = last.scores[i] ?? s.scores[i];
    return `<div class="panel ${on ? 'on' : ''}" style="--c:${pColor(i)}"><div class="pn"><i></i><span>${esc(p.name)}</span><em>▶ Turno</em></div>
      <div class="ps"><span class="pts keep" data-score="${i}">${fmtPts(shown)}</span><span class="pa">${fmtPts(ok)}/${mine.length} aciertos</span></div>
      <div class="hp"><i style="--w:${pct}%;--hc:${pct >= 50 ? 'var(--ok)' : pct > 0 ? 'var(--yellow)' : 'var(--ok)'}"></i></div></div>`;
  });
  const c = centerView(active);
  const row = n === 1 ? `<div class="hudrow solo">${panels[0]}${c}</div>` : n === 2 ? `<div class="hudrow">${panels[0]}${c}${panels[1]}</div>` : `<div class="hudrow many">${c}${panels.join('')}</div>`;
  return `<header class="hud"><div class="topline"><button class="brand" data-act="pause"><b>JUAS</b>mon</button><div class="tools">${soundBtn()}<button class="ibtn" data-act="pause" aria-label="Pausa">${ICON_PAUSE}<span>Pausa</span></button></div></div>${row}</header>`;
}

function centerView(active) {
  const s = state, c = s.config;
  if (c.type === 'supervivencia') {
    const hearts = Array.from({ length: c.lives }, (_, i) => pixSvg(PIX.heart, '#fff', i < s.lives ? '' : 'lost')).join('');
    return `<div class="center"><div class="lives" aria-label="${s.lives} vidas">${hearts}</div><span class="cline">Racha ${s.streak} · Mejor ${s.bestStreak}</span></div>`;
  }
  if (c.type === 'contrarreloj') {
    const left = clock.tEnd ? Math.max(0, clock.tEnd - Date.now()) : clock.tLeft || c.duration * 1000;
    return `<div class="center"><span class="tbig" id="tatext">${fmtClock(left)}</span><div class="hudbar"><i id="tabar" style="--w:${left / (c.duration * 1000) * 100}%"></i></div><span class="cline">Puntos ${fmtPts(s.scores[0])}</span></div>`;
  }
  if (c.type === 'rosco') {
    const R = s.rosco, t = R && s.phase === 'rosco' ? R.turn : 0, left = R ? R.time[t] : c.roscoTime * 1000;
    return `<div class="center"><span class="cline">Juasrosco${R && s.players.length > 1 && s.phase === 'rosco' ? ` · turno de ${esc(s.players[t].name)}` : ''}</span><span class="tbig" id="rtext">${fmtClock(left)}</span><div class="hudbar"><i id="rbar" style="--w:${left / (c.roscoTime * 1000) * 100}%"></i></div></div>`;
  }
  const per = Math.min(E.questionsPerRound(s), 60);
  const segs = E.roundList(s).map((r, ri) => {
    const entries = s.log.filter(l => l.round === ri && !l.extra);
    const dots = Array.from({ length: per }, (_, j) => `<i class="${j < entries.length ? (entries[j].correct ? 'ok' : entries[j].points > 0 ? 'mid' : 'bad') : ri === s.ri && j === s.qi && active ? 'now' : ''}"></i>`).join('');
    return `<div class="seg ${ri === s.ri && s.phase !== 'end' ? 'cur' : ''}"><span class="sl">${SHORT[r]}</span><div class="dots" style="flex-wrap:wrap;justify-content:center;max-width:${Math.max(60, Math.min(per, 12) * 14)}px">${dots}</div></div>`;
  }).join('');
  return `<div class="center"><div class="route">${segs}</div></div>`;
}
const fmtClock = ms => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

// ---------- pantallas del juego ----------
function introView() {
  const s = state, c = s.config;
  const isStart = s.phase === 'intro';
  if (c.type === 'rosco') {
    return `<main class="enter"><div class="box"><h2 class="px" data-tw="Juasrosco">Juasrosco</h2>
      <p class="q">27 letras, una pista por letra. Si aciertas, sigues. Si fallas o dices «¡Paso!»${s.players.length > 1 ? ', le toca al siguiente' : ', pasas a la siguiente letra'}. Las letras pasadas vuelven en la siguiente vuelta.</p>
      <p class="hint">${s.players.length > 1 ? `Cada uno tiene ${c.roscoTime} segundos y su propio rosco.` : `Tienes ${c.roscoTime} segundos.`} Puedes escribir sin tildes; perdonamos un error de tipeo en palabras largas.</p>
      <div class="row end" style="margin-top:14px"><button class="btn" data-act="begin" id="nextbtn">¡Vamos!</button></div></div></main>`;
  }
  if (c.type !== 'clasica' || E.isMixed(s)) {
    const g = c.daily ? { name: 'Reto del día' } : c.type === 'clasica' ? { name: 'Partida mezclada' } : E.GAME_TYPES[c.type];
    const rec = s.players.length === 1 && !c.daily ? records.solo[c.type === 'contrarreloj' ? `contrarreloj:${c.duration}` : c.type === 'clasica' ? `clasica:${c.perPlayer}:mix` : c.type] : null;
    const how = c.type === 'supervivencia' ? `Tienes ${c.lives} vidas. Cada error te quita una y cada pregunta puede ser de cualquier formato.` : c.type === 'contrarreloj' ? `Tienes ${c.duration} segundos. Responde rápido: cada acierto suma 1 (medio punto si casi) y los errores no restan.` : c.daily ? `10 preguntas, las mismas para todos los que jueguen hoy. Solo cuenta el primer intento: si sales a mitad, se guarda lo que llevas. ${SCORING.mezcla}` : `${plural(E.questionsPerRound(s), 'pregunta', 'preguntas')} de todos los formatos elegidos, mezclados al azar. ${SCORING.mezcla}`;
    return `<main class="enter"><div class="box">
      <h2 class="px" data-tw="${esc(g.name)}">${esc(g.name)}</h2>
      <p class="q">${how}</p>
      <p class="hint">${s.players.length > 1 ? `Empieza ${esc(s.players[0].name)}.` : rec ? `Tu récord es ${fmtPts(rec.best)}.` : 'Todavía no tienes récord en este modo.'}</p>
      <div class="row end" style="margin-top:14px"><button class="btn" data-act="begin" id="nextbtn">¡Vamos!</button></div></div></main>`;
  }
  const nextMode = isStart ? c.rounds[0] : c.rounds[s.ri + 1];
  const nm = E.MODES[nextMode];
  const roundNo = isStart ? 1 : s.ri + 2;
  return `<main class="enter">
  ${isStart || s.players.length === 1 ? '' : `<div class="box"><h2 class="px">Fin de la ronda ${s.ri + 1}</h2><div class="scroll">${standingsTable()}</div></div>`}
  <div class="box">
    <div class="meta px"><span>Ronda ${roundNo} de ${c.rounds.length}</span><span>${plural(E.questionsPerRound(s), 'pregunta', 'preguntas')}</span></div>
    <h2 class="px" style="margin-top:14px;font-size:clamp(20px,4vw,30px)" data-tw="${esc(nm.name)}">${esc(nm.name)}</h2>
    <p class="q">${nm.blurb}</p>
    <p class="hint">${SCORING[nextMode]}${c.timer ? ` Tienen ${c.timer} segundos por pregunta.` : ''}</p>
    <div class="row between" style="margin-top:14px">
      ${s.players.length > 1 ? `<span class="turn px" style="--c:${pColor(0)}">Empieza ${esc(s.players[0].name)}</span>` : '<span></span>'}
      <button class="btn" data-act="${isStart ? 'begin' : 'next'}" id="nextbtn">Empezar ronda</button>
    </div>
  </div></main>`;
}

function standingsTable() {
  const rounds = E.roundList(state);
  const pts = (pi, ri) => state.log.filter(l => l.player === pi && l.round === ri).reduce((a, l) => a + l.points, 0);
  const played = rounds.filter((_, ri) => state.log.some(l => l.round === ri));
  return `<table><thead><tr><th>Jugador</th>${played.map(r => `<th>${E.MODES[r].name}</th>`).join('')}<th>Total</th></tr></thead>
  <tbody>${state.players.map((p, i) => `<tr><td><span style="color:${pColor(i)}">●</span> ${esc(p.name)}</td>${played.map((_, ri) => `<td>${fmtPts(pts(i, ri))}</td>`).join('')}<td class="px" style="font-size:12px">${fmtPts(state.scores[i])}</td></tr>`).join('')}</tbody></table>`;
}

function timerBar() {
  const c = state.config;
  if (!c.timer || c.type === 'contrarreloj' || state.phase !== 'question') return '';
  return `<div class="timer px"><span>Tiempo</span><div class="hp"><i id="tbar" style="--w:100%"></i></div><span id="tleft">${c.timer}</span></div>`;
}

function verdict() {
  const r = state.result;
  const txt = r.timeout ? '¡Se acabó el tiempo!' : r.correct ? `¡JUAS${r.streak >= 3 ? ' crítico' : ''}! +${fmtPts(r.points)}` : r.partial ? `¡Casi! +${fmtPts(r.points)}` : state.lives === 0 ? '¡Fallaste! Sin vidas.' : '¡Fallaste!';
  return `<p class="verdict px ${r.correct ? 'ok' : r.partial ? 'mid' : 'bad'}" data-tw="${esc(txt)}">${esc(txt)}</p>`;
}

function nextButton() {
  const s = state;
  if (s.config.type === 'contrarreloj') return '';
  let label;
  if (s.config.type === 'supervivencia') label = s.lives <= 0 ? 'Ver resultado' : 'Siguiente ▶';
  else {
    const lastQ = s.qi + 1 >= E.questionsPerRound(s), lastR = s.ri + 1 >= E.roundList(s).length;
    const nextP = s.players[(s.qi + 1) % s.players.length];
    label = lastQ ? (lastR ? 'Ver resultados' : 'Fin de la ronda') : s.players.length > 1 ? `Turno de ${esc(nextP.name)} ▶` : 'Siguiente ▶';
  }
  const fk = `${s.seed}-${s.ri}-${s.qi}`, done = flagged.has(fk);
  return `<div class="row between"><button class="btn ghost flag" data-act="flag" ${done ? 'disabled' : ''}>${FLAG_SVG}<span>${done ? 'Reportada' : 'Reportar'}</span></button><button class="btn" data-act="next" id="nextbtn">${label}</button></div>`;
}

function masOMenos(q, rev) {
  const A = ctx.byId.get(q.a), B = ctx.byId.get(q.b);
  const max = q.stat === 'total' ? 720 : q.unit ? Math.max(q.va, q.vb ?? q.va) * 1.25 : 255;
  const card = (p, v, shown, side) => `<div class="card ${F.newQ ? side : ''}">
    <span class="dex px">${dexNo(p.id)}</span><span class="name">${esc(p.name)}</span>${typePills(p)}
    <span class="hint">${esc(q.label)}</span><span class="val px ${rev && p === B ? 'reveal' : ''}">${shown ? fmtVal(v, q.unit) : '???'}</span>
    <div class="hp"><i style="--w:${shown && !(rev && p === B && F.newScreen) ? Math.min(100, v / max * 100) : 0}%;--hc:${p === B ? 'var(--yellow)' : 'var(--ok)'}" ${rev && p === B ? `data-grow="${Math.min(100, v / max * 100)}"` : ''}></i></div></div>`;
  const opt = (val, label, k, i) => {
    const cls = rev ? (val === q.answer ? 'right' : state.result.given === val ? 'wrong' : '') : '';
    return `<button class="opt ${cls}" data-act="answer" data-val="${val}" data-k="${k}" style="--i:${i}" ${rev ? 'disabled' : ''}>${label}</button>`;
  };
  return `<div class="vs">${card(A, q.va, true, 'from-l')}<span class="vsmark px">VS</span>${card(B, q.vb, rev, 'from-r')}</div>
  <div class="box"><p class="q">¿${esc(B.name)} tiene más o menos ${esc(q.label.toLowerCase())} que ${esc(A.name)}?</p></div>
  <div class="menu">${opt('mas', '▲ Más', '↑', 0)}${opt('menos', '▼ Menos', '↓', 1)}</div>
  ${rev ? `<div class="box result">${verdict()}<p class="hint">${esc(B.name)}: ${fmtVal(q.vb, q.unit)} · ${esc(A.name)}: ${fmtVal(q.va, q.unit)}</p>${nextButton()}</div>` : ''}`;
}

// ¿Adivinar un Pokémon? Pokeidioma, ¿Quién es? y Entrada de Pokédex comparten esta forma de responder.
function guessAnswer(q, rev, worthTxt, hintBtn) {
  const mode = state.config.idiomaMode;
  if (!rev) {
    if (mode === 'escribir') {
      return `<div class="box field"><label class="field"><span class="hint">¿Qué Pokémon es?${worthTxt}</span>
        <input class="input" id="typed" data-ac="pokemon" autocomplete="off" placeholder="Escribe el nombre"></label>${datalist('pokemon')}
        <div class="row end">${hintBtn}<button class="btn" data-act="typed">Responder</button></div></div>`;
    }
    return `<p class="hint">¿Qué Pokémon es?${worthTxt}</p>
      <div class="menu">${q.options.map((id, i) => `<button class="opt" data-act="answer" data-val="${id}" data-num="1" data-k="${i + 1}" style="--i:${i}">${esc(ctx.byId.get(id).name)}</button>`).join('')}</div>
      ${hintBtn ? `<div class="row end">${hintBtn}</div>` : ''}`;
  }
  const p = ctx.byId.get(q.answer);
  const opts = mode === 'opciones' || typeof state.result.given === 'number' ? `<div class="menu">${q.options.map((id, i) => `<button class="opt ${id === q.answer ? 'right' : state.result.given === id ? 'wrong' : ''}" data-k="${i + 1}" disabled>${esc(ctx.byId.get(id).name)}</button>`).join('')}</div>` : '';
  const given = typeof state.result.given === 'string' && !state.result.correct ? `<p class="hint">Escribiste: ${esc(state.result.given)}</p>` : state.result.typo ? juasTypo(p.name) : '';
  const extra = q.kind === 'idioma' ? `<p class="hint">Japonés: ${esc(p.ja)} (${esc(p.roma)}) · Alemán: ${esc(p.de)} · Francés: ${esc(p.fr)} · Coreano: ${esc(p.ko)}</p>` : q.kind === 'pokedex' ? '' : ctx.pokedex[p.id] ? `<p class="hint">«${esc(ctx.pokedex[p.id])}»</p>` : '';
  return `${opts}<div class="box result">${verdict()}${given}
    <div class="row" style="gap:14px;margin:6px 0 10px"><span class="dex px">${dexNo(p.id)}</span><span class="name">${esc(p.name)}</span>${typePills(p)}</div>
    ${extra}${nextButton()}</div>`;
}

function idioma(q, rev) {
  const classic = state.config.type === 'clasica';
  const worth = Math.max(1, 3 - state.hints);
  const worthTxt = classic ? ` Vale ${plural(worth, 'punto', 'puntos')}.` : '';
  const clues = q.clues.map((c, i) => `<div class="clue ${i === state.hints && i > 0 && !rev ? 'pop keep' : ''}" ${rev && i > state.hints ? 'style="opacity:.6"' : ''}><span class="l px">${esc(c.lang)}</span><span class="t">${richText(c.text)}</span>${c.sub ? `<span class="s">${esc(c.sub)}</span>` : ''}</div>`).join('');
  const canHint = !rev && state.hints < (q.totalClues ?? q.clues.length) - 1;
  const hintBtn = canHint ? `<button class="btn ghost" data-act="hint">Otra pista${classic ? ` (vale ${Math.max(1, worth - 1)})` : ''}</button>` : '';
  const head = q.kind === 'quien' ? `<span class="hint px catl">¿Quién es?</span>` : '';
  return `<div class="box clues ${q.kind === 'quien' ? 'quien' : ''}">${head}${clues}</div>${guessAnswer(q, rev, worthTxt, hintBtn)}`;
}

function pokedexView(q, rev) {
  return `<div class="box dexbox"><span class="hint px catl">Entrada de Pokédex</span><p class="q dextext">«${esc(q.text)}»</p></div>${guessAnswer(q, rev, '', '')}`;
}

// Estimación: un deslizador (logarítmico para peso y altura) y un número.
const estToSlider = (q, v) => q.scale === 'log' ? Math.round(Math.log(v / q.min) / Math.log(q.max / q.min) * 1000) : Math.round((v - q.min) / (q.max - q.min) * 1000);
const estFromSlider = (q, s) => { const v = q.scale === 'log' ? q.min * (q.max / q.min) ** (s / 1000) : q.min + (q.max - q.min) * s / 1000; const st = q.step || 1; return Math.round(v / st) * st; };
const estFmt = (q, v) => v === null || v === undefined ? '—' : `${Number(v).toLocaleString('es', { maximumFractionDigits: 1 })}${q.unit ? ' ' + q.unit : ''}`;
function estView(q, rev) {
  const multi = !!q.est;
  if (!rev) {
    const start = q.scale === 'log' ? estFromSlider(q, 500) : estFromSlider(q, 500);
    const who = multi ? `<div class="row"><span class="turn px" style="--c:${pColor(q.est.turn)}">Responde ${esc(state.players[q.est.turn].name)}</span>${q.est.answered.length ? `<span class="hint">Ya respondieron: ${q.est.answered.map(i => esc(state.players[i].name)).join(', ')}. No miren la pantalla del otro.</span>` : ''}</div>` : '';
    return `${qHead(q, multi ? '<p class="hint" style="margin-top:8px">Todos responden la misma pregunta; el punto es para quien quede más cerca.</p>' : `<p class="hint" style="margin-top:8px">1 punto si quedas muy cerca, medio punto si quedas cerca.</p>`)}
    <div class="box field est">${who}
      <div class="estval"><input class="input estnum" id="est-num" type="number" inputmode="decimal" min="${q.min}" max="${q.max}" step="${q.step}" value="${start}"><span class="px">${esc(q.unit)}</span></div>
      <input id="est-range" class="range" type="range" min="0" max="1000" value="500" aria-label="Valor estimado">
      <div class="row between hint"><span>${estFmt(q, q.min)}</span><span>${estFmt(q, q.max)}</span></div>
      <div class="row end"><button class="btn" data-act="est-ok" id="nextbtn-est">Responder</button></div></div>`;
  }
  const r = state.result;
  if (multi) {
    const rows = state.players.map((p, i) => `<tr><td><span style="color:${pColor(i)}">●</span> ${esc(p.name)}</td><td>${estFmt(q, r.est.guesses[i])}</td><td>${Number.isFinite(r.est.dist[i]) ? (q.rel ? `${Math.round(r.est.dist[i] * 100)} %` : `${r.est.dist[i]}`) : '—'}</td><td class="px" style="font-size:12px">+${r.est.points[i]}</td></tr>`).join('');
    return `${qHead(q)}<div class="box result"><p class="verdict px ok" data-tw="${esc('Era ' + estFmt(q, q.truth))}">Era ${esc(estFmt(q, q.truth))}</p>
      <div class="scroll"><table><thead><tr><th>Jugador</th><th>Dijo</th><th>Diferencia</th><th>Punto</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${q.exp ? `<p class="hint">${richText(q.exp)}</p>` : ''}${nextButton()}</div>`;
  }
  const g = typeof r.given === 'number' ? r.given : Number(r.given);
  return `${qHead(q)}${resultBox(`Era ${estFmt(q, q.truth)}. Dijiste ${estFmt(q, Number.isFinite(g) ? g : null)}${Number.isFinite(r.err) ? ` (${q.rel ? `${Math.round(r.err * 100)} % de diferencia` : `${r.err} de diferencia`})` : ''}.`, q.exp)}`;
}

const PD_COLS = [['t1', 'Tipo 1'], ['t2', 'Tipo 2'], ['gen', 'Gen'], ['h', 'Altura'], ['w', 'Peso']];
function pokedleView(q, rev) {
  const pd = q.pd, multi = state.players.length > 1;
  const cell = (g, key) => {
    const p = ctx.byId.get(g.id), fb = g.fb[key];
    let txt;
    if (key === 't1') txt = badge(p.types[0]);
    else if (key === 't2') txt = p.types[1] ? badge(p.types[1]) : '<span class="hint">—</span>';
    else txt = `${key === 'gen' ? p.gen : key === 'h' ? `${(p.h / 10).toLocaleString('es')} m` : `${(p.w / 10).toLocaleString('es')} kg`}${fb === 'up' ? ' ▲' : fb === 'down' ? ' ▼' : ''}`;
    return `<td class="pdc ${fb}">${txt}</td>`;
  };
  const rows = pd.guesses.map(g => g.id ? `<tr><td><span style="color:${pColor(g.p)}">●</span> ${esc(ctx.byId.get(g.id).name)}</td>${PD_COLS.map(([k]) => cell(g, k)).join('')}</tr>` : `<tr><td colspan="6" class="hint"><span style="color:${pColor(g.p)}">●</span> ${esc(state.players[g.p].name)} se quedó sin tiempo</td></tr>`).join('');
  const table = pd.guesses.length ? `<div class="scroll"><table class="pdt"><thead><tr><th>Intento</th>${PD_COLS.map(([, n]) => `<th>${n}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>` : '';
  const left = pd.max - pd.guesses.length;
  if (!rev) {
    const last = pd.last ? `<p class="flash bad keep">${pd.last.why === 'repetido' ? 'Ya lo intentaron' : 'No es un Pokémon'}: ${esc(pd.last.text)}</p>` : '';
    return `<div class="box"><span class="hint px catl">Pokédle</span><p class="q" style="margin-top:8px">Adivina el Pokémon secreto.</p>
      <p class="hint">Verde: igual. Amarillo: ese tipo lo tiene, pero en el otro lugar. ▲ el secreto es mayor, ▼ es menor. ${multi ? 'Se turnan; el primero que lo adivine gana el punto.' : '1 punto si lo adivinas en 3 intentos o menos; medio punto hasta 6.'}</p></div>
      <div class="box field">${multi ? `<div><span class="turn px" style="--c:${pColor(pd.turn)}">Turno de ${esc(state.players[pd.turn].name)}</span></div>` : ''}
        <div class="row"><input class="input" id="typed" data-ac="pokemon" autocomplete="off" placeholder="Escribe un Pokémon" style="flex:1"><button class="btn" data-act="pd-send">Adivinar</button></div>
        ${last}<p class="hint">${plural(left, 'intento restante', 'intentos restantes')}.</p></div>${table ? `<div class="box">${table}</div>` : ''}${datalist('pokemon')}`;
  }
  const a = ctx.byId.get(q.answer), w = state.result.pd.winner;
  const title = w === null ? `Era ${a.name}` : multi ? `¡JUAS! ${state.players[w].name} lo adivinó` : `¡JUAS! En ${state.result.pd.tries} ${state.result.pd.tries === 1 ? 'intento' : 'intentos'}`;
  return `<div class="box result"><p class="verdict px ${w === null ? 'bad' : 'ok'}" data-tw="${esc(title)}">${esc(title)}</p>
    <div class="row" style="gap:14px;margin:6px 0 10px"><span class="dex px">${dexNo(a.id)}</span><span class="name">${esc(a.name)}</span>${typePills(a)}</div>
    ${state.result.points ? `<p class="answer">+${fmtPts(state.result.points)}</p>` : ''}${nextButton()}</div>${table ? `<div class="box">${table}</div>` : ''}`;
}

// ---------- Juasrosco ----------
function roscoView() {
  const s = state, R = E.publicRosco(s), n = s.players.length, p = R.turn;
  const board = R.boards[p], st = R.status[p], cur = R.pos[p];
  const letters = board.map((e, i) => {
    const a = (-90 + i * 360 / 27) * Math.PI / 180;
    return `<span class="rl ${st[i]} ${i === cur && s.phase === 'rosco' ? 'cur' : ''}" style="left:${50 + 44 * Math.cos(a)}%;top:${50 + 44 * Math.sin(a)}%">${e.L}</span>`;
  }).join('');
  const L = R.last && R.last.player === p && !R.last.pass && !R.last.timeout ? R.last : null;
  const feedback = L ? (L.ok ? (L.typo ? `<p class="flash ok keep">¡JUAS! Se escribe ${esc(L.answer)}</p>` : `<p class="flash ok keep">¡JUAS! ${esc(L.answer)}</p>`) : `<p class="flash bad keep">No. Era: ${esc(L.answer)}</p>`) : '';
  let panel;
  if (!R.ready) {
    const lastOther = R.last && R.last.player !== p ? R.last : null;
    const why = lastOther ? (lastOther.timeout ? `A ${esc(s.players[lastOther.player].name)} se le acabó el tiempo.` : lastOther.pass ? `${esc(s.players[lastOther.player].name)} dijo «¡Paso!».` : `${esc(s.players[lastOther.player].name)} falló: era ${esc(lastOther.answer)}.`) : '';
    panel = `<div class="box rpanel"><p class="hint">${why}</p><p class="big px" style="color:${pColor(p)}" data-tw="${esc('Turno de ' + s.players[p].name)}">Turno de ${esc(s.players[p].name)}</p>
      <p class="hint">Pásale el dispositivo. Tu reloj empieza cuando pulses «¡Listo!».</p><div class="row end"><button class="btn" data-act="r-ready" id="nextbtn">¡Listo!</button></div></div>`;
  } else {
    const e = board[cur];
    panel = `<div class="box rpanel">
      <div class="rmini"><span class="px">${st.filter(x => x === 'ok').length} aciertos</span><span class="px" id="rtext2">${fmtClock(R.time[p])}</span></div>
      <div class="row between"><span class="rletter px">${e.L}</span><span class="hint px catl">${e.mode === 'contiene' ? `Contiene la ${e.L}` : `Empieza por ${e.L}`}</span></div>
      <p class="q">${richText(e.clue)}</p>
      <div class="row"><input class="input" id="typed" autocomplete="off" placeholder="Tu respuesta (Enter vacío = ¡Paso!)" style="flex:1"></div>
      <div class="row end"><button class="btn ghost" data-act="r-pass">¡Paso!</button><button class="btn" data-act="r-answer">Responder</button></div>
      ${feedback}</div>`;
  }
  return `<main class="${F.newScreen ? 'enter' : ''}"><div class="rosco-wrap">
    <div class="rosco" style="--pc:${pColor(p)}">${letters}<div class="rcenter"><span class="px rcount">${st.filter(x => x === 'ok').length}</span><span class="hint">aciertos</span>${n > 1 ? `<span class="px" style="color:${pColor(p)};font-size:11px">${esc(s.players[p].name)}</span>` : ''}</div></div>
    ${panel}</div></main>`;
}

function roscoEnd() {
  const s = state, R = s.rosco, n = s.players.length, w = E.winners(s);
  const title = n > 1 ? (w.length === 1 ? `¡JUAS! ${w[0].name} gana` : '¡Empate!') : '¡Rosco terminado!';
  const color = n > 1 && w.length === 1 ? pColor(w[0].id) : 'var(--ink)';
  const rows = s.players.map((p, i) => `<tr><td><span style="color:${pColor(i)}">●</span> ${esc(p.name)}</td><td class="px" style="font-size:12px">${s.scores[i]}</td><td>${R.errors[i]}</td><td>${R.status[i].filter(x => x === 'p').length}</td></tr>`).join('');
  const details = s.players.map((p, i) => `<details class="box"><summary class="px catl">Respuestas de ${esc(p.name)}</summary><ol class="olist plain">${R.boards[i].map((e, j) => `<li class="${R.status[i][j] === 'ok' ? 'ok' : 'bad'}"><span class="num px">${e.L}</span><span class="tx">${esc(e.answer)}</span><span class="note">${richText(e.clue)}</span><span class="mark">${R.status[i][j] === 'ok' ? '✓' : R.status[i][j] === 'bad' ? '✗' : '—'}</span><button class="tog mini" data-act="flag-letter" data-val="${i}-${j}" ${flagged.has(`${s.seed}-r-${i}-${j}`) ? 'disabled' : ''} aria-label="Reportar la letra ${e.L}">${FLAG_SVG}</button></li>`).join('')}</ol></details>`).join('');
  return `<main class="enter"><div class="box" style="border-color:${color}">
    <p class="big px" style="color:${color}" data-tw="${esc(title)}">${esc(title)}</p>
    ${n === 1 ? `<p class="px" style="font-size:clamp(28px,6vw,44px);margin:14px 0 4px">${s.scores[0]} / 27</p>` : ''}
    ${endExtras()}</div>
    <div class="box scroll"><table><thead><tr><th>Jugador</th><th>Aciertos</th><th>Errores</th><th>Sin responder</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${details}
    <div class="row end"><button class="btn ghost" data-act="menu">Menú</button><button class="btn ghost" data-act="roscoSetup">Cambiar ajustes</button><button class="btn" data-act="rematch" id="nextbtn">${n > 1 ? 'Revancha' : 'Otra vez'}</button></div></main>`;
}

function endExtras() {
  const s = state;
  const rec = s.players.length === 1 ? (endInfo.newRecord ? `<span class="newrec px">¡Nuevo récord!</span>` : endInfo.prev !== null ? `<p class="hint">Tu récord sigue siendo ${fmtPts(endInfo.prev)}.</p>` : '') : '';
  const xp = s.players.map((p, i) => endInfo.xp?.[i] ? `${esc(p.name)} +${fmtPts(endInfo.xp[i])} XP` : '').filter(Boolean).join(' · ');
  const up = (endInfo.rankUp || []).map(u => `<p class="rankup px">¡${esc(u.name)} sube a ${esc(u.rank)}!</p>`).join('');
  const md = (endInfo.medals || []).map(m => `<div class="newmedal"><span class="mico" style="--mc:${m.medal.color}">${pixSvg(m.medal.pix, m.medal.color)}</span><span><b class="px">¡${esc(m.medal.name)}!</b><span class="hint"> ${esc(m.name)} · ${esc(m.medal.how)}</span></span></div>`).join('');
  return `<div style="margin-top:10px">${s.config.daily ? '' : rec}</div>${xp ? `<p class="hint">${xp}</p>` : ''}${up}${md}`;
}

function pregunta(q, rev) {
  const opts = q.options.map((o, i) => {
    const cls = rev ? (i === q.answer ? 'right' : state.result.given === i ? 'wrong' : '') : '';
    return `<button class="opt ${cls}" data-act="answer" data-val="${i}" data-num="1" data-k="${i + 1}" style="--i:${i}" ${rev ? 'disabled' : ''}>${optText(o)}</button>`;
  }).join('');
  return `${qHead(q)}<div class="menu">${opts}</div>
  ${rev ? resultBox(state.result.correct ? '' : `Respuesta correcta: ${optText(q.options[q.answer])}`, q.exp) : ''}`;
}

const qHead = (q, extra = '') => `<div class="box"><span class="hint px catl">${esc(q.cat)}${q.mode === 'preguntas' || q.mode === 'mezcla' ? ` · ${E.FORMATS[q.kind]}` : ''}</span><p class="q" style="margin-top:10px">${richText(q.q)}</p>${extra}</div>`;
// Acertó con un error de tipeo: punto completo, pero se le corrige.
const juasTypo = name => `<p class="typo"><b>¡JUAS!</b> Se escribe <b>${esc(name)}</b></p>`;
function resultBox(answerHtml, exp, body = '') {
  const showExp = exp && state.config.type !== 'contrarreloj';
  return `<div class="box result">${verdict()}${answerHtml ? `<p class="answer">${answerHtml}</p>` : ''}${body}${showExp ? `<p class="hint">${richText(exp)}</p>` : ''}${nextButton()}</div>`;
}

function vfView(q, rev) {
  const opt = (val, label, k, i) => {
    const cls = rev ? (val === q.answer ? 'right' : state.result.given === val ? 'wrong' : '') : '';
    return `<button class="opt tall ${cls}" data-act="answer" data-val="${val}" data-bool="1" data-k="${k}" style="--i:${i}" ${rev ? 'disabled' : ''}>${label}</button>`;
  };
  return `${qHead(q)}<div class="menu">${opt(true, 'Verdadero', '1', 0)}${opt(false, 'Falso', '2', 1)}</div>
  ${rev ? resultBox(state.result.correct ? '' : `Era ${q.answer ? 'verdadero' : 'falso'}.`, q.exp) : ''}`;
}

function ordenView(q, rev) {
  if (!rev) {
    const ord = draft.order;
    const items = q.items.map((it, i) => { const n = ord.indexOf(i); return `<button class="pick ${n >= 0 ? 'on' : ''}" data-act="ord" data-val="${i}" style="--i:${i}"><span class="num px">${n >= 0 ? n + 1 : ''}</span><span>${optText(it.text)}</span></button>`; }).join('');
    return `${qHead(q, '<p class="hint" style="margin-top:8px">Toca los elementos en orden. Toca uno numerado para quitarlo.</p>')}
    <div class="picks">${items}</div>
    <div class="row end"><button class="btn ghost" data-act="ord-reset" ${ord.length ? '' : 'disabled'}>Borrar</button><button class="btn" data-act="ord-ok" ${ord.length === q.items.length ? '' : 'disabled'}>Confirmar</button></div>`;
  }
  const given = Array.isArray(state.result.given) ? state.result.given : [];
  const rows = q.answer.map((idx, pos) => {
    const up = given.indexOf(idx), ok = up === pos, it = q.items[idx];
    return `<li class="${ok ? 'ok' : 'bad'}"><span class="num px">${pos + 1}</span><span class="tx">${optText(it.text)}</span>${it.note ? `<span class="note">${esc(it.note)}</span>` : ''}<span class="mark">${ok ? '✓' : `tú: ${up >= 0 ? up + 1 : '—'}`}</span></li>`;
  }).join('');
  return `${qHead(q)}<div class="box"><span class="l px hint">Orden correcto</span><ol class="olist">${rows}</ol></div>${resultBox('', q.exp)}`;
}

const PAIR_COLORS = ['#e3350d', '#2f6fdb', '#c98a00', '#2e9e4f', '#8a4fd8'];
function paresView(q, rev) {
  if (!rev) {
    const L = q.left.map((t, i) => {
      const linked = draft.links[i] != null, sel = draft.sel === i;
      return `<button class="pick pl ${linked ? 'on' : ''} ${sel ? 'sel' : ''}" data-act="pl" data-val="${i}" style="--pc:${PAIR_COLORS[i]};--i:${i}"><span class="num px">${String.fromCharCode(65 + i)}</span><span>${optText(t)}</span></button>`;
    }).join('');
    const R = q.right.map((t, j) => {
      const by = draft.links.indexOf(j);
      return `<button class="pick pr ${by >= 0 ? 'on' : ''}" data-act="pr" data-val="${j}" style="--pc:${by >= 0 ? PAIR_COLORS[by] : 'transparent'};--i:${j + q.left.length}"><span class="num px">${by >= 0 ? String.fromCharCode(65 + by) : ''}</span><span>${optText(t)}</span></button>`;
    }).join('');
    const done = q.left.every((_, i) => draft.links[i] != null);
    return `${qHead(q, '<p class="hint" style="margin-top:8px">Toca uno de la izquierda y luego su pareja a la derecha.</p>')}
    <div class="pairs"><div class="col">${L}</div><div class="col">${R}</div></div>
    <div class="row end"><button class="btn ghost" data-act="pr-reset" ${draft.links.some(x => x != null) ? '' : 'disabled'}>Borrar</button><button class="btn" data-act="pr-ok" ${done ? '' : 'disabled'}>Confirmar</button></div>`;
  }
  const given = Array.isArray(state.result.given) ? state.result.given : [];
  const rows = q.left.map((t, i) => {
    const ok = given[i] === q.answer[i];
    const mine = given[i] != null ? optText(q.right[given[i]]) : '—';
    return `<li class="${ok ? 'ok' : 'bad'}"><span class="tx">${optText(t)}</span><span class="arrow">→</span><span class="tx">${ok ? mine : `<s>${mine}</s> ${optText(q.right[q.answer[i]])}`}</span><span class="mark">${ok ? '✓' : '✗'}</span></li>`;
  }).join('');
  return `${qHead(q)}<div class="box"><ol class="olist plain">${rows}</ol></div>${resultBox('', q.exp)}`;
}

function multiSelView(q, rev) {
  const sel = rev ? (Array.isArray(state.result.given) ? state.result.given : []) : draft.multi;
  const opts = q.options.map((o, i) => {
    const on = sel.includes(i);
    let cls = on ? 'on' : '';
    if (rev) { const right = q.answer.includes(i); cls = right && on ? 'on right' : on ? 'on wrong' : right ? 'missed' : ''; }
    return `<button class="opt check ${cls}" data-act="mt" data-val="${i}" data-k="${i + 1}" aria-pressed="${on}" style="--i:${i}" ${rev ? 'disabled' : ''}>${optText(o)}</button>`;
  }).join('');
  return `${qHead(q, rev ? '' : `<p class="hint" style="margin-top:8px">Puede haber varias respuestas correctas.</p>`)}
  <div class="menu">${opts}</div>
  ${rev ? resultBox(state.result.correct ? '' : `Había ${plural(q.answer.length, 'correcta', 'correctas')}: ${q.answer.map(i => optText(q.options[i])).join(', ')}.`, q.exp)
    : `<div class="row end"><button class="btn" data-act="mt-ok" ${draft.multi.length ? '' : 'disabled'}>Confirmar</button></div>`}`;
}

// Sugerencias propias (no las del navegador): solo cuando las respuestas posibles son muchas.
const AC_LISTS = new Set(['pokemon', 'lideres']);
const datalist = () => '';
const acAttr = list => AC_LISTS.has(list) ? `data-ac="${list}"` : '';
function escribirView(q, rev) {
  if (!rev) {
    return `${qHead(q)}<div class="box field"><div class="row"><input class="input" id="typed" ${acAttr(q.list)} autocomplete="off" placeholder="Escribe tu respuesta" style="flex:1"><button class="btn" data-act="typed">Responder</button></div></div>${datalist(q.list)}`;
  }
  const r = state.result;
  const shown = q.show.slice(0, 6).map(esc).join(', ') + (q.valid.length > 6 ? ` y ${q.valid.length - 6} más` : '');
  const given = typeof r.given === 'string' ? (r.typo ? juasTypo(E.keyLabel(ctx, q.list, r.key)) : `<p class="hint">Escribiste: ${esc(r.given)}${r.correct && r.key ? ` (${esc(E.keyLabel(ctx, q.list, r.key))})` : ''}</p>`) : '';
  return `${qHead(q)}${resultBox(r.correct ? '' : `${q.valid.length > 1 ? 'Respuestas válidas' : 'Respuesta correcta'}: ${q.list === 'tipos' ? q.valid.map(k => badge(+k)).join(' ') : shown}`, q.exp, given)}`;
}

const BOMB_SVG = '<svg class="bombico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect x="3" y="4" width="6" height="7" fill="currentColor"/><rect x="2" y="5" width="8" height="5" fill="currentColor"/><rect x="5" y="2" width="2" height="2" fill="currentColor"/><rect x="7" y="0" width="2" height="2" fill="#ffcb05"/><rect x="4" y="5" width="2" height="2" fill="#fff" opacity=".6"/></svg>';
function bombaView(q, rev) {
  const b = q.bomb, n = state.players.length, surv = state.config.type === 'supervivencia';
  const chips = b.given.map(g => `<span class="chip2" style="--c:${pColor(g.p)}">${esc(E.keyLabel(ctx, q.list, g.key))}</span>`).join('');
  if (!rev) {
    const last = !b.last ? '' : b.last.ok ? `<p class="flash ok keep">¡Vale! ${esc(E.keyLabel(ctx, q.list, b.last.key))}${b.last.typo ? ' <small>(¡JUAS! así se escribe)</small>' : ''}</p>` : `<p class="flash bad keep">${b.last.why === 'repetido' ? 'Ya lo dijeron' : 'No vale'}: ${esc(b.last.text)}</p>`;
    const rules = n > 1 ? `Por turnos: ${E.BOMB_TURN} segundos cada uno. Si se te acaba el tiempo, ¡explota! Cada 3 respuestas tuyas valen 1 punto (máximo 3).`
      : `Escribe todos los que puedas en ${E.BOMB_SOLO} segundos. ${surv ? 'Necesitas 3 para no perder una vida.' : 'Cada 3 valen 1 punto (máximo 3).'}`;
    return `<div class="box bomb">
      <div class="row between"><span class="hint px catl">La bomba</span><span class="px count">${b.given.length}</span></div>
      <p class="q" style="margin-top:8px">${richText(q.q)}</p>
      <p class="hint">${rules}</p>
      <div class="fuse">${BOMB_SVG}<div class="hp"><i id="tbar" style="--w:100%"></i></div><span id="tleft" class="px"></span></div>
      ${n > 1 ? `<div><span class="turn px" style="--c:${pColor(b.turn)}">Turno de ${esc(state.players[b.turn].name)}</span></div>` : ''}
      <div class="row"><input class="input" id="typed" ${acAttr(q.list)} autocomplete="off" placeholder="Escribe y pulsa Enter" style="flex:1"><button class="btn" data-act="bomb-send">Enviar</button></div>
      ${last}<div class="chips">${chips}</div></div>${datalist(q.list)}`;
  }
  const res = state.result.bomb;
  const title = res.loser !== null ? `¡BOOM! A ${state.players[res.loser].name} le explotó.` : '¡Tiempo!';
  const missing = q.valid.filter(k => !b.given.some(g => g.key === k)).slice(0, 8).map(k => esc(E.keyLabel(ctx, q.list, k)));
  const table = `<table><thead><tr><th>Jugador</th><th>Respuestas</th><th>Puntos</th></tr></thead><tbody>${state.players.map((p, i) => `<tr><td><span style="color:${pColor(i)}">●</span> ${esc(p.name)}${res.loser === i ? ' 💥' : ''}</td><td>${b.counts[i]}</td><td class="px" style="font-size:12px">+${fmtPts(res.points[i])}</td></tr>`).join('')}</tbody></table>`;
  return `<div class="box bomb"><p class="verdict px bad boom" data-tw="${esc(title)}">${esc(title)}</p><p class="q">${richText(q.q)}</p>
    <div class="scroll" style="margin-top:10px">${table}</div><div class="chips" style="margin-top:12px">${chips}</div>
    ${missing.length ? `<p class="hint" style="margin-top:10px">Algunas que faltaron: ${missing.join(', ')}.</p>` : ''}${nextButton()}</div>`;
}

function questionView() {
  const s = state;
  const pv = E.publicView(s); // la interfaz solo ve lo que vería un jugador en línea
  const q = s.phase === 'reveal' ? s.q : pv.q;
  const rev = s.phase === 'reveal';
  const pi = E.currentPlayer(s);
  const views = { masomenos: masOMenos, idioma, quien: idioma, pokedex: pokedexView, preguntas: pregunta, intruso: pregunta, vf: vfView, orden: ordenView, pares: paresView, multi: multiSelView, escribir: escribirView, bomba: bombaView, estimacion: estView, pokedle: pokedleView };
  const body = views[q.kind](q, rev);
  const left = q.mode === 'mezcla' ? E.FORMATS[q.kind] : s.config.type === 'clasica' ? `Ronda ${s.ri + 1}/${s.config.rounds.length} · ${E.MODES[q.mode].name}` : E.MODES[q.mode].name;
  const right = s.config.type === 'clasica' ? `Pregunta ${s.qi + 1} de ${E.questionsPerRound(s)}` : `Pregunta ${s.qi + 1}`;
  return `<main class="${F.newQ ? 'enter' : ''}">
  <div class="meta px"><span>${left}</span><span>${right}</span></div>
  ${s.players.length > 1 && !['bomba', 'pokedle'].includes(q.kind) && !q.est ? `<div class="row"><span class="turn px" style="--c:${pColor(pi)}">Turno de ${esc(s.players[pi].name)}</span></div>` : ''}
  ${q.kind !== 'bomba' ? timerBar() : ''}
  ${body}</main>`;
}

function endView() {
  const s = state, c = s.config;
  const total = s.log.length, right = s.log.filter(l => l.correct).length;
  let title, color = 'var(--ink)', sub;
  if (s.players.length > 1) {
    const w = E.winners(s);
    title = w.length === 1 ? `¡JUAS! ${w[0].name} gana` : '¡Empate!';
    if (w.length === 1) color = pColor(w[0].id);
    sub = `${right} de ${total} respuestas correctas entre todos.`;
  } else if (c.type === 'supervivencia') {
    title = '¡Fin del camino!';
    sub = `Sumaste ${fmtPts(s.scores[0])} ${s.scores[0] === 1 ? 'punto' : 'puntos'} antes de quedarte sin vidas. Tu mejor racha fue de ${s.bestStreak}.`;
  } else if (c.type === 'contrarreloj') {
    title = '¡Tiempo!';
    sub = `${fmtPts(s.scores[0])} ${s.scores[0] === 1 ? 'punto' : 'puntos'} en ${plural(total, 'respuesta', 'respuestas')} y ${c.duration} segundos.`;
  } else {
    title = '¡Partida terminada!';
    sub = `${fmtPts(s.scores[0])} puntos · ${right} de ${total} correctas.`;
  }
  const again = s.players.length > 1 ? 'startMultiCfg' : 'soloCfg';
  if (c.daily) {
    const right = s.log.filter(l => l.correct).length;
    return `<main class="enter"><div class="box"><p class="big px" data-tw="¡Reto completado!">¡Reto completado!</p>
      <p class="px" style="font-size:clamp(28px,6vw,44px);margin:14px 0 4px">${fmtPts(s.scores[0])} / 10</p>
      <p class="hint">${right} de ${s.log.length} correctas. Racha: ${plural(dailyStreak(), 'día', 'días')} seguidos. Mañana hay otro reto.</p>${endExtras()}</div>
      <div class="box field"><span class="l px">Tabla de hoy</span>${boardHtml()}</div>
      <div class="row end"><button class="btn ghost" data-act="menu">Menú</button><button class="btn" data-act="daily" id="nextbtn">Ver el reto del día</button></div></main>`;
  }
  return `<main class="enter">
  <div class="box" style="border-color:${color}">
    <p class="big px" style="color:${color}" data-tw="${esc(title)}">${esc(title)}</p>
    ${s.players.length === 1 ? `<p class="px" style="font-size:clamp(28px,6vw,44px);margin:14px 0 4px">${fmtPts(s.scores[0])}</p>` : ''}
    <p class="hint" style="margin-top:10px">${sub}</p>
    ${endExtras()}
  </div>
  ${s.players.length > 1 ? `<div class="box scroll">${standingsTable()}</div>` : ''}
  <div class="row end"><button class="btn ghost" data-act="menu">Menú</button><button class="btn ghost" data-act="${again}">Cambiar ajustes</button><button class="btn" data-act="rematch" id="nextbtn">${s.players.length > 1 ? 'Revancha' : 'Otra vez'}</button></div></main>`;
}

// ---------- ventanas: pausa, ajustes y confirmación ----------
function renderOverlay() {
  if (!overlay) { $ov.innerHTML = ''; return; }
  let inner = '';
  if (overlay === 'pause') {
    inner = `<h2 class="px">Pausa</h2><div class="dlist">
      <button class="ditem" data-act="resume" id="first">Continuar</button>
      <button class="ditem" data-act="settings">Ajustes</button>
      <button class="ditem danger" data-act="ask-home">Volver al inicio</button></div>`;
  } else if (overlay === 'settings') {
    const c = state.config, ta = c.type === 'contrarreloj' || c.type === 'rosco';
    if (c.type === 'rosco' || c.daily) inner = `<h2 class="px">Ajustes</h2><div class="field"><span class="l px">Sonido</span><div class="togs">${tog('mute', 'on', !Sound.muted, 'Con sonido')}${tog('mute', 'off', Sound.muted, 'Sin sonido')}</div>
      <p class="hint">${c.daily ? 'El reto del día es igual para todos, así que sus ajustes no se pueden cambiar.' : 'Los jugadores y el tiempo del rosco no se pueden cambiar a media partida. Tu reloj está detenido mientras esta ventana está abierta.'}</p>
      <div class="row between"><button class="btn ghost" data-act="pause">◀ Volver</button><button class="btn ghost" data-act="ask-restart">Empezar de nuevo</button></div></div>`;
    else inner = `<h2 class="px">Ajustes</h2><div class="field">
      ${ta ? '' : `<span class="l px">Tiempo por pregunta</span><div class="togs">${[[0, 'Sin tiempo'], [20, '20 s'], [40, '40 s']].map(([v, l]) => tog('live-timer', v, c.timer === v, l)).join('')}</div>
      <span class="l px">Pokeidioma</span><div class="togs">${tog('live-idioma', 'opciones', c.idiomaMode === 'opciones', '4 opciones')}${tog('live-idioma', 'escribir', c.idiomaMode === 'escribir', 'Escribir')}</div>`}
      <span class="l px">Generaciones</span><div class="togs">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(g => tog('live-gen', g, c.gens.includes(g), g)).join('')}</div>
      ${c.type !== 'rosco' && E.isMixed(state) ? `<span class="l px">Formatos</span><div class="togs">${Object.entries(E.FORMATS).filter(([k]) => !(ta && ['bomba', 'pokedle'].includes(k))).map(([k, n]) => tog('live-fmt', k, (c.formats || []).includes(k), n)).join('')}</div>` : ''}
      ${c.type !== 'rosco' ? `<span class="l px">Temas de las preguntas</span><div class="togs">${Object.entries(E.CATS).map(([k, n]) => tog('live-cat', k, (c.cats || []).includes(k), n)).join('')}</div>` : ''}
      <span class="l px">Sonido</span><div class="togs">${tog('mute', 'on', !Sound.muted, 'Con sonido')}${tog('mute', 'off', Sound.muted, 'Sin sonido')}</div>
      <p class="hint">Los cambios aplican desde la siguiente pregunta.</p>
      <p class="hint">${c.type === 'clasica' ? 'Los jugadores, las rondas y las preguntas por ronda' : 'El modo de juego y los tipos de pregunta'} no se pueden cambiar a media partida.</p>
      <div class="row between"><button class="btn ghost" data-act="pause">◀ Volver</button><button class="btn ghost" data-act="ask-restart">Empezar de nuevo</button></div></div>`;
  } else if (overlay === 'flag') {
    inner = `<h2 class="px">Reportar</h2><p class="hint">${esc(qSummary(flagCtx.data))}</p>
      <div class="dlist">${FLAG_REASONS.map((t, i) => `<button class="tog reason" data-act="flag-reason" data-val="${i}" aria-pressed="${flagCtx.reason === i}">${t}</button>`).join('')}</div>
      <label class="field" style="margin-top:12px"><span class="hint">Nota (opcional)</span><textarea class="input" id="flag-note" rows="3" maxlength="500" placeholder="¿Qué está mal? ¿Cuál sería lo correcto?">${esc(flagCtx.note || '')}</textarea></label>
      <div class="row between" style="margin-top:12px"><button class="btn ghost" data-act="flag-cancel">Cancelar</button><button class="btn" data-act="flag-send" ${flagCtx.reason == null ? 'disabled' : ''}>Enviar reporte</button></div>`;
  } else if (overlay.startsWith('confirm')) {
    const msg = overlay === 'confirm-reset' ? '¿Seguro que quieres borrar todos los récords? No se pueden recuperar.' : overlay === 'confirm-restart' ? '¿Empezar de nuevo con otros ajustes? Se perderá el progreso de esta partida.' : '¿Seguro que quieres volver al inicio? Se perderá el progreso de esta partida.';
    inner = `<p class="q" data-tw="${esc(msg)}">${esc(msg)}</p><div class="dlist">
      <button class="ditem danger" data-act="confirm-yes">Sí</button>
      <button class="ditem" data-act="confirm-no" id="first">No</button></div>`;
  }
  $ov.innerHTML = `<div class="veil" data-act="veil"><div class="box dialog" role="dialog" aria-modal="true">${inner}</div></div>`;
  $ov.querySelector('#first')?.focus({ preventScroll: true });
  if (overlay === 'flag') { const ta = $ov.querySelector('#flag-note'); if (ta && flagCtx.noteFocus) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }
  startTyping($ov);
}

function openOverlay(name) {
  if (!overlay && view === 'game') pauseClock();
  overlay = name;
  renderOverlay();
}
function closeOverlay() {
  overlay = null;
  renderOverlay();
  if (view === 'game') resumeClock();
}

// ---------- reloj (en línea lo controlará el servidor) ----------
function pauseClock() {
  if (clock.paused) return;
  clock.paused = true;
  const now = Date.now();
  if (clock.qEnd) { clock.qLeft = Math.max(0, clock.qEnd - now); clock.qEnd = 0; }
  if (clock.tEnd) { clock.tLeft = Math.max(0, clock.tEnd - now); clock.tEnd = 0; clock.tWas = true; }
  clock.pausedAt = now;
  clearTimeout(autoNext); autoNext = null;
}
const roscoElapsed = () => clock.rStart ? Date.now() - clock.rStart : 0;
function resumeClock() {
  if (!clock.paused) return;
  clock.paused = false;
  const now = Date.now();
  if (clock.qKey && clock.qLeft) clock.qEnd = now + clock.qLeft;
  if (clock.tWas) { clock.tEnd = now + clock.tLeft; clock.tWas = false; }
  if (clock.rStart && clock.pausedAt) clock.rStart += now - clock.pausedAt;
  if (state?.phase === 'reveal' && state.config.type === 'contrarreloj') scheduleAuto();
  syncClock();
}
function syncClock() {
  const inGame = view === 'game' && state;
  const q = inGame && state.phase === 'question' ? state.q : null;
  let key = '', dur = 0;
  if (q?.kind === 'bomba') {
    const multi = state.players.length > 1;
    key = multi ? `b-${state.ri}-${state.qi}-${q.bomb.given.length}` : `b-${state.ri}-${state.qi}`;
    dur = (multi ? E.BOMB_TURN : E.BOMB_SOLO) * 1000;
  } else if (q && state.config.timer > 0 && state.config.type !== 'contrarreloj') {
    const sub = q.kind === 'pokedle' ? `-${q.pd.guesses.length}` : q.est ? `-${q.est.answered.length}` : '';
    key = `${state.ri}-${state.qi}${sub}`; dur = state.config.timer * 1000;
  }
  if (key !== clock.qKey) {
    clock.qKey = key; clock.qDur = dur; clock.qLeft = dur;
    clock.qEnd = key && !clock.paused ? Date.now() + dur : 0;
  }
  if (!inGame || state.phase === 'end' || state.config.type !== 'contrarreloj') { clock.tEnd = 0; clock.tWas = false; }
  const rActive = inGame && state.phase === 'rosco' && state.rosco.ready;
  const rkey = rActive ? `${state.rosco.turn}-${state.rosco.seq}` : '';
  if (rkey !== clock.rKey) { clock.rKey = rkey; clock.rStart = rActive ? Date.now() : 0; clock.rBase = rActive ? state.rosco.time[state.rosco.turn] : 0; clock.pausedAt = clock.paused ? Date.now() : 0; }
  const running = clock.qEnd || clock.tEnd || clock.rStart;
  if (running && !clock.id) clock.id = setInterval(tick, 100);
  if (!running && clock.id) { clearInterval(clock.id); clock.id = null; }
  tick();
}
function tick() {
  if (clock.paused || !state) return;
  const now = Date.now();
  if (clock.qEnd) {
    const left = Math.max(0, clock.qEnd - now), pct = left / (clock.qDur || 1) * 100;
    const bar = document.getElementById('tbar'), txt = document.getElementById('tleft');
    if (bar) { bar.style.setProperty('--w', pct + '%'); bar.style.setProperty('--hc', pct > 50 ? 'var(--ok)' : pct > 20 ? 'var(--yellow)' : 'var(--bad)'); }
    const sec = Math.ceil(left / 1000);
    if (txt) txt.textContent = sec;
    if (sec <= 5 && sec > 0 && sec !== clock.lastSec) Sound.play('tick');
    clock.lastSec = sec;
    if (left <= 0) {
      clock.qEnd = 0;
      if (state.q?.kind === 'bomba') dispatch({ type: 'BOMB_END', player: state.q.bomb.turn });
      else if (state.q?.kind === 'pokedle') dispatch({ type: 'SKIP', player: state.q.pd.turn });
      else if (state.q?.est) dispatch({ type: 'EST_ANSWER', player: state.q.est.turn, value: null });
      else dispatch({ type: 'ANSWER', player: E.currentPlayer(state), value: null });
      return;
    }
  }
  if (clock.tEnd) {
    const left = Math.max(0, clock.tEnd - now), total = state.config.duration * 1000;
    const bar = document.getElementById('tabar'), txt = document.getElementById('tatext');
    if (bar) { bar.style.setProperty('--w', left / total * 100 + '%'); bar.style.setProperty('--hc', left > total / 2 ? '#6fe08e' : left > total / 5 ? 'var(--yellow)' : '#ff8a8a'); }
    if (txt) txt.textContent = fmtClock(left);
    const sec = Math.ceil(left / 1000);
    if (sec <= 5 && sec > 0 && sec !== clock.lastTSec) Sound.play('tick');
    clock.lastTSec = sec;
    if (left <= 0) { clock.tEnd = 0; clearTimeout(autoNext); dispatch({ type: 'TIME_UP' }); }
  }
  if (clock.rStart && state.phase === 'rosco') {
    const left = Math.max(0, clock.rBase - (now - clock.rStart)), total = state.config.roscoTime * 1000;
    const bar = document.getElementById('rbar'), txt = document.getElementById('rtext');
    if (bar) { bar.style.setProperty('--w', left / total * 100 + '%'); bar.style.setProperty('--hc', left > total / 2 ? '#6fe08e' : left > total / 5 ? 'var(--yellow)' : '#ff8a8a'); }
    if (txt) txt.textContent = fmtClock(left);
    const t2 = document.getElementById('rtext2'); if (t2) t2.textContent = fmtClock(left);
    const sec = Math.ceil(left / 1000);
    if (sec <= 5 && sec > 0 && sec !== clock.lastRSec) Sound.play('tick');
    clock.lastRSec = sec;
    if (left <= 0) { clock.rStart = 0; dispatch({ type: 'ROSCO_TIME', player: state.rosco.turn }); }
  }
}

// Conecta el deslizador y el número de la Estimación.
function syncEst() {
  const range = document.getElementById('est-range'), num = document.getElementById('est-num');
  if (!range || !num || !state?.q) return;
  const q = state.q;
  num.value = estFromSlider(q, +range.value);
  range.addEventListener('input', () => { num.value = estFromSlider(q, +range.value); });
  num.addEventListener('input', () => { const v = Math.min(q.max, Math.max(q.min, Number(num.value) || q.min)); range.value = estToSlider(q, v); });
  num.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); document.querySelector('[data-act=est-ok]')?.click(); } });
}

// El golpe: «¡JUAS!» enorme y la pantalla tiembla.
function juasHit(crit) {
  if (reduced) return;
  document.querySelectorAll('.juas').forEach(x => x.remove());
  const el = document.createElement('div');
  el.className = 'juas' + (crit ? ' crit' : '');
  el.innerHTML = `<span>¡JUAS${crit ? '<small>crítico</small>' : ''}!</span>`;
  document.body.appendChild(el);
  const m = $app.querySelector('main'); m?.classList.add('hit');
  setTimeout(() => { el.remove(); m?.classList.remove('hit'); }, 900);
}

// ---------- efectos ----------
function startTyping(root) {
  typers.forEach(t => t.finish());
  typers = [];
  const els = root.querySelectorAll('[data-tw]');
  if (reduced) return;
  els.forEach(el => {
    const text = el.dataset.tw;
    let i = 0;
    el.textContent = '';
    const t = { finish() { clearInterval(t.id); el.textContent = text; } };
    t.id = setInterval(() => {
      i++;
      el.textContent = text.slice(0, i);
      if (i % 3 === 1 && text[i - 1] !== ' ') Sound.play('type');
      if (i >= text.length) clearInterval(t.id);
    }, 26);
    typers.push(t);
  });
}
function finishTyping() { typers.forEach(t => t.finish()); typers = []; }

function wipe() {
  if (reduced) return;
  const w = document.createElement('div');
  w.className = 'wipe';
  w.innerHTML = Array.from({ length: 8 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
  document.body.appendChild(w);
  setTimeout(() => w.remove(), 1200);
}
function confetti() {
  if (reduced) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#e3350d', '#2f6fdb', '#ffcb05', '#2e9e4f', '#ffffff'];
  box.innerHTML = Array.from({ length: 70 }, (_, i) => `<i style="left:${Math.random() * 100}%;--c:${colors[i % 5]};--d:${(2.4 + Math.random() * 2).toFixed(2)}s;--delay:${(Math.random() * 0.9).toFixed(2)}s"></i>`).join('');
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 5000);
}
function countUp() {
  if (!state) return;
  document.querySelectorAll('[data-score]').forEach(el => {
    const i = +el.dataset.score, to = state.scores[i], from = last.scores[i] ?? to;
    if (from === to || reduced) { el.textContent = fmtPts(to); return; }
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    const t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / 500); el.textContent = fmtPts(Math.round((from + (to - from) * k) * 2) / 2); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  last.scores = state.scores.slice();
}

// ---------- dibujar ----------
function render() {
  const sk = view + '|' + (view === 'game' && state ? `${state.phase}|${state.ri}|${state.qi}${state.phase === 'rosco' ? `|${state.rosco.turn}|${state.rosco.ready}` : ''}` : '');
  const qk = view === 'game' && state ? `${state.ri}|${state.qi}` : '';
  F = { newScreen: sk !== last.screen, newQ: view === 'game' && state?.phase === 'question' && qk !== last.q };
  if (F.newQ) draft = { order: [], links: [], sel: null, multi: [] };
  let html;
  if (view === 'title') html = titleView();
  else if (view === 'menu') html = menuView();
  else if (view === 'solo') html = soloView();
  else if (view === 'multi') html = multiView();
  else if (view === 'custom') html = customView();
  else if (view === 'records') html = recordsView();
  else if (view === 'roscoSetup') html = roscoSetupView();
  else if (view === 'reports') html = reportsView();
  else if (view === 'daily') html = dailyView();
  else {
    const p = state.phase;
    html = hudView() + (p === 'intro' || p === 'roundEnd' ? introView() : p === 'rosco' ? roscoView() : p === 'end' ? (state.rosco ? roscoEnd() : endView()) : questionView());
  }
  $app.innerHTML = html;
  $app.classList.toggle('still', !F.newScreen);
  flash = '';
  if (F.newScreen) startTyping($app); else finishTyping();
  if (view === 'game') {
    countUp();
    if (F.newScreen && (state.phase === 'roundEnd' || state.phase === 'intro')) wipe();
    if (F.newScreen && state.phase === 'end' && (state.players.length > 1 ? E.winners(state).length === 1 : endInfo.newRecord || endInfo.rankUp?.length)) confetti();
    if (F.newScreen && state.phase === 'reveal' && state.result?.correct) juasHit(state.result.streak >= 3);
    if (state.phase === 'rosco' && state.rosco.last?.ok && state.rosco.seq !== last.rseq) juasHit(false);
    last.rseq = state.rosco?.seq;
    syncEst();
    const grow = $app.querySelector('[data-grow]');
    if (grow && F.newScreen) requestAnimationFrame(() => requestAnimationFrame(() => grow.style.setProperty('--w', grow.dataset.grow + '%')));
    const focus = $app.querySelector('#typed') || $app.querySelector('#nextbtn');
    if (focus && !overlay) focus.focus({ preventScroll: true });
  }
  last.screen = sk;
  if (state?.phase === 'question') last.q = qk;
  last.view = view;
  syncClock();
}

// ---------- acciones de la interfaz ----------
// El reto del día no usa preguntas propias, para que sea igual en todos los dispositivos.
function rebuildCtx(daily = false) { ctx = E.buildContext(raw, bank, daily ? [] : custom.map((q, i) => ({ ...q, id: 'custom-' + i })), world, historia, pokedex, roscoHand, extra); }
function startGame(engineCfg) {
  rebuildCtx();
  state = E.createGame(engineCfg, (Date.now() ^ (Math.random() * 1e9)) >>> 0, store.load('pt-history', {}));
  last.scores = [];
  endInfo = { newRecord: false, prev: null };
  clock.qKey = ''; clock.tEnd = 0; clock.tLeft = state.config.duration * 1000; clock.paused = false;
  goto('game');
}
function goto(v) { view = v; document.querySelectorAll('.confetti').forEach(c => c.remove()); window.scrollTo?.(0, 0); render(); }
function shared() {
  return { structure: cfg.structure, formats: cfg.formats.slice(), rounds: E.ROUND_MODES.filter(k => cfg.rounds.includes(k)), perPlayer: cfg.perPlayer, gens: cfg.gens.slice(), cats: cfg.cats.slice(), idiomaMode: cfg.idiomaMode, timer: cfg.timer };
}

function showAc(inp) {
  const list = inp.dataset.ac, row = inp.closest('.row') || inp;
  let box = row.parentElement.querySelector(':scope > .acbox');
  if (!box) { box = document.createElement('div'); box.className = 'acbox'; row.before(box); }
  const n = E.normalize(inp.value);
  if (n.length < 3) { box.innerHTML = ''; return; }
  const names = ctx.lists[list] || [], starts = [], has = [];
  for (const name of names) { const k = E.normalize(name); if (k.startsWith(n)) starts.push(name); else if (k.includes(n)) has.push(name); if (starts.length >= 4) break; }
  box.innerHTML = [...new Set([...starts, ...has])].slice(0, 4).map(m => `<button type="button" class="acopt" data-act="ac-pick" data-val="${esc(m)}">${esc(m)}</button>`).join('');
}
// Modo teclado (celular): al escribir se esconde lo que no hace falta y la pregunta queda a la vista.
const isPhone = () => TOUCH || innerWidth < 760;
function ensureVisible(el) {
  const target = el.closest('.rpanel') || el.closest('main')?.querySelector('.box') || el;
  setTimeout(() => {
    target.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    const vv = window.visualViewport, r = el.getBoundingClientRect();
    if (vv && r.bottom > vv.height - 8) el.scrollIntoView({ block: 'end', behavior: reduced ? 'auto' : 'smooth' });
  }, 60);
}
document.addEventListener('focusin', e => {
  if (view === 'game' && isPhone() && e.target.matches('input:not([type=range]),textarea') && !e.target.closest('.veil')) { document.body.classList.add('kb'); ensureVisible(e.target); }
});
document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement?.matches?.('input:not([type=range]),textarea')) document.body.classList.remove('kb'); }, 150));
window.visualViewport?.addEventListener('resize', () => { const a = document.activeElement; if (document.body.classList.contains('kb') && a?.matches?.('input,textarea')) ensureVisible(a); });
// Que tocar una sugerencia no cierre el teclado.
document.addEventListener('pointerdown', e => { if (e.target.closest('.acopt')) e.preventDefault(); });

document.addEventListener('input', e => {
  if (e.target.dataset?.ac) showAc(e.target);
  if (e.target.id === 'flag-note' && flagCtx) { flagCtx.note = e.target.value; flagCtx.noteFocus = true; }
  const i = e.target.dataset.player;
  if (i !== undefined) { cfg.players[+i] = e.target.value; saveCfg(); }
  if (e.target.dataset.soloName) { cfg.solo.name = e.target.value; saveCfg(); }
  const ri = e.target.dataset.rplayer;
  if (ri !== undefined) { cfg.rosco.players[+ri] = e.target.value; saveCfg(); }
});

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (typers.length && !b) finishTyping();
  if (!b || b.disabled) return;
  const act = b.dataset.act, v = b.dataset.val;
  if (act === 'veil') { if (e.target === b && (overlay === 'pause' || overlay === 'settings' || overlay === 'flag')) { Sound.play('back'); closeOverlay(); } return; }
  const toggle = (arr, x) => arr.includes(x) ? arr.filter(y => y !== x) : arr.concat(x);
  const quiet = ['ac-pick', 'answer', 'typed', 'hint', 'mute', 'press', 'bomb-send', 'ord-ok', 'pr-ok', 'mt-ok', 'r-answer', 'r-pass', 'pd-send', 'est-ok', 'r-ready'];
  if (!quiet.includes(act)) Sound.play(act === 'menu' || act === 'confirm-no' || act === 'resume' ? 'back' : 'select');
  switch (act) {
    case 'press': Sound.play('start'); goto('menu'); return;
    case 'title': goto('title'); return;
    case 'menu': goto('menu'); return;
    case 'mute': if (!v || (v === 'off') !== Sound.muted) Sound.toggle(); render(); if (overlay) renderOverlay(); return;
    case 'solo': case 'multi': case 'custom': case 'records': goto(act); return;
    case 'daily': goto('daily'); loadDailyBoard(); return;
    case 'playDaily': if (!daily[crDate()]) startDaily(); return;
    case 'continue': {
      const saved = store.load('pt-save', null);
      if (!saved?.state) { render(); return; }
      rebuildCtx(!!saved.state.config.daily); state = saved.state; last.scores = state.scores.slice(); endInfo = { newRecord: false, prev: null };
      clock.qKey = ''; clock.paused = false; goto('game'); return;
    }
    case 'soloType': cfg.solo.type = v; break;
    case 'addplayer': cfg.players = cfg.players.concat(`Jugador ${cfg.players.length + 1}`); break;
    case 'delplayer': cfg.players = cfg.players.filter((_, i) => i !== +v); break;
    case 'round': cfg.rounds = toggle(cfg.rounds, v); break;
    case 'per': cfg.perPlayer = +v; break;
    case 'soloPer': cfg.solo.perRound = +v; break;
    case 'soloDur': cfg.solo.duration = +v; break;
    case 'cat': { const c = toggle(cfg.cats, v); cfg.cats = c.length ? c : cfg.cats; break; }
    case 'cats': cfg.cats = Object.keys(E.CATS); break;
    case 'gen': { const g = toggle(cfg.gens, +v).sort((a, c) => a - c); cfg.gens = g.length ? g : cfg.gens; break; }
    case 'gens': cfg.gens = v === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3]; break;
    case 'idioma': cfg.idiomaMode = v; break;
    case 'timer': cfg.timer = +v; break;
    case 'startSolo': saveCfg(); startGame({ ...shared(), type: cfg.solo.type, perPlayer: cfg.solo.perRound, duration: cfg.solo.duration, players: [cfg.solo.name.trim() || 'Rojo'] }); return;
    case 'startMulti': saveCfg(); startGame({ ...shared(), type: 'clasica', players: cfg.players.map((n, i) => n.trim() || `Jugador ${i + 1}`) }); return;
    case 'soloCfg': goto('solo'); return;
    case 'roscoSetup': goto('roscoSetup'); return;
    case 'startRosco': saveCfg(); startGame({ type: 'rosco', players: cfg.rosco.players.map((n, i) => n.trim() || `Jugador ${i + 1}`), roscoTime: cfg.rosco.time, gens: cfg.gens.slice() }); return;
    case 'radd': cfg.rosco.players = cfg.rosco.players.concat(`Jugador ${cfg.rosco.players.length + 1}`); break;
    case 'rdel': cfg.rosco.players = cfg.rosco.players.filter((_, i) => i !== +v); break;
    case 'rtime': cfg.rosco.time = +v; break;
    case 'structure': cfg.structure = v; break;
    case 'fmt': { const f = toggle(cfg.formats, v); cfg.formats = f.length ? f : cfg.formats; break; }
    case 'fmts': cfg.formats = Object.keys(E.FORMATS); break;
    case 'r-ready': dispatch({ type: 'ROSCO_READY', player: state.rosco.turn }); return;
    case 'r-answer': {
      const val = document.getElementById('typed')?.value.trim();
      if (!val) { dispatch({ type: 'ROSCO_PASS', player: state.rosco.turn, elapsed: roscoElapsed() }); return; }
      dispatch({ type: 'ROSCO_ANSWER', player: state.rosco.turn, value: val, elapsed: roscoElapsed() }); return;
    }
    case 'r-pass': dispatch({ type: 'ROSCO_PASS', player: state.rosco.turn, elapsed: roscoElapsed() }); return;
    case 'est-ok': {
      const v = Number(document.getElementById('est-num').value);
      if (state.q.est) dispatch({ type: 'EST_ANSWER', player: state.q.est.turn, value: v });
      else dispatch({ type: 'ANSWER', player: E.currentPlayer(state), value: v });
      return;
    }
    case 'pd-send': {
      const el = document.getElementById('typed'), val = el.value.trim();
      if (val) dispatch({ type: 'PD_GUESS', player: state.q.pd.turn, value: val }); else el.focus();
      return;
    }
    case 'startMultiCfg': goto('multi'); return;
    case 'begin': dispatch({ type: 'START' }); return;
    case 'next': dispatch({ type: 'NEXT' }); return;
    case 'rematch': dispatch({ type: 'REMATCH' }); return;
    case 'hint': dispatch({ type: 'HINT', player: E.currentPlayer(state) }); return;
    case 'answer': dispatch({ type: 'ANSWER', player: E.currentPlayer(state), value: b.dataset.num ? +v : b.dataset.bool ? v === 'true' : v }); return;
    case 'ord': { const i = +v, k = draft.order.indexOf(i); draft.order = k >= 0 ? draft.order.slice(0, k) : draft.order.concat(i); render(); return; }
    case 'ord-reset': draft.order = []; render(); return;
    case 'ord-ok': dispatch({ type: 'ANSWER', player: E.currentPlayer(state), value: draft.order.slice() }); return;
    case 'pl': { const i = +v; if (draft.links[i] != null) draft.links[i] = null; draft.sel = draft.sel === i ? null : i; render(); return; }
    case 'pr': {
      const j = +v, by = draft.links.indexOf(j);
      if (draft.sel !== null) { if (by >= 0) draft.links[by] = null; draft.links[draft.sel] = j; const next = state.q.left.findIndex((_, i) => draft.links[i] == null); draft.sel = next >= 0 ? next : null; }
      else if (by >= 0) { draft.links[by] = null; draft.sel = by; }
      render(); return;
    }
    case 'pr-reset': draft.links = []; draft.sel = null; render(); return;
    case 'pr-ok': dispatch({ type: 'ANSWER', player: E.currentPlayer(state), value: state.q.left.map((_, i) => draft.links[i] ?? -1) }); return;
    case 'mt': { const i = +v; draft.multi = draft.multi.includes(i) ? draft.multi.filter(x => x !== i) : draft.multi.concat(i); render(); return; }
    case 'mt-ok': dispatch({ type: 'ANSWER', player: E.currentPlayer(state), value: draft.multi.slice().sort((a, c) => a - c) }); return;
    case 'bomb-send': {
      const el = document.getElementById('typed'), val = el.value.trim();
      if (val) dispatch({ type: 'BOMB_ANSWER', player: state.q.bomb.turn, value: val }); else el.focus();
      return;
    }
    case 'typed': {
      const val = document.getElementById('typed').value.trim();
      if (val) dispatch({ type: 'ANSWER', player: E.currentPlayer(state), value: val });
      return;
    }
    case 'pause': openOverlay('pause'); return;
    case 'ac-pick': { const inp = document.getElementById('typed'); if (inp) { inp.value = v; inp.focus(); } b.parentElement.innerHTML = ''; return; }
    case 'flag': flagCtx = { key: `${state.seed}-${state.ri}-${state.qi}`, data: snapQuestion(), reason: null, note: '' }; openOverlay('flag'); return;
    case 'flag-letter': {
      const [pi, li] = v.split('-').map(Number), e2 = state.rosco.boards[pi][li];
      flagCtx = { key: `${state.seed}-r-${pi}-${li}`, player: pi, data: { q: { kind: 'rosco', L: e2.L, mode: e2.mode, clue: e2.clue, answer: e2.answer, acc: e2.acc }, given: null, status: state.rosco.status[pi][li] }, reason: null, note: '' };
      openOverlay('flag'); return;
    }
    case 'flag-reason': flagCtx.reason = +v; flagCtx.noteFocus = false; renderOverlay(); return;
    case 'flag-cancel': closeOverlay(); return;
    case 'flag-send': saveReport(FLAG_REASONS[flagCtx.reason], flagCtx.note || ''); closeOverlay(); render(); toast(dbRef ? '¡Reporte enviado!' : 'Reporte guardado en este dispositivo'); return;
    case 'reports': goto('reports'); loadRemote(); return;
    case 'install': if (installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; render(); }); } return;
    case 'copy-reports': {
      const mine = new Set(reports.map(r => r.id));
      const all = reports.map(r => r.data).concat((remoteReports || []).filter(r => !mine.has(r.id)).map(r => r.data));
      const text = 'Reportes de JUASmon:\n' + JSON.stringify(all.map(d => ({ ...d, q: undefined, pregunta: d.q })), null, 1);
      (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(() => toast('Copiado. Pégalo en el chat con Claude.'), () => toast('No se pudo copiar'));
      return;
    }
    case 'del-report': {
      const r = reports.find(x => x.id === v);
      reports = reports.filter(x => x.id !== v); store.save('pt-reports', reports);
      if (remoteReports) remoteReports = remoteReports.filter(x => x.id !== v);
      if (dbRef && (r?.synced || !r)) dbRef.collection('reportes').doc(v).delete().catch(() => {});
      render(); return;
    }
    case 'resume': closeOverlay(); return;
    case 'settings': openOverlay('settings'); return;
    case 'ask-home': openOverlay('confirm-home'); return;
    case 'ask-restart': openOverlay('confirm-restart'); return;
    case 'ask-reset': openOverlay('confirm-reset'); return;
    case 'confirm-no': if (overlay === 'confirm-reset') closeOverlay(); else openOverlay('pause'); return;
    case 'confirm-yes': {
      const which = overlay;
      overlay = null; renderOverlay();
      if (which === 'confirm-reset') { records = { solo: {}, duels: {}, games: 0, xp: {} }; store.save('pt-records', records); render(); return; }
      if (state?.config.daily && state.phase !== 'end') { recordEnd(); }
      store.del('pt-save');
      clock = { qKey: '', qEnd: 0, qLeft: 0, tEnd: 0, tLeft: 0, paused: false, id: clock.id, lastSec: -1 };
      clearTimeout(autoNext);
      const solo = state.players.length === 1, wasRosco = state.config.type === 'rosco', wasDaily = !!state.config.daily;
      state = null;
      goto(which === 'confirm-restart' ? (wasDaily ? 'daily' : wasRosco ? 'roscoSetup' : solo ? 'solo' : 'multi') : 'menu');
      return;
    }
    case 'live-timer': dispatch({ type: 'SET_CONFIG', patch: { timer: +v } }); renderOverlay(); return;
    case 'live-idioma': dispatch({ type: 'SET_CONFIG', patch: { idiomaMode: v } }); renderOverlay(); return;
    case 'live-fmt': { const fs = toggle(state.config.formats || Object.keys(E.FORMATS), v); if (fs.length) dispatch({ type: 'SET_CONFIG', patch: { formats: fs } }); renderOverlay(); return; }
    case 'live-cat': { const cs = toggle(state.config.cats || Object.keys(E.CATS), v); if (cs.length) dispatch({ type: 'SET_CONFIG', patch: { cats: cs } }); renderOverlay(); return; }
    case 'live-gen': { const g = toggle(state.config.gens, +v).sort((a, c) => a - c); if (g.length) dispatch({ type: 'SET_CONFIG', patch: { gens: g } }); renderOverlay(); return; }
    case 'addq': {
      const g = id => document.getElementById(id).value.trim();
      const q = { cat: g('c-cat') || 'Entre nosotros', q: g('c-q'), a: g('c-a'), wrong: [g('c-w1'), g('c-w2'), g('c-w3')], exp: '' };
      if (!q.q || !q.a || q.wrong.some(w => !w)) { flash = 'Faltan campos: la pregunta, la correcta y las tres incorrectas.'; render(); return; }
      if (new Set([q.a, ...q.wrong].map(E.normalize)).size < 4) { flash = 'Las cuatro respuestas tienen que ser distintas.'; render(); return; }
      custom = custom.concat(q); store.save('pt-custom', custom); flash = 'Pregunta agregada.'; render(); return;
    }
    case 'delq': custom = custom.filter((_, i) => i !== +v); store.save('pt-custom', custom); render(); return;
    case 'copyq': {
      const text = JSON.stringify(custom);
      const io = document.getElementById('c-io'); io.value = text; io.select();
      navigator.clipboard?.writeText(text).then(() => { flash = 'Copiadas. Mándaselas a tu amigo.'; render(); }).catch(() => { /* el texto queda seleccionado */ });
      return;
    }
    case 'importq': {
      try {
        const list = JSON.parse(document.getElementById('c-io').value);
        const ok = (Array.isArray(list) ? list : []).filter(q => q && typeof q.q === 'string' && typeof q.a === 'string' && Array.isArray(q.wrong) && q.wrong.length >= 3)
          .map(q => ({ cat: String(q.cat || 'Entre nosotros').slice(0, 30), q: q.q.slice(0, 200), a: q.a.slice(0, 80), wrong: q.wrong.slice(0, 3).map(w => String(w).slice(0, 80)), exp: '' }));
        custom = custom.concat(ok); store.save('pt-custom', custom); flash = `${plural(ok.length, 'pregunta agregada', 'preguntas agregadas')}.`;
      } catch { flash = 'Ese texto no es una lista de preguntas válida.'; }
      render(); return;
    }
    default: return;
  }
  saveCfg();
  render();
});

document.addEventListener('keydown', e => {
  if (typers.length && (e.key === 'Enter' || e.key === ' ')) finishTyping();
  if (view === 'title' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); Sound.play('start'); goto('menu'); return; }
  if (e.key === 'Escape') {
    if (overlay === 'pause' || overlay === 'settings' || overlay === 'flag') { closeOverlay(); return; }
    if (overlay) { if (overlay === 'confirm-reset') closeOverlay(); else openOverlay('pause'); return; }
    if (view === 'game' && state?.phase !== 'end') { openOverlay('pause'); return; }
    if (view !== 'title' && view !== 'menu' && view !== 'game') { goto('menu'); return; }
  }
  if (overlay || view !== 'game' || !state) return;
  if (e.target.matches('input,textarea')) {
    // preventDefault: si no, el mismo Enter "pulsa" el botón Siguiente que aparece después.
    if (e.key === 'Enter' && e.target.id === 'typed') { e.preventDefault(); document.querySelector('[data-act=typed],[data-act=bomb-send],[data-act=pd-send],[data-act=r-answer]')?.click(); }
    return;
  }
  if (state.phase === 'question') {
    const k = { ArrowUp: '↑', ArrowDown: '↓', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', v: state.q?.kind === 'vf' ? '1' : null, f: state.q?.kind === 'vf' ? '2' : null }[e.key];
    if (k) { const btn = $app.querySelector(`.opt[data-k="${k}"]:not(:disabled)`); if (btn) { e.preventDefault(); btn.click(); } }
  }
});

// ---------- arranque ----------
async function start(saved = {}) {
  try {
    const get = f => fetch(f).then(r => r.json());
    const [d, b, w, h, dx, ro, xt] = await Promise.all([get('data/pokemon.json'), get('data/preguntas.json'), get('data/mundo.json'), get('data/historia.json'), get('data/pokedex.json'), get('data/rosco.json'), get('data/extra.json')]);
    raw = d; bank = b; world = w; historia = h; pokedex = dx; roscoHand = ro; extra = xt;
    rebuildCtx(!!saved.state?.config?.daily);
    if (saved.state) { state = saved.state; view = saved.view || 'game'; last.scores = state.scores.slice(); }
    else if (saved.view && saved.view !== 'game') view = saved.view;
    render();
  } catch (err) {
    $app.innerHTML = `<main><div class="box"><p>No se pudieron cargar los datos de la Pokédex. Recarga la página.</p><p class="hint">${esc(err.message)}</p></div></main>`;
  }
}
window.claude?.hot?.snapshot?.(() => ({ state, view }));
if (window.claude?.hot?.ready) window.claude.hot.ready(start); else start(window.claude?.hot?.data ?? {});
}
