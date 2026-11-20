// ============================================================
//  MOTOR DE LA TRIVIA POKÉMON
//  Este archivo es el "cerebro" del juego. No toca la pantalla
//  (no usa document ni window), así que el mismo archivo puede
//  correr mañana en un servidor para jugar en línea.
//
//  Idea central:
//    nuevoEstado = reduce(estado, accion, ctx)
//  - estado: JSON simple (se puede guardar o mandar por internet)
//  - accion: JSON simple, p. ej. {type:'ANSWER', player:0, value:2}
//  - ctx: los datos (Pokémon, tipos, preguntas), iguales para todos
//  Con la misma semilla y las mismas acciones, el resultado es
//  siempre idéntico. En línea, el servidor guardará el estado y
//  cada jugador solo enviará acciones.
// ============================================================
import { rng, normalize, leastUsed, typesLabel } from './util.js';
import { genPregunta, matchKey, matchKeyInfo, CATS, FORMATS as Q_FORMATS } from './preguntas.js';
import { buildRosco, roscoMatch, core, LETTERS } from './rosco.js';

export { normalize, typesLabel, CATS, matchKey, LETTERS };

// Todos los formatos que pueden salir en una partida mezclada.
export const FORMATS = {
  masomenos: 'Más o Menos', idioma: 'Pokeidioma', quien: '¿Quién es?', pokedex: 'Entrada de Pokédex', pokedle: 'Pokédle',
  ...Q_FORMATS,
};
const FORMAT_WEIGHTS = { preguntas: 20, vf: 10, orden: 7, pares: 7, multi: 7, escribir: 6, bomba: 3, intruso: 7, estimacion: 5, masomenos: 10, idioma: 7, quien: 6, pokedex: 5, pokedle: 3 };
// Rondas posibles en el modo "Por rondas".
export const ROUND_MODES = ['preguntas', 'vf', 'masomenos', 'idioma', 'quien', 'pokedex', 'intruso', 'orden', 'pares', 'multi', 'escribir', 'estimacion', 'bomba', 'pokedle'];
export { keyLabel } from './preguntas.js';

export const MODES = {
  preguntas: { name: 'Opción múltiple', blurb: 'Cuatro opciones y una sola correcta.' },
  vf: { name: 'Verdadero o falso', blurb: '¿Es cierto o no? Rapidito.' },
  masomenos: { name: 'Más o Menos', blurb: '¿El segundo Pokémon tiene más o menos que el primero?' },
  idioma: { name: 'Pokeidioma', blurb: 'Adivine el Pokémon por su nombre en japonés, alemán y francés.' },
  quien: { name: '¿Quién es?', blurb: 'Adivine el Pokémon con pistas: mientras menos necesite, más puntos.' },
  pokedex: { name: 'Entrada de Pokédex', blurb: 'Adivine el Pokémon por su descripción oficial.' },
  intruso: { name: 'El intruso', blurb: 'Tres tienen algo en común. ¿Cuál no pertenece?' },
  orden: { name: 'Ordenar', blurb: 'Ponga las cosas en el orden correcto.' },
  pares: { name: 'Emparejar', blurb: 'Una cada cosa con su pareja.' },
  multi: { name: 'Marcar todas', blurb: 'Puede haber más de una correcta: márquelas todas.' },
  escribir: { name: 'Escribir', blurb: 'Sin opciones: escriba la respuesta.' },
  estimacion: { name: 'Estimación', blurb: '¿Cuánto pesa? ¿Cuánto mide? Gana quien quede más cerca.' },
  bomba: { name: 'La bomba', blurb: 'Diga todos los que pueda antes de que se despiche.' },
  pokedle: { name: 'Pokédle', blurb: 'Adivine el Pokémon secreto con pistas de tipo, generación, altura y peso.' },
  mezcla: { name: 'Mezclada', blurb: 'Cada pregunta puede ser de cualquier formato.' },
};

// Formas de jugar. 'clasica' sirve para 1 a 4 jugadores; las otras dos son de un jugador.
export const GAME_TYPES = {
  clasica: { name: 'Clásica', blurb: 'Un número fijo de preguntas. Trate de superar su récord.' },
  supervivencia: { name: 'Supervivencia', blurb: 'Tres vidas y preguntas mezcladas. ¿Hasta dónde llega?' },
  contrarreloj: { name: 'Contrarreloj', blurb: 'Contra el reloj: responda bien todas las que pueda.' },
  rosco: { name: 'Juasrosco', blurb: 'Una pista por cada letra del abecedario.' },
};

export const STATS = [
  { key: 'hp', label: 'PS', get: p => p.stats[0] },
  { key: 'atk', label: 'Ataque', get: p => p.stats[1] },
  { key: 'def', label: 'Defensa', get: p => p.stats[2] },
  { key: 'spa', label: 'Ataque Especial', get: p => p.stats[3] },
  { key: 'spd', label: 'Defensa Especial', get: p => p.stats[4] },
  { key: 'spe', label: 'Velocidad', get: p => p.stats[5] },
  { key: 'total', label: 'Total de estadísticas base', get: p => p.stats.reduce((a, b) => a + b, 0) },
  { key: 'w', label: 'Peso', unit: 'kg', get: p => p.w / 10 },
  { key: 'h', label: 'Altura', unit: 'm', get: p => p.h / 10 },
];

const LANGS = [
  { key: 'ja', label: 'Japonés', sub: 'roma' },
  { key: 'de', label: 'Alemán' },
  { key: 'fr', label: 'Francés' },
];

export const DEFAULT_CONFIG = {
  type: 'clasica',       // 'clasica' | 'supervivencia' | 'contrarreloj' | 'rosco'
  structure: 'mezclada', // 'mezclada' o 'rondas' (solo en clásica)
  formats: Object.keys(FORMAT_WEIGHTS), // formatos que entran en la mezcla
  roscoTime: 150,        // segundos por jugador en el Juasrosco
  players: ['Rojo', 'Azul'],
  rounds: ['masomenos', 'idioma', 'preguntas'],
  perPlayer: 3,          // preguntas por jugador en cada ronda (en solitario: por ronda)
  gens: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  cats: Object.keys(CATS), // temas de Pokepreguntas
  idiomaMode: 'opciones', // 'opciones' o 'escribir'
  timer: 0,              // segundos por pregunta (0 = sin tiempo)
  lives: 3,              // supervivencia
  duration: 60,          // contrarreloj, en segundos
};

// Ajustes que se pueden cambiar a media partida (aplican desde ya).
export const LIVE_SETTINGS = ['timer', 'idiomaMode', 'gens', 'cats', 'formats'];
export const PD_SOLO = 6, PD_PER_PLAYER = 4;

// La bomba: segundos por turno en multijugador y tiempo total en solitario.
export const BOMB_TURN = 10, BOMB_SOLO = 30;

// Prepara los datos una sola vez (índices para buscar rápido).
export function buildContext(raw, bank, custom = [], world = null, historia = [], pokedex = {}, rosco = [], extra = null) {
  const byId = new Map(raw.pokemon.map(p => [p.id, p]));
  const typeName = new Map(raw.types.map(t => [t.id, t.name]));
  const nameIndex = new Map();
  for (const p of raw.pokemon) { nameIndex.set(normalize(p.name), p.id); if (!nameIndex.has(normalize(p.en))) nameIndex.set(normalize(p.en), p.id); }
  const evolvesTo = new Map();
  for (const p of raw.pokemon) if (p.from) evolvesTo.set(p.from, (evolvesTo.get(p.from) || []).concat(p));
  const genusCount = new Map();
  for (const p of raw.pokemon) if (p.genus) genusCount.set(p.genus, (genusCount.get(p.genus) || 0) + 1);
  const w = world || { juegos: [], dlc: [], regiones: [], lideres: [], jefes: [] };
  const aliasIndex = { tipos: new Map(), lideres: new Map(), regiones: new Map(), profes: new Map() };
  const labelIndex = { tipos: new Map(), lideres: new Map(), regiones: new Map(), profes: new Map() };
  for (const t of raw.types) { aliasIndex.tipos.set(normalize(t.name), String(t.id)); labelIndex.tipos.set(String(t.id), t.name); }
  for (const l of w.lideres) { for (const a of [l.name, ...l.alias]) aliasIndex.lideres.set(normalize(a), l.id); labelIndex.lideres.set(l.id, l.name); }
  for (const g of w.regiones) {
    aliasIndex.regiones.set(normalize(g.name), g.id); labelIndex.regiones.set(g.id, g.name);
    for (const a of g.profAlias) aliasIndex.profes.set(normalize(a), g.id);
    aliasIndex.profes.set(normalize(g.prof), g.id); labelIndex.profes.set(g.id, g.prof);
  }
  const ex = extra || { abilities: {}, monAbilities: {}, moves: [], evo: {} };
  const abHolders = new Map();
  for (const [sid, abs] of Object.entries(ex.monAbilities)) for (const [a] of abs) abHolders.set(a, (abHolders.get(a) || []).concat(+sid));
  const lists = {
    pokemon: raw.pokemon.map(p => p.name), tipos: raw.types.map(t => t.name), lideres: w.lideres.map(l => l.name),
    regiones: w.regiones.map(g => g.name), profes: w.regiones.flatMap(g => g.profAlias.length > 1 ? g.profAlias : [g.prof]),
  };
  return {
    pokemon: raw.pokemon, byId, types: raw.types.filter(t => t.id <= 18), typeName, efficacy: raw.efficacy,
    bank: bank.concat(custom.map(q => ({ ...q, grp: 'propias' }))), world: w, historia,
    nameIndex, evolvesTo, genusCount, aliasIndex, labelIndex, lists, pokedex, rosco,
    extra: ex, abHolders,
  };
}

function pool(ctx, state) {
  const gens = state.config.gens.length ? state.config.gens : [1];
  return ctx.pokemon.filter(p => gens.includes(p.gen));
}

// ---------- generadores de Más o Menos y Pokeidioma ----------

function genMasOMenos(ctx, state, r) {
  const all = pool(ctx, state);
  const list = leastUsed(all, state.used);
  for (let tries = 0; tries < 50; tries++) {
    const stat = r.pick(STATS);
    const a = r.pick(list);
    const va = stat.get(a);
    // El segundo tiene un valor parecido (±40 %) para que no sea obvio.
    let near = all.filter(p => p.id !== a.id && stat.get(p) !== va && Math.abs(stat.get(p) - va) <= Math.max(va * 0.4, 10));
    if (!near.length) near = all.filter(p => p.id !== a.id && stat.get(p) !== va);
    if (!near.length) continue;
    const b = r.pick(leastUsed(near, state.used));
    const vb = stat.get(b);
    return { kind: 'masomenos', stat: stat.key, label: stat.label, unit: stat.unit || '', a: a.id, va, b: b.id, vb, answer: vb > va ? 'mas' : 'menos', ids: [a.id, b.id] };
  }
  throw new Error('No se pudo generar Más o Menos');
}

function genIdioma(ctx, state, r) {
  const all = pool(ctx, state);
  const p = r.pick(leastUsed(all, state.used));
  const known = [normalize(p.name), normalize(p.en)];
  const clues = [];
  for (const L of LANGS) {
    const text = p[L.key];
    // Si el nombre es igual al de español, la pista lo regalaría: se salta.
    if (!text || (L.key !== 'ja' && known.includes(normalize(text)))) continue;
    clues.push({ lang: L.label, text, sub: L.sub ? p[L.sub] : '' });
  }
  if (clues.length < 3) clues.push({ lang: 'Pista', text: `Tipo ${typesLabel(ctx, p)}`, sub: `Generación ${p.gen}` });
  const others = r.shuffle(all.filter(x => x.id !== p.id && x.gen === p.gen)).slice(0, 3);
  while (others.length < 3) { const x = r.pick(ctx.pokemon); if (x.id !== p.id && !others.includes(x)) others.push(x); }
  const options = r.shuffle([p, ...others]).map(x => x.id);
  return { kind: 'idioma', clues, options, answer: p.id, ids: [p.id], types: p.types };
}

function fourOptions(ctx, r, all, p) {
  const others = r.shuffle(all.filter(x => x.id !== p.id && x.gen === p.gen)).slice(0, 3);
  while (others.length < 3) { const x = r.pick(ctx.pokemon); if (x.id !== p.id && !others.includes(x)) others.push(x); }
  return r.shuffle([p, ...others]).map(x => x.id);
}

function genQuien(ctx, state, r) {
  const all = pool(ctx, state);
  const p = r.pick(leastUsed(all.filter(x => ctx.pokedex[x.id]), state.used).concat([]) ) || r.pick(all);
  const clues = [
    { lang: 'Tipo', text: p.types.map(t => `{t:${t}}`).join(' ') },
    { lang: 'Generación', text: `Generación ${p.gen}`, sub: p.leg ? (p.leg === 1 ? 'Es legendario' : 'Es singular') : '' },
    { lang: 'Tamaño', text: `${(p.h / 10).toLocaleString('es')} m · ${(p.w / 10).toLocaleString('es')} kg` },
    { lang: 'Pokédex', text: ctx.pokedex[p.id] || (p.genus ? `Es el «${p.genus}».` : `Su número es el #${p.id}.`) },
  ];
  return { kind: 'quien', clues, options: fourOptions(ctx, r, all, p), answer: p.id, ids: [p.id], types: p.types };
}

function genPokedex(ctx, state, r) {
  const all = pool(ctx, state).filter(x => ctx.pokedex[x.id]);
  const list = all.length ? all : ctx.pokemon.filter(x => ctx.pokedex[x.id]);
  const p = r.pick(leastUsed(list, state.used));
  return { kind: 'pokedex', text: ctx.pokedex[p.id], options: fourOptions(ctx, r, list, p), answer: p.id, ids: [p.id], types: p.types };
}

function genPokedle(ctx, state, r) {
  const p = r.pick(leastUsed(pool(ctx, state), state.used));
  return { kind: 'pokedle', answer: p.id, ids: [p.id], types: p.types };
}

const SPECIAL = { masomenos: genMasOMenos, idioma: genIdioma, quien: genQuien, pokedex: genPokedex, pokedle: genPokedle };
function makeQuestion(ctx, state, r, fmt) {
  if (SPECIAL[fmt]) return SPECIAL[fmt](ctx, state, r);
  const P = pool(ctx, state);
  return genPregunta(ctx, state, r, P, leastUsed(P, state.used), fmt);
}
function pickFormat(state, r) {
  const banned = state.config.type === 'contrarreloj' ? ['bomba', 'pokedle'] : [];
  let fmts = (state.config.formats?.length ? state.config.formats : Object.keys(FORMAT_WEIGHTS)).filter(f => FORMAT_WEIGHTS[f] && !banned.includes(f));
  if (!fmts.length) fmts = ['preguntas'];
  const total = fmts.reduce((a, f) => a + FORMAT_WEIGHTS[f], 0);
  let k = r.next() * total;
  for (const f of fmts) { k -= FORMAT_WEIGHTS[f]; if (k <= 0) return f; }
  return fmts[fmts.length - 1];
}

// ---------- estado y acciones ----------

// Reto del día: 10 preguntas iguales en cualquier dispositivo para la misma fecha.
export const DAILY_FORMATS = Object.keys(FORMAT_WEIGHTS).filter(f => f !== 'bomba' && f !== 'pokedle');
export function dailySeed(date) { let h = 2166136261; for (const c of `juasmon:${date}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function dailyConfig(date, name) {
  return { type: 'clasica', structure: 'mezclada', daily: date, players: [name], perPlayer: 10, gens: [1, 2, 3, 4, 5, 6, 7, 8, 9], cats: Object.keys(CATS), formats: DAILY_FORMATS, idiomaMode: 'opciones', timer: 0 };
}

// history: lo que ya salió en partidas anteriores, para no repetir.
export function createGame(config = {}, seed = 1, history = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (cfg.type !== 'clasica' && cfg.type !== 'rosco') cfg.players = cfg.players.slice(0, 1);
  if (cfg.type === 'contrarreloj') { cfg.timer = 0; cfg.idiomaMode = 'opciones'; }
  return {
    v: 3, seed, rng: seed >>> 0, config: cfg,
    players: cfg.players.map((name, i) => ({ id: i, name })),
    scores: cfg.players.map(() => 0),
    lives: cfg.type === 'supervivencia' ? cfg.lives : null,
    streak: 0, bestStreak: 0, streaks: cfg.players.map(() => 0), bestStreaks: cfg.players.map(() => 0),
    phase: 'intro', ri: 0, qi: 0, q: null, hints: 0, result: null,
    log: [], used: (history.mons || []).slice(-800), usedBank: (history.bank || []).slice(-600),
  };
}

export const isClassic = state => state.config.type === 'clasica';
export const isMixed = state => state.config.type === 'supervivencia' || state.config.type === 'contrarreloj' || state.config.structure !== 'rondas';

function allInDue(s) {
  return !!s.config.allIn && s.config.type === 'clasica' && isMixed(s) && s.players.length === 1 && !s.config.daily && s.qi === questionsPerRound(s) - 1;
}
export function currentPlayer(state) {
  return state.qi % state.players.length;
}

export function questionsPerRound(state) {
  return isClassic(state) ? state.config.perPlayer * state.players.length : Infinity;
}

// Las rondas que se juegan: una sola "mezcla" o las elegidas.
export const roundList = state => isMixed(state) ? ['mezcla'] : state.config.rounds;

function nextQuestion(state, ctx) {
  const r = rng(state.rng);
  const mode = roundList(state)[state.ri];
  const fmt = mode === 'mezcla' ? pickFormat(state, r) : mode;
  let q = { ...makeQuestion(ctx, state, r, fmt), mode };
  const cur = currentPlayer(state), n = state.players.length;
  if (q.kind === 'bomba') q = { ...q, bomb: { start: cur, turn: cur, given: [], counts: state.players.map(() => 0), last: null, seq: 0 } };
  if (q.kind === 'estimacion' && n > 1) q = { ...q, est: { guesses: state.players.map(() => null), answered: [], turn: cur } };
  if (q.kind === 'pokedle') q = { ...q, pd: { guesses: [], turn: cur, max: n > 1 ? n * PD_PER_PLAYER : PD_SOLO, last: null, seq: 0 } };
  return {
    ...state, rng: r.state, phase: 'question', q, hints: 0, result: null,
    used: state.used.concat(q.ids || []),
    usedBank: q.bankId ? state.usedBank.filter(id => id !== q.bankId).concat(q.bankId) : state.usedBank,
  };
}

// Puntos de cada formato. 1 si todo está bien, 0,5 si casi.
function grade(state, ctx, value) {
  const q = state.q;
  if (value === null || value === undefined) return { points: 0, timeout: true };
  const classic = isClassic(state);
  switch (q.kind) {
    case 'idioma': case 'quien': case 'pokedex': {
      const m = typeof value === 'number' ? null : matchKeyInfo(ctx, 'pokemon', value);
      const ok = typeof value === 'number' ? value === q.answer : m?.key === String(q.answer);
      return { points: !ok ? 0 : classic && q.kind !== 'pokedex' ? Math.max(1, 3 - state.hints) : 1, typo: ok && !!m?.typo };
    }
    case 'estimacion': {
      const v = Number(value);
      if (!Number.isFinite(v)) return { points: 0 };
      const err = estError(q, v);
      return { points: err <= q.tol[0] ? 1 : err <= q.tol[1] ? 0.5 : 0, err };
    }
    case 'orden': {
      if (!Array.isArray(value) || value.length !== q.answer.length) return { points: 0 };
      if (value.every((v, i) => v === q.answer[i])) return { points: 1 };
      // Cuántos pares quedaron en el orden correcto.
      const pos = new Map(value.map((v, i) => [v, i]));
      let ok = 0, total = 0;
      for (let i = 0; i < q.answer.length; i++) for (let j = i + 1; j < q.answer.length; j++) { total++; if (pos.get(q.answer[i]) < pos.get(q.answer[j])) ok++; }
      return { points: ok / total >= 2 / 3 ? 0.5 : 0 };
    }
    case 'pares': {
      if (!Array.isArray(value)) return { points: 0 };
      const ok = q.answer.filter((a, i) => value[i] === a).length;
      return { points: ok === q.answer.length ? 1 : ok >= q.answer.length / 2 ? 0.5 : 0 };
    }
    case 'multi': {
      if (!Array.isArray(value)) return { points: 0 };
      const sel = new Set(value), right = new Set(q.answer);
      const okCount = q.options.filter((_, i) => sel.has(i) === right.has(i)).length;
      if (okCount === q.options.length) return { points: 1 };
      return { points: okCount / q.options.length >= 0.75 && value.some(v => right.has(v)) ? 0.5 : 0 };
    }
    case 'escribir': {
      const m = matchKeyInfo(ctx, q.list, value), key = m?.key ?? null;
      const ok = !!key && q.valid.includes(key);
      return { points: ok ? 1 : 0, key, typo: ok && m.typo };
    }
    default:
      return { points: value === q.answer ? 1 : 0 };
  }
}

export const estError = (q, v) => q.rel ? Math.abs(v - q.truth) / q.truth : Math.abs(v - q.truth);

export function pdFeedback(g, a) {
  const t = i => { const gt = g.types[i] ?? null, at = a.types[i] ?? null; if (gt === at) return 'ok'; if (gt !== null && a.types.includes(gt)) return 'near'; return 'no'; };
  const cmp = (x, y) => x === y ? 'ok' : y > x ? 'up' : 'down';
  return { t1: t(0), t2: t(1), gen: cmp(g.gen, a.gen), h: cmp(g.h, a.h), w: cmp(g.w, a.w) };
}

function settle(state, res, extraLog = []) {
  const p = currentPlayer(state);
  const scores = state.scores.slice();
  const bet = state.bets?.[p] ?? null;
  if (bet !== null) {
    const delta = res.points >= 1 ? bet : res.points > 0 ? 0 : -bet;
    res = { ...res, bet: { amount: bet, delta } };
    scores[p] += delta;
  } else scores[p] += res.points;
  for (const e of extraLog) scores[e.player] += e.points;
  const correct = res.points >= 1, partial = res.points > 0 && res.points < 1;
  const lives = state.lives === null ? null : state.lives - (res.points === 0 ? 1 : 0);
  const streak = correct ? state.streak + 1 : partial ? state.streak : 0;
  const streaks = (state.streaks || state.players.map(() => 0)).slice();
  streaks[p] = correct ? streaks[p] + 1 : partial ? streaks[p] : 0;
  const bestStreaks = (state.bestStreaks || state.players.map(() => 0)).slice();
  bestStreaks[p] = Math.max(bestStreaks[p], streaks[p]);
  return {
    ...state, phase: 'reveal', result: { ...res, correct, partial, streak: streaks[p] }, scores, lives, streak, streaks, bestStreaks, bestStreak: Math.max(state.bestStreak, streak),
    log: state.log.concat({
      round: state.ri, player: p, mode: state.q.mode, kind: state.q.kind, correct, points: res.points,
      // Datos para las medallas.
      typo: !!res.typo, id: state.q.ids?.[0] ?? null, hints: state.hints,
      tries: res.pd?.tries ?? null, n: state.q.kind === 'bomba' ? (state.q.bomb?.counts?.[p] ?? 0) : null,
      near: res.err != null && (state.q.rel ? res.err <= 0.02 : res.err === 0),
    }, extraLog),
  };
}

export function reduce(state, action, ctx) {
  switch (action.type) {
    case 'START':
      if (state.phase !== 'intro') return state;
      if (state.config.type === 'rosco') return startRosco(state, ctx);
      return nextQuestion(state, ctx);

    case 'ROSCO_READY': case 'ROSCO_ANSWER': case 'ROSCO_PASS': case 'ROSCO_TIME':
      return roscoAction(state, action, ctx);

    case 'HINT': {
      if (state.phase !== 'question' || !['idioma', 'quien'].includes(state.q.kind)) return state;
      if (action.player !== currentPlayer(state)) return state;
      return { ...state, hints: Math.min(state.hints + 1, state.q.clues.length - 1) };
    }

    case 'ANSWER': {
      const k = state.q?.kind;
      if (state.phase !== 'question' || k === 'bomba' || k === 'pokedle' || (k === 'estimacion' && state.q.est) || action.player !== currentPlayer(state)) return state;
      return settle(state, { ...grade(state, ctx, action.value), given: action.value ?? null });
    }

    // Estimación en multijugador: todos responden la misma pregunta, uno tras otro.
    case 'EST_ANSWER': {
      const q = state.q;
      if (state.phase !== 'question' || q?.kind !== 'estimacion' || !q.est || action.player !== q.est.turn) return state;
      const v = Number(action.value);
      const guesses = q.est.guesses.slice(); guesses[action.player] = Number.isFinite(v) ? v : null;
      const answered = q.est.answered.concat(action.player), n = state.players.length;
      if (answered.length < n) return { ...state, q: { ...q, est: { guesses, answered, turn: (q.est.turn + 1) % n } } };
      const dist = guesses.map(g => g === null ? Infinity : estError(q, g));
      const best = Math.min(...dist);
      const pts = dist.map(d => Number.isFinite(d) && d === best ? 1 : 0);
      const cur = currentPlayer(state);
      const extra = state.players.map((_, i) => i).filter(i => i !== cur).map(i => ({ round: state.ri, player: i, mode: q.mode, kind: 'estimacion', correct: pts[i] > 0, points: pts[i], extra: true }));
      return settle({ ...state, q: { ...q, est: { guesses, answered, turn: null } } }, { points: pts[cur], est: { guesses, points: pts, dist } }, extra);
    }

    // Pokédle: un intento de adivinar el Pokémon secreto.
    case 'PD_GUESS': case 'SKIP': {
      const q = state.q;
      if (state.phase !== 'question' || q?.kind !== 'pokedle' || action.player !== q.pd.turn) return state;
      const n = state.players.length, pd = q.pd;
      let id = null;
      if (action.type === 'PD_GUESS') {
        const key = matchKey(ctx, 'pokemon', action.value);
        if (!key) return { ...state, q: { ...q, pd: { ...pd, last: { ok: false, why: 'novale', text: String(action.value).slice(0, 40) }, seq: pd.seq + 1 } } };
        id = +key;
        if (pd.guesses.some(g => g.id === id)) return { ...state, q: { ...q, pd: { ...pd, last: { ok: false, why: 'repetido', text: String(action.value).slice(0, 40) }, seq: pd.seq + 1 } } };
      }
      const a = ctx.byId.get(q.answer);
      const guess = { p: action.player, id, fb: id ? pdFeedback(ctx.byId.get(id), a) : null };
      const guesses = pd.guesses.concat(guess);
      const nq = { ...q, pd: { ...pd, guesses, last: null, seq: pd.seq + 1, turn: n > 1 ? (pd.turn + 1) % n : pd.turn } };
      const cur = currentPlayer(state);
      const won = id === q.answer;
      if (won || guesses.length >= pd.max) {
        const tries = guesses.filter(g => g.p === action.player).length;
        const pts = state.players.map((_, i) => !won || i !== action.player ? 0 : n > 1 ? 1 : tries <= 3 ? 1 : 0.5);
        const extra = state.players.map((_, i) => i).filter(i => i !== cur).map(i => ({ round: state.ri, player: i, mode: q.mode, kind: 'pokedle', correct: pts[i] > 0, points: pts[i], extra: true }));
        return settle({ ...state, q: nq }, { points: pts[cur], pd: { winner: won ? action.player : null, points: pts, tries } }, extra);
      }
      return { ...state, q: nq };
    }

    // La bomba: un intento de respuesta del jugador de turno.
    case 'BOMB_ANSWER': {
      const q = state.q;
      if (state.phase !== 'question' || q?.kind !== 'bomba' || action.player !== q.bomb.turn) return state;
      const m = matchKeyInfo(ctx, q.list, action.value), key = m?.key ?? null;
      const b = q.bomb;
      let last;
      if (!key || !q.valid.includes(key)) last = { ok: false, why: 'novale', text: String(action.value).slice(0, 40) };
      else if (b.given.some(g => g.key === key)) last = { ok: false, why: 'repetido', text: String(action.value).slice(0, 40) };
      if (last) return { ...state, q: { ...q, bomb: { ...b, last, seq: b.seq + 1 } } };
      const counts = b.counts.slice(); counts[action.player]++;
      const n = state.players.length;
      return { ...state, q: { ...q, bomb: { ...b, given: b.given.concat({ p: action.player, key }), counts, turn: n > 1 ? (b.turn + 1) % n : b.turn, last: { ok: true, key, typo: m.typo }, seq: b.seq + 1 } } };
    }

    // La bomba explota: se acabó el tiempo del turno (o el tiempo total en solitario).
    case 'BOMB_END': {
      const q = state.q;
      if (state.phase !== 'question' || q?.kind !== 'bomba') return state;
      const b = q.bomb, cur = currentPlayer(state);
      const pts = b.counts.map(c => {
        if (state.config.type === 'supervivencia') return c >= 3 ? 1 : 0;
        return Math.min(3, Math.floor(c / 3));
      });
      const extra = state.players.map((_, i) => i).filter(i => i !== cur)
        .map(i => ({ round: state.ri, player: i, mode: q.mode, kind: 'bomba', correct: pts[i] > 0, points: pts[i], extra: true }));
      return settle(state, { points: pts[cur], bomb: { points: pts, loser: state.players.length > 1 ? b.turn : null } }, extra);
    }

    case 'NEXT': {
      if (state.phase === 'roundEnd') return nextQuestion({ ...state, ri: state.ri + 1, qi: 0 }, ctx);
      if (state.config.type === 'rosco') return state;
      if (state.phase !== 'reveal') return state;
      if (!isClassic(state)) {
        if (state.lives !== null && state.lives <= 0) return { ...state, phase: 'end', q: null };
        return nextQuestion({ ...state, qi: state.qi + 1 }, ctx);
      }
      const qi = state.qi + 1;
      if (qi < questionsPerRound(state)) {
        const ns = nextQuestion({ ...state, qi }, ctx);
        // Todo o nada: antes de la última pregunta se apuesta viendo solo el tema.
        return allInDue(ns) ? { ...ns, phase: 'bet', bets: ns.players.map(() => null) } : ns;
      }
      if (state.ri + 1 < roundList(state).length) return { ...state, phase: 'roundEnd', q: null };
      return { ...state, phase: 'end', q: null };
    }

    // Todo o nada: la apuesta de cada jugador (de 0 a todos sus puntos).
    case 'BET': {
      if (state.phase !== 'bet') return state;
      const p = action.player;
      if (p < 0 || p >= state.players.length || state.bets[p] !== null) return state;
      const bets = state.bets.slice();
      bets[p] = Math.max(0, Math.min(Math.floor(state.scores[p]), Math.floor(Number(action.amount) || 0)));
      return { ...state, bets, phase: bets.every(b => b !== null) ? 'question' : 'bet' };
    }

    // Contrarreloj: se acabó el tiempo total.
    case 'TIME_UP':
      if (state.config.type !== 'contrarreloj' || state.phase === 'end') return state;
      return { ...state, phase: 'end', q: null };

    // Cambiar ajustes a media partida. Solo los de LIVE_SETTINGS.
    case 'SET_CONFIG': {
      if (state.config.daily) return state;
      const patch = {};
      for (const k of LIVE_SETTINGS) if (k in action.patch) patch[k] = action.patch[k];
      if (patch.gens && !patch.gens.length) delete patch.gens;
      if (patch.cats && !patch.cats.length) delete patch.cats;
      if (state.config.type === 'contrarreloj') { delete patch.timer; delete patch.idiomaMode; }
      return { ...state, config: { ...state.config, ...patch } };
    }

    case 'REMATCH':
      return createGame(state.config, (state.rng ^ 0x9E3779B9) >>> 0, { mons: state.used, bank: state.usedBank });

    default:
      return state;
  }
}

// Lo que cada jugador puede ver. En línea, el servidor mandará esto
// en vez del estado completo, para que nadie vea la respuesta antes.
export function publicView(state) {
  if (state.phase !== 'question' || !state.q) return state;
  const q = { ...state.q };
  delete q.answer; delete q.valid; delete q.show;
  if (q.kind === 'masomenos') delete q.vb;
  if (q.kind === 'idioma' || q.kind === 'quien') { q.totalClues = q.clues.length; q.clues = q.clues.slice(0, state.hints + 1); }
  if (q.kind === 'estimacion') delete q.truth;
  if (q.kind === 'intruso') delete q.criterion;
  return { ...state, q };
}

// En el rosco nadie ve las respuestas de las letras que faltan.
export function publicRosco(state) {
  if (state.phase !== 'rosco') return state.rosco;
  const R = state.rosco;
  return { ...R, boards: R.boards.map((b, p) => b.map((e, i) => R.status[p][i] === 'p' ? { L: e.L, mode: e.mode, clue: e.clue } : e)) };
}

// ---------- Juasrosco ----------
function startRosco(state, ctx) {
  const r = rng(state.rng), avoid = new Set(), n = state.players.length;
  const boards = state.players.map(() => { const b = buildRosco(ctx, r, state.config.gens, avoid); b.forEach(e => avoid.add(core(e.answer))); return b; });
  return {
    ...state, rng: r.state, phase: 'rosco',
    rosco: { boards, status: boards.map(b => b.map(() => 'p')), pos: boards.map(() => 0), time: boards.map(() => state.config.roscoTime * 1000), done: boards.map(() => false), errors: boards.map(() => 0), turn: 0, ready: n === 1, last: null, seq: 0 },
  };
}
function nextPending(st, from) {
  for (let k = 1; k <= st.length; k++) { const i = (from + k) % st.length; if (st[i] === 'p') return i; }
  return -1;
}
function roscoAction(state, action, ctx) {
  if (state.phase !== 'rosco') return state;
  const R = state.rosco, p = action.player;
  if (p !== R.turn) return state;
  const n = state.players.length;
  const clone = { ...R, status: R.status.map(s => s.slice()), pos: R.pos.slice(), time: R.time.slice(), done: R.done.slice(), errors: R.errors.slice(), seq: R.seq + 1 };
  if (action.type === 'ROSCO_READY') return { ...state, rosco: { ...clone, ready: true } };
  if (!R.ready) return state;
  if (action.type !== 'ROSCO_TIME') clone.time[p] = Math.max(0, clone.time[p] - Math.max(0, Number(action.elapsed) || 0));
  let switchTurn = false;
  if (action.type === 'ROSCO_TIME') { clone.time[p] = 0; clone.done[p] = true; switchTurn = true; clone.last = { player: p, timeout: true }; }
  else {
    const i = clone.pos[p], entry = R.boards[p][i];
    if (action.type === 'ROSCO_ANSWER') {
      const how = roscoMatch(entry, action.value), ok = !!how;
      if (how === 'typo') { clone.typos = (R.typos || R.errors.map(() => 0)).slice(); clone.typos[p]++; }
      clone.status[p][i] = ok ? 'ok' : 'bad';
      if (!ok) clone.errors[p]++;
      clone.last = { player: p, idx: i, ok, typo: how === 'typo', answer: entry.answer, given: String(action.value).slice(0, 40) };
      if (!ok && n > 1) switchTurn = true;
    } else { clone.last = { player: p, idx: i, pass: true }; if (n > 1) switchTurn = true; }
    const nx = nextPending(clone.status[p], i);
    if (nx < 0 || clone.time[p] <= 0) { clone.done[p] = true; switchTurn = true; } else clone.pos[p] = nx;
  }
  const scores = clone.status.map(s => s.filter(x => x === 'ok').length);
  if (switchTurn) {
    let next = -1;
    for (let k = 1; k <= n; k++) { const j = (p + k) % n; if (!clone.done[j]) { next = j; break; } }
    if (next < 0) return { ...state, scores, rosco: { ...clone, ready: false }, phase: 'end' };
    if (next !== p) { clone.turn = next; clone.ready = false; }
  }
  return { ...state, scores, rosco: clone };
}

export function winners(state) {
  const best = Math.max(...state.scores);
  let w = state.players.filter((_, i) => state.scores[i] === best);
  // En el rosco, si empatan en aciertos, gana quien tenga menos errores.
  if (state.rosco && w.length > 1) { const minErr = Math.min(...w.map(p => state.rosco.errors[p.id])); w = w.filter(p => state.rosco.errors[p.id] === minErr); }
  return w;
}
