// ============================================================
//  POKEPREGUNTAS: todos los formatos y temas
//  Cada "creador" arma una pregunta de un formato (opción múltiple,
//  verdadero o falso, ordenar, emparejar, marcar todas, escribir o
//  la bomba) sobre un tema (Pokémon, regiones, personajes…).
//  Sin pantalla: corre igual en el navegador o en un servidor.
// ============================================================
import { leastUsed, typeMultiplier, typesLabel, tok, typesTok, fmtMult, normalize, typoOk, TYPO_MIN } from './util.js';

export const CATS = {
  pokemon: 'Pokémon', regiones: 'Regiones', personajes: 'Personajes', juegos: 'Juegos',
  historia: 'Historia', mecanicas: 'Mecánicas', competitivo: 'Competitivo',
};

export const FORMATS = {
  preguntas: 'Opción múltiple', vf: 'Verdadero o falso', orden: 'Ordenar', pares: 'Emparejar',
  multi: 'Marcar todas', escribir: 'Escribir', bomba: 'La bomba', intruso: 'El intruso', estimacion: 'Estimación',
};

const WEIGHTS = { preguntas: 30, vf: 15, orden: 11, pares: 11, multi: 11, escribir: 8, bomba: 4, intruso: 10, estimacion: 6 };
const STARTERS = { 1: [1, 4, 7], 2: [152, 155, 158], 3: [252, 255, 258], 4: [387, 390, 393], 5: [495, 498, 501], 6: [650, 653, 656], 7: [722, 725, 728], 8: [810, 813, 816], 9: [906, 909, 912] };

// ---------- moldes de cada formato ----------
const mcQ = (r, cat, q, a, wrong, exp = '', x = {}) => {
  const options = r.shuffle([a, ...wrong]);
  return { kind: 'preguntas', cat, q, options, answer: options.indexOf(a), exp, ...x };
};
const vfQ = (cat, q, answer, exp = '', x = {}) => ({ kind: 'vf', cat, q, answer, exp, ...x });
const ordenQ = (r, cat, q, inOrder, exp = '', x = {}) => {
  const idx = r.shuffle(inOrder.map((_, i) => i));
  return { kind: 'orden', cat, q, items: idx.map(i => inOrder[i]), answer: inOrder.map((_, i) => idx.indexOf(i)), exp, ...x };
};
const paresQ = (r, cat, q, pairs, exp = '', x = {}) => {
  const perm = r.shuffle(pairs.map((_, i) => i));
  return { kind: 'pares', cat, q, left: pairs.map(p => p[0]), right: perm.map(i => pairs[i][1]), answer: pairs.map((_, i) => perm.indexOf(i)), exp, ...x };
};
const multiQ = (r, cat, q, right, wrong, exp = '', x = {}) => {
  const options = r.shuffle([...right, ...wrong]);
  return { kind: 'multi', cat, q, options, answer: right.map(o => options.indexOf(o)).sort((a, b) => a - b), exp, ...x };
};
const escribirQ = (cat, q, valid, show, list, exp = '', x = {}) => ({ kind: 'escribir', cat, q, valid, show, list, exp, ...x });
const bombaQ = (cat, q, valid, list, x = {}) => ({ kind: 'bomba', cat, q, valid, list, ...x });
const intrusoQ = (r, cat, odd, same, criterion, exp, x = {}) => ({ ...mcQ(r, cat, '¿Cuál es el intruso?', odd, same, `${criterion} ${exp}`.trim(), x), kind: 'intruso', criterion });
// Estimación: scale 'log' o 'lin'; tol = [error para 1 punto, error para medio punto]; rel = error relativo, si no, absoluto.
const estQ = (cat, q, truth, o, x = {}) => ({ kind: 'estimacion', cat, q, truth, unit: o.unit || '', min: o.min, max: o.max, step: o.step || 1, scale: o.scale || 'lin', rel: o.rel !== false, tol: o.tol || [0.1, 0.25], exp: o.exp || '', ...x });

const distinctBy = (arr, key, n) => { const seen = new Set(), out = []; for (const x of arr) { const k = key(x); if (!seen.has(k)) { seen.add(k); out.push(x); if (out.length === n) break; } } return out.length === n ? out : null; };
const tn = (ctx, id) => ctx.typeName.get(id);
const statsNoUnit = [['PS', p => p.stats[0]], ['Ataque', p => p.stats[1]], ['Defensa', p => p.stats[2]], ['Ataque Especial', p => p.stats[3]], ['Defensa Especial', p => p.stats[4]], ['Velocidad', p => p.stats[5]], ['total de estadísticas', p => p.stats.reduce((a, b) => a + b, 0)]];

// Reconoce lo que escribe el jugador y lo convierte en una clave.
// Perdona un error de tipeo en palabras de 5 letras o más, si solo hay una opción cercana.
// Devuelve { key, typo } (typo = true si hubo que corregir) o null.
export function matchKeyInfo(ctx, list, text) {
  const n = normalize(text);
  if (!n) return null;
  const index = list === 'pokemon' ? ctx.nameIndex : ctx.aliasIndex[list];
  if (!index) return null;
  let hit = index.get(n), typo = false;
  if (hit === undefined && n.length >= TYPO_MIN - 1) {
    const near = [...new Set([...index].filter(([k]) => typoOk(k, n)).map(([, v]) => v))];
    if (near.length === 1) { hit = near[0]; typo = true; }
  }
  if (hit === undefined) return null;
  return { key: list === 'pokemon' ? String(hit) : hit, typo };
}
export function matchKey(ctx, list, text) { return matchKeyInfo(ctx, list, text)?.key ?? null; }
export function keyLabel(ctx, list, key) {
  if (list === 'pokemon') return ctx.byId.get(+key)?.name ?? key;
  return ctx.labelIndex[list]?.get(key) ?? key;
}

// ---------- creadores ----------
// Cada uno recibe (ctx, state, r, P, L): P = Pokémon de las generaciones elegidas,
// L = los menos usados de P. Devuelve una pregunta o null si no puede.
const M = [];
const add = (grp, fmt, fn, w = 1) => M.push({ grp, fmt, fn, w });

// --- Pokémon: opción múltiple ---
add('pokemon', 'preguntas', (ctx, s, r, P, L) => {
  const p = r.pick(L), right = typesLabel(ctx, p);
  const wrong = [...new Set(r.shuffle(ctx.pokemon).map(x => typesLabel(ctx, x)))].filter(t => t !== right).slice(0, 3);
  return mcQ(r, 'Datos', `¿De qué tipo es ${p.name}?`, right, wrong, `${p.name} (#${p.id}) es tipo ${typesTok(p.types)}.`, { ids: [p.id], types: p.types });
});
add('pokemon', 'preguntas', (ctx, s, r, P, L) => {
  const p = r.pick(L);
  const wrong = r.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9].filter(g => g !== p.gen)).slice(0, 3).map(g => `Generación ${g}`);
  return mcQ(r, 'Datos', `¿En qué generación debutó ${p.name}?`, `Generación ${p.gen}`, wrong, `${p.name} es el #${p.id} de la Pokédex Nacional.`, { ids: [p.id], types: p.types });
});
add('pokemon', 'preguntas', (ctx, s, r, P, L) => {
  const p = r.pick(L.filter(x => x.from)); if (!p) return null;
  const pre = ctx.byId.get(p.from);
  const wrong = r.shuffle(ctx.pokemon.filter(x => x.id !== pre.id && x.id !== p.id && Math.abs(x.gen - p.gen) <= 1)).slice(0, 3).map(x => x.name);
  return mcQ(r, 'Evoluciones', `¿De qué Pokémon evoluciona ${p.name}?`, pre.name, wrong, `${pre.name} evoluciona en ${p.name}.`, { ids: [p.id], types: p.types });
});
add('pokemon', 'preguntas', (ctx, s, r, P, L) => {
  const p = r.pick(L.filter(x => x.genus && ctx.genusCount.get(x.genus) === 1)); if (!p) return null;
  const wrong = r.shuffle(P.filter(x => x.id !== p.id && x.gen === p.gen)).slice(0, 3).map(x => x.name);
  if (wrong.length < 3) return null;
  return mcQ(r, 'Pokédex', `¿Qué Pokémon es conocido como el «${p.genus}»?`, p.name, wrong, 'Así lo describe la Pokédex.', { ids: [p.id], types: p.types });
});
add('pokemon', 'preguntas', (ctx, s, r, P, L) => {
  const p = r.pick(L), t = r.pick(p.types);
  const wrong = r.shuffle(P.filter(x => !x.types.includes(t))).slice(0, 3);
  if (wrong.length < 3) return null;
  return mcQ(r, 'Datos', `¿Cuál de estos Pokémon es de tipo ${tok(t)}?`, p.name, wrong.map(x => x.name), wrong.map(x => `${x.name}: ${typesTok(x.types)}`).join(' · '), { ids: [p.id], types: p.types });
});
add('pokemon', 'preguntas', (ctx, s, r, P, L) => {
  const [label, get] = r.pick(statsNoUnit.slice(0, 6));
  const four = distinctBy(r.shuffle(L), get, 4); if (!four) return null;
  const vals = four.map(get), win = four[vals.indexOf(Math.max(...vals))];
  return mcQ(r, 'Estadísticas', `¿Cuál de estos tiene más ${label.toLowerCase()} base?`, win.name, four.filter(x => x !== win).map(x => x.name), four.map((x, i) => `${x.name}: ${vals[i]}`).join(' · '), { ids: four.map(x => x.id) });
});
// --- Pokémon: verdadero o falso ---
add('pokemon', 'vf', (ctx, s, r, P, L) => {
  const p = r.pick(L), truth = r.next() < 0.5;
  const t = truth ? r.pick(p.types) : r.pick(ctx.types.filter(x => !p.types.includes(x.id))).id;
  return vfQ('Datos', `${p.name} es de tipo ${tok(t)}.`, truth, `${p.name} es tipo ${typesTok(p.types)}.`, { ids: [p.id], types: p.types });
});
add('pokemon', 'vf', (ctx, s, r, P, L) => {
  const p = r.pick(L), truth = r.next() < 0.5;
  const g = truth ? p.gen : r.pick([1, 2, 3, 4, 5, 6, 7, 8, 9].filter(x => x !== p.gen));
  return vfQ('Datos', `${p.name} debutó en la generación ${g}.`, truth, `${p.name} es de la generación ${p.gen} (#${p.id}).`, { ids: [p.id], types: p.types });
});
add('pokemon', 'vf', (ctx, s, r, P, L) => {
  const p = r.pick(L.filter(x => x.from)); if (!p) return null;
  const pre = ctx.byId.get(p.from), truth = r.next() < 0.5;
  const other = truth ? pre : r.pick(P.filter(x => x.id !== pre.id && x.id !== p.id && x.gen === p.gen) .concat([])) || pre;
  return vfQ('Evoluciones', `${p.name} evoluciona de ${other.name}.`, other.id === pre.id, `${p.name} evoluciona de ${pre.name}.`, { ids: [p.id], types: p.types });
});
add('pokemon', 'vf', (ctx, s, r, P, L) => {
  // Una sola categoría por pregunta: «es legendario» o «es singular», nunca las dos juntas.
  const claim = r.next() < 0.6 ? 1 : 2, word = claim === 1 ? 'legendario' : 'singular';
  const yes = ctx.pokemon.filter(x => x.leg === claim && P.includes(x)), no = ctx.pokemon.filter(x => x.leg !== claim && (x.leg || P.includes(x)));
  const p = r.next() < 0.5 && yes.length ? r.pick(yes) : r.pick(no.filter(x => x.leg) .length && r.next() < 0.5 ? no.filter(x => x.leg) : no);
  const what = p.leg === 1 ? 'es legendario' : p.leg === 2 ? 'es singular' : 'no es legendario ni singular';
  return vfQ('Datos', `${p.name} es un Pokémon ${word}.`, p.leg === claim, `${p.name} ${what}.`, { ids: [p.id], types: p.types });
});
add('pokemon', 'vf', (ctx, s, r, P, L) => {
  const two = distinctBy(r.shuffle(L), x => x.w, 2); if (!two) return null;
  const [a, b] = two;
  return vfQ('Estadísticas', `${a.name} pesa más que ${b.name}.`, a.w > b.w, `${a.name}: ${(a.w / 10).toLocaleString('es')} kg · ${b.name}: ${(b.w / 10).toLocaleString('es')} kg.`, { ids: [a.id, b.id] });
});
// --- Pokémon: ordenar ---
add('pokemon', 'orden', (ctx, s, r, P, L) => {
  const p = r.pick(L.filter(x => x.from && ctx.byId.get(x.from).from)); if (!p) return null;
  const mid = ctx.byId.get(p.from), base = ctx.byId.get(mid.from);
  return ordenQ(r, 'Evoluciones', 'Ordena esta línea evolutiva, de la primera etapa a la última.', [{ text: base.name }, { text: mid.name }, { text: p.name }], '', { ids: [p.id] });
});
add('pokemon', 'orden', (ctx, s, r, P, L) => {
  const [label, get] = r.pick(statsNoUnit);
  const four = distinctBy(r.shuffle(L), get, 4); if (!four) return null;
  four.sort((a, b) => get(a) - get(b));
  return ordenQ(r, 'Estadísticas', `Ordena de menor a mayor ${label.toLowerCase()} base.`, four.map(x => ({ text: x.name, note: String(get(x)) })), '', { ids: four.map(x => x.id) });
});
add('pokemon', 'orden', (ctx, s, r, P, L) => {
  const four = distinctBy(r.shuffle(L), x => x.w, 4); if (!four) return null;
  four.sort((a, b) => a.w - b.w);
  return ordenQ(r, 'Estadísticas', 'Ordena del más liviano al más pesado.', four.map(x => ({ text: x.name, note: `${(x.w / 10).toLocaleString('es')} kg` })), '', { ids: four.map(x => x.id) });
});
add('pokemon', 'orden', (ctx, s, r, P, L) => {
  const four = distinctBy(r.shuffle(ctx.pokemon), x => x.gen, 4); if (!four) return null;
  four.sort((a, b) => a.gen - b.gen);
  return ordenQ(r, 'Datos', 'Ordena por generación, de la más antigua a la más nueva.', four.map(x => ({ text: x.name, note: `Gen ${x.gen}` })), '', { ids: four.map(x => x.id) });
});
// --- Pokémon: emparejar ---
add('pokemon', 'pares', (ctx, s, r, P, L) => {
  const four = distinctBy(r.shuffle(L.filter(x => x.types.length === 1)), x => x.types[0], 4); if (!four) return null;
  return paresQ(r, 'Datos', 'Une cada Pokémon con su tipo.', four.map(x => [x.name, tn(ctx, x.types[0])]), '', { ids: four.map(x => x.id) });
});
add('pokemon', 'pares', (ctx, s, r, P, L) => {
  const four = distinctBy(r.shuffle(ctx.pokemon), x => x.gen, 4); if (!four) return null;
  return paresQ(r, 'Datos', 'Une cada Pokémon con la generación en la que debutó.', four.map(x => [x.name, `Generación ${x.gen}`]), '', { ids: four.map(x => x.id) });
});
add('pokemon', 'pares', (ctx, s, r, P, L) => {
  const four = distinctBy(r.shuffle(L.filter(x => x.from)), x => x.from, 4); if (!four) return null;
  return paresQ(r, 'Evoluciones', 'Une cada Pokémon con el Pokémon del que evoluciona.', four.map(x => [x.name, ctx.byId.get(x.from).name]), '', { ids: four.map(x => x.id) });
});
// --- Pokémon: marcar todas ---
const pickMulti = (r, yes, no) => {
  const k = 2 + Math.floor(r.next() * 2);
  const right = r.shuffle(yes).slice(0, k), wrong = r.shuffle(no).slice(0, 6 - k);
  return right.length === k && wrong.length === 6 - k ? [right, wrong] : null;
};
add('pokemon', 'multi', (ctx, s, r, P, L) => {
  const t = r.pick(ctx.types).id, sets = pickMulti(r, P.filter(x => x.types.includes(t)), P.filter(x => !x.types.includes(t))); if (!sets) return null;
  return multiQ(r, 'Datos', `¿Cuáles de estos Pokémon son de tipo ${tok(t)}?`, sets[0].map(x => x.name), sets[1].map(x => x.name), [...sets[0], ...sets[1]].map(x => `${x.name}: ${typesTok(x.types)}`).join(' · '), { ids: sets[0].map(x => x.id) });
});
add('pokemon', 'multi', (ctx, s, r, P, L) => {
  const g = r.pick([...new Set(P.map(x => x.gen))]), sets = pickMulti(r, ctx.pokemon.filter(x => x.gen === g), ctx.pokemon.filter(x => x.gen !== g)); if (!sets) return null;
  return multiQ(r, 'Datos', `¿Cuáles de estos Pokémon debutaron en la generación ${g}?`, sets[0].map(x => x.name), sets[1].map(x => x.name), [...sets[0], ...sets[1]].map(x => `${x.name}: Gen ${x.gen}`).join(' · '), { ids: sets[0].map(x => x.id) });
});
add('pokemon', 'multi', (ctx, s, r, P, L) => {
  const sets = pickMulti(r, ctx.pokemon.filter(x => x.leg && P.includes(x)), L.filter(x => !x.leg)); if (!sets) return null;
  return multiQ(r, 'Datos', '¿Cuáles de estos son legendarios o singulares?', sets[0].map(x => x.name), sets[1].map(x => x.name), '', { ids: sets[0].map(x => x.id) });
});
// --- Pokémon: escribir ---
add('pokemon', 'escribir', (ctx, s, r, P, L) => {
  const p = r.pick(L.filter(x => x.types.length === 2)); if (!p) return null;
  const key = [...p.types].sort().join('-');
  const valid = ctx.pokemon.filter(x => [...x.types].sort().join('-') === key);
  const show = valid.filter(x => P.includes(x)).concat(valid).slice(0, 6);
  return escribirQ('Datos', `Escribe un Pokémon de tipo ${tok(p.types[0])} / ${tok(p.types[1])}.`, valid.map(x => String(x.id)), [...new Set(show.map(x => x.name))], 'pokemon', '', { ids: [p.id], types: p.types });
});
add('pokemon', 'escribir', (ctx, s, r, P, L) => {
  const p = r.pick(L.filter(x => ctx.evolvesTo.get(x.id)?.length)); if (!p) return null;
  const next = ctx.evolvesTo.get(p.id);
  return escribirQ('Evoluciones', `¿En qué evoluciona ${p.name}?`, next.map(x => String(x.id)), next.map(x => x.name), 'pokemon', '', { ids: [p.id], types: p.types });
});
add('pokemon', 'escribir', (ctx, s, r, P, L) => {
  const p = r.pick(L.filter(x => x.from)); if (!p) return null;
  const pre = ctx.byId.get(p.from);
  return escribirQ('Evoluciones', `¿De qué Pokémon evoluciona ${p.name}?`, [String(pre.id)], [pre.name], 'pokemon', '', { ids: [p.id], types: p.types });
});
// --- Pokémon: la bomba ---
add('pokemon', 'bomba', (ctx, s, r, P) => {
  const t = r.pick(ctx.types.filter(x => P.filter(p => p.types.includes(x.id)).length >= 12)); if (!t) return null;
  return bombaQ('La bomba', `Pokémon de tipo ${tok(t.id)}`, ctx.pokemon.filter(p => p.types.includes(t.id)).map(p => String(p.id)), 'pokemon', { types: [t.id] });
});
add('pokemon', 'bomba', (ctx, s, r, P) => {
  const g = r.pick([...new Set(P.map(x => x.gen))]);
  return bombaQ('La bomba', `Pokémon de la generación ${g}`, ctx.pokemon.filter(p => p.gen === g).map(p => String(p.id)), 'pokemon');
});
add('pokemon', 'bomba', (ctx) => bombaQ('La bomba', 'Pokémon legendarios o singulares', ctx.pokemon.filter(p => p.leg).map(p => String(p.id)), 'pokemon'));
add('pokemon', 'bomba', (ctx, s, r) => {
  const letters = 'abcdefghiklmnoprstvz'.split('').filter(l => ctx.pokemon.filter(p => normalize(p.name)[0] === l).length >= 20);
  const l = r.pick(letters);
  return bombaQ('La bomba', `Pokémon que empiezan con la letra ${l.toUpperCase()}`, ctx.pokemon.filter(p => normalize(p.name)[0] === l).map(p => String(p.id)), 'pokemon');
});

// --- Mecánicas (tabla de tipos) ---
add('mecanicas', 'preguntas', (ctx, s, r, P, L) => {
  const p = r.pick(L), atk = r.pick(ctx.types), m = typeMultiplier(ctx, atk.id, p.types);
  const wrong = r.shuffle([0, 0.25, 0.5, 1, 2, 4].filter(x => x !== m)).slice(0, 3).map(fmtMult);
  return mcQ(r, 'Tabla de tipos', `Un ataque de tipo ${tok(atk.id)} contra ${p.name} (${typesTok(p.types)}), ¿cuánto daño hace?`, fmtMult(m), wrong, `${tok(atk.id)} contra ${typesTok(p.types)} = ${fmtMult(m)}.`, { ids: [p.id], types: p.types });
}, 2);
add('mecanicas', 'vf', (ctx, s, r) => {
  const a = r.pick(ctx.types).id, d = r.pick(ctx.types).id, m = typeMultiplier(ctx, a, [d]);
  const claims = [['súper eficaz', m > 1], ['poco eficaz', m > 0 && m < 1], ['inútil (no le afecta)', m === 0]];
  const [claim, truth] = r.next() < 0.5 ? claims.find(c => c[1]) || claims[0] : r.pick(claims);
  return vfQ('Tabla de tipos', `Un ataque de tipo ${tok(a)} es ${claim} contra el tipo ${tok(d)}.`, truth, `${tok(a)} contra ${tok(d)} = ${fmtMult(m)}.`, { types: [a] });
}, 2);
add('mecanicas', 'multi', (ctx, s, r, P, L) => {
  for (let i = 0; i < 20; i++) {
    const p = r.pick(L);
    const yes = ctx.types.filter(t => typeMultiplier(ctx, t.id, p.types) > 1), no = ctx.types.filter(t => typeMultiplier(ctx, t.id, p.types) <= 1);
    if (!yes.length || yes.length > 4) continue;
    const wrong = r.shuffle(no).slice(0, 6 - yes.length);
    return multiQ(r, 'Tabla de tipos', `¿Qué tipos de ataque son súper eficaces contra ${p.name} (${typesTok(p.types)})?`, yes.map(t => t.name), wrong.map(t => t.name), yes.map(t => `${tok(t.id)} ${fmtMult(typeMultiplier(ctx, t.id, p.types))}`).join(' · '), { ids: [p.id], types: p.types });
  }
  return null;
}, 2);
add('mecanicas', 'escribir', (ctx, s, r, P, L) => {
  const p = r.pick(L), yes = ctx.types.filter(t => typeMultiplier(ctx, t.id, p.types) > 1);
  if (!yes.length) return null;
  return escribirQ('Tabla de tipos', `Escribe un tipo de ataque que sea súper eficaz contra ${p.name} (${typesTok(p.types)}).`, yes.map(t => String(t.id)), yes.map(t => t.name), 'tipos', '', { ids: [p.id], types: p.types });
});

// --- Juegos ---
const games = ctx => ctx.world.juegos;
const gk = (pre, x) => `w:${pre}:${x.id}`;
const pickW = (r, s, list, pre) => { const x = r.pick(leastUsed(list, s.usedBank, y => gk(pre, y))); return [x, gk(pre, x)]; };
const fullName = g => g.name.startsWith('Leyendas') ? g.name : `Pokémon ${g.name}`;
add('juegos', 'preguntas', (ctx, s, r) => {
  const [g, key] = pickW(r, s, games(ctx), 'gy');
  const wrong = r.shuffle([...new Set(games(ctx).map(x => x.year))].filter(y => y !== g.year && Math.abs(y - g.year) <= 6)).slice(0, 3).map(String);
  if (wrong.length < 3) return null;
  return mcQ(r, 'Juegos', `¿En qué año salió ${fullName(g)} en Japón?`, String(g.year), wrong, `${fullName(g)} salió en ${g.year} para ${g.platform}.`, { bankId: key });
});
add('juegos', 'preguntas', (ctx, s, r) => {
  const [g, key] = pickW(r, s, games(ctx), 'gp');
  const wrong = r.shuffle([...new Set(games(ctx).map(x => x.platform))].filter(p => p !== g.platform)).slice(0, 3);
  return mcQ(r, 'Juegos', `¿Para qué consola salió ${fullName(g)}?`, g.platform, wrong, `Salió en ${g.year}.`, { bankId: key });
});
add('juegos', 'preguntas', (ctx, s, r) => {
  const [g, key] = pickW(r, s, games(ctx), 'gr');
  const wrong = r.shuffle(ctx.world.regiones.map(x => x.name).filter(n => n !== g.region)).slice(0, 3);
  return mcQ(r, 'Juegos', `¿En qué región transcurre ${fullName(g)}?`, g.region, wrong, g.id === 'za' ? 'Transcurre en Ciudad Luminalia.' : '', { bankId: key });
});
add('juegos', 'preguntas', (ctx, s, r) => {
  const [d, key] = pickW(r, s, ctx.world.dlc, 'dl');
  const base = games(ctx).find(g => g.id === d.base);
  const wrong = r.shuffle(games(ctx).filter(g => g.id !== base.id && g.gen >= 6)).slice(0, 3).map(fullName);
  return mcQ(r, 'Juegos', `¿De qué juego es expansión «${d.name}»?`, fullName(base), wrong, d.year ? `Salió en ${d.year}.` : '', { bankId: key });
});
add('juegos', 'vf', (ctx, s, r) => {
  const [g, key] = pickW(r, s, games(ctx), 'vp'), truth = r.next() < 0.5;
  const plat = truth ? g.platform : r.pick([...new Set(games(ctx).map(x => x.platform))].filter(p => p !== g.platform));
  return vfQ('Juegos', `${fullName(g)} salió para ${plat}.`, truth, `Salió para ${g.platform} en ${g.year}.`, { bankId: key });
});
add('juegos', 'vf', (ctx, s, r) => {
  const [g, key] = pickW(r, s, games(ctx), 'vr'), truth = r.next() < 0.5;
  const reg = truth ? g.region : r.pick(ctx.world.regiones.map(x => x.name).filter(n => n !== g.region));
  return vfQ('Juegos', `${fullName(g)} transcurre en ${reg}.`, truth, `Transcurre en ${g.region}.`, { bankId: key });
});
add('juegos', 'orden', (ctx, s, r) => {
  const four = distinctBy(r.shuffle(games(ctx)), x => x.year, 4); if (!four) return null;
  four.sort((a, b) => a.year - b.year);
  return ordenQ(r, 'Juegos', 'Ordena estos juegos del más antiguo al más nuevo.', four.map(g => ({ text: fullName(g), note: String(g.year) })));
}, 2);
add('juegos', 'pares', (ctx, s, r) => {
  const four = distinctBy(r.shuffle(games(ctx)), x => x.region, 4); if (!four) return null;
  return paresQ(r, 'Juegos', 'Une cada juego con su región.', four.map(g => [fullName(g), g.region]));
});
add('juegos', 'pares', (ctx, s, r) => {
  const four = distinctBy(r.shuffle(games(ctx)), x => x.platform, 4); if (!four) return null;
  return paresQ(r, 'Juegos', 'Une cada juego con su consola.', four.map(g => [fullName(g), g.platform]));
});
add('juegos', 'multi', (ctx, s, r) => {
  const plat = r.pick(['Game Boy Advance', 'Nintendo DS', 'Nintendo 3DS', 'Nintendo Switch']);
  const sets = pickMulti(r, games(ctx).filter(g => g.platform === plat), games(ctx).filter(g => g.platform !== plat)); if (!sets) return null;
  return multiQ(r, 'Juegos', `¿Cuáles de estos juegos salieron para ${plat}?`, sets[0].map(fullName), sets[1].map(fullName), sets[1].map(g => `${g.name}: ${g.platform}`).join(' · '));
});
add('juegos', 'escribir', (ctx, s, r) => {
  const [g, key] = pickW(r, s, games(ctx), 'er');
  const reg = ctx.world.regiones.find(x => x.name === g.region);
  return escribirQ('Juegos', `¿En qué región transcurre ${fullName(g)}?`, [reg.id], [reg.name], 'regiones', '', { bankId: key });
});

// --- Regiones ---
const regs = ctx => ctx.world.regiones;
add('regiones', 'preguntas', (ctx, s, r) => {
  const [g, key] = pickW(r, s, regs(ctx), 'ri');
  const wrong = r.shuffle(regs(ctx).filter(x => x.insp !== g.insp)).slice(0, 3).map(x => x.insp);
  return mcQ(r, 'Regiones', `¿En qué lugar real se inspira la región de ${g.name}?`, g.insp, wrong, '', { bankId: key });
});
add('regiones', 'preguntas', (ctx, s, r) => {
  const [g, key] = pickW(r, s, regs(ctx), 'rp');
  const wrong = r.shuffle(regs(ctx).filter(x => x.id !== g.id)).slice(0, 3).map(x => x.prof);
  return mcQ(r, 'Regiones', `¿Quién es el profesor o la profesora Pokémon de ${g.name}?`, g.prof, wrong, g.id === 'paldea' ? 'Albora en Escarlata y Turo en Púrpura.' : '', { bankId: key });
});
add('regiones', 'preguntas', (ctx, s, r) => {
  const [g, key] = pickW(r, s, regs(ctx).filter(x => x.villain), 'rv');
  const wrong = r.shuffle([...new Set(regs(ctx).map(x => x.villain).filter(v => v && v !== g.villain))]).slice(0, 3);
  return mcQ(r, 'Regiones', `¿Qué equipo villano aparece en ${g.name}?`, g.villain, wrong, '', { bankId: key });
});
add('regiones', 'vf', (ctx, s, r) => {
  const [g, key] = pickW(r, s, regs(ctx), 'vi'), truth = r.next() < 0.5;
  const other = truth ? g : r.pick(regs(ctx).filter(x => x.insp !== g.insp));
  return vfQ('Regiones', `La región de ${g.name} está inspirada en ${other.insp}.`, truth, `${g.name} se inspira en ${g.insp}.`, { bankId: key });
});
add('regiones', 'vf', (ctx, s, r) => {
  const [g, key] = pickW(r, s, regs(ctx), 'vq'), truth = r.next() < 0.5;
  const other = truth ? g : r.pick(regs(ctx).filter(x => x.id !== g.id));
  return vfQ('Regiones', `${other.prof} es el profesor o la profesora de ${g.name}.`, truth, `En ${g.name} es ${g.prof}.`, { bankId: key });
});
add('regiones', 'orden', (ctx, s, r) => {
  const four = r.shuffle(regs(ctx).filter(x => x.id !== 'hisui')).slice(0, 4).sort((a, b) => a.gen - b.gen);
  return ordenQ(r, 'Regiones', 'Ordena estas regiones por la generación en que debutaron.', four.map(x => ({ text: x.name, note: `Gen ${x.gen}` })));
}, 2);
add('regiones', 'pares', (ctx, s, r) => paresQ(r, 'Regiones', 'Une cada región con su profesor o profesora.', r.shuffle(regs(ctx)).slice(0, 4).map(x => [x.name, x.prof])), 2);
add('regiones', 'pares', (ctx, s, r) => {
  const four = distinctBy(r.shuffle(regs(ctx)), x => x.insp, 4); if (!four) return null;
  return paresQ(r, 'Regiones', 'Une cada región con el lugar real en que se inspira.', four.map(x => [x.name, x.insp]));
}, 2);
add('regiones', 'escribir', (ctx, s, r) => {
  const [g, key] = pickW(r, s, regs(ctx), 'ep');
  return escribirQ('Regiones', `¿Cómo se llama el profesor o la profesora Pokémon de ${g.name}?`, [g.id], [g.prof], 'profes', '', { bankId: key });
}, 2);

// --- Personajes ---
const lids = ctx => ctx.world.lideres;
const regName = (ctx, id) => ctx.world.regiones.find(x => x.id === id).name;
add('personajes', 'preguntas', (ctx, s, r) => {
  const [l, key] = pickW(r, s, lids(ctx), 'lt');
  const wrong = r.shuffle(ctx.types.filter(t => t.id !== l.type)).slice(0, 3).map(t => t.name);
  return mcQ(r, 'Líderes de gimnasio', `¿De qué tipo es el gimnasio de ${l.name}?`, tn(ctx, l.type), wrong, `${l.name} es líder en ${l.city} (${regName(ctx, l.region)}). ${l.note}`.trim(), { bankId: key, types: [l.type] });
}, 2);
add('personajes', 'preguntas', (ctx, s, r) => {
  const [l, key] = pickW(r, s, lids(ctx), 'lc');
  const wrong = r.shuffle(lids(ctx).filter(x => x.city !== l.city)).slice(0, 3).map(x => x.name);
  return mcQ(r, 'Líderes de gimnasio', `¿Quién es líder de gimnasio en ${l.city}?`, l.name, wrong, `${l.name}, tipo ${tok(l.type)}. ${l.note}`.trim(), { bankId: key, types: [l.type] });
});
add('personajes', 'preguntas', (ctx, s, r) => {
  const [l, key] = pickW(r, s, lids(ctx), 'lr');
  const wrong = r.shuffle(ctx.world.regiones.filter(x => x.id !== l.region && !['alola', 'hisui'].includes(x.id))).slice(0, 3).map(x => x.name);
  return mcQ(r, 'Líderes de gimnasio', `¿De qué región es líder de gimnasio ${l.name}?`, regName(ctx, l.region), wrong, `Está en ${l.city}.`, { bankId: key });
});
add('personajes', 'preguntas', (ctx, s, r) => {
  const [g, key] = pickW(r, s, regs(ctx).filter(x => x.champion), 'ch');
  const wrong = r.shuffle(regs(ctx).filter(x => x.champion && x.id !== g.id)).slice(0, 3).map(x => x.champion);
  return mcQ(r, 'Campeones', `¿Quién es el campeón o la campeona de ${g.name}?`, g.champion, wrong, { hoenn: 'Máximo en Rubí y Zafiro; Plubio en Esmeralda.', teselia: 'Mirto en Negro y Blanco; Iris en Negro 2 y Blanco 2.', paldea: 'Ságita es la campeona principal de la Liga de Paldea.' }[g.id] || '', { bankId: key });
});
add('personajes', 'preguntas', (ctx, s, r) => {
  const [b, key] = pickW(r, s, ctx.world.jefes, 'jb');
  const wrong = r.shuffle(ctx.world.jefes.filter(x => x.team !== b.team)).slice(0, 3).map(x => x.team);
  return mcQ(r, 'Villanos', `¿Qué equipo dirige ${b.name}?`, b.team, wrong, '', { bankId: key });
});
add('personajes', 'vf', (ctx, s, r) => {
  const [l, key] = pickW(r, s, lids(ctx), 'vt'), truth = r.next() < 0.5;
  const t = truth ? l.type : r.pick(ctx.types.filter(x => x.id !== l.type)).id;
  return vfQ('Líderes de gimnasio', `${l.name} es líder de gimnasio de tipo ${tok(t)}.`, truth, `${l.name} usa el tipo ${tok(l.type)} en ${l.city}.`, { bankId: key, types: [l.type] });
}, 2);
add('personajes', 'vf', (ctx, s, r) => {
  const [b, key] = pickW(r, s, ctx.world.jefes, 'vj'), truth = r.next() < 0.5;
  const team = truth ? b.team : r.pick(ctx.world.jefes.filter(x => x.team !== b.team)).team;
  return vfQ('Villanos', `${b.name} es el jefe del ${team}.`, truth, `${b.name} dirige el ${b.team}.`, { bankId: key });
});
add('personajes', 'orden', (ctx, s, r) => {
  const reg = r.pick(['hoenn', 'sinnoh', 'teselia', 'kalos', 'galar']);
  const four = r.shuffle(lids(ctx).filter(l => l.region === reg && l.order)).slice(0, 4).sort((a, b) => a.order - b.order);
  if (four.length < 4) return null;
  return ordenQ(r, 'Líderes de gimnasio', `Ordena estos líderes de ${regName(ctx, reg)} en el orden en que te enfrentas a ellos.`, four.map(l => ({ text: l.name, note: `Gimnasio ${l.order}` })), reg === 'sinnoh' ? 'Orden de Diamante y Perla.' : '');
}, 2);
add('personajes', 'pares', (ctx, s, r) => {
  const four = distinctBy(r.shuffle(lids(ctx)), x => x.type, 4); if (!four) return null;
  return paresQ(r, 'Líderes de gimnasio', 'Une cada líder de gimnasio con su tipo.', four.map(l => [l.name, tn(ctx, l.type)]));
}, 2);
add('personajes', 'pares', (ctx, s, r) => paresQ(r, 'Campeones', 'Une cada campeón o campeona con su región.', r.shuffle(regs(ctx).filter(x => x.champion)).slice(0, 4).map(x => [x.champion, x.name])));
add('personajes', 'pares', (ctx, s, r) => paresQ(r, 'Villanos', 'Une cada jefe con su equipo.', r.shuffle(ctx.world.jefes).slice(0, 4).map(b => [b.name, b.team])));
add('personajes', 'multi', (ctx, s, r) => {
  const reg = r.pick(['kanto', 'johto', 'hoenn', 'sinnoh', 'teselia', 'kalos', 'galar', 'paldea']);
  const sets = pickMulti(r, lids(ctx).filter(l => l.region === reg), lids(ctx).filter(l => l.region !== reg)); if (!sets) return null;
  return multiQ(r, 'Líderes de gimnasio', `¿Cuáles de estos son líderes de gimnasio de ${regName(ctx, reg)}?`, sets[0].map(l => l.name), sets[1].map(l => l.name), sets[1].map(l => `${l.name}: ${regName(ctx, l.region)}`).join(' · '));
}, 2);
add('personajes', 'escribir', (ctx, s, r) => {
  const [l, key] = pickW(r, s, lids(ctx), 'el');
  const valid = lids(ctx).filter(x => x.region === l.region && x.type === l.type);
  return escribirQ('Líderes de gimnasio', `¿Quién es líder de gimnasio de tipo ${tok(l.type)} en ${regName(ctx, l.region)}?`, valid.map(x => x.id), valid.map(x => x.name), 'lideres', valid.map(x => x.note).filter(Boolean).join(' '), { bankId: key, types: [l.type] });
}, 2);
add('personajes', 'bomba', (ctx) => bombaQ('La bomba', 'Líderes de gimnasio (de cualquier región)', lids(ctx).map(l => l.id), 'lideres'));

// --- Historia (preguntas escritas a mano en varios formatos) ---
add('historia', 'preguntas', (ctx, s, r) => { const h = r.pick(leastUsed(ctx.historia.filter(x => x.fmt === 'mc'), s.usedBank)); return mcQ(r, 'Historia', h.q, h.a, h.wrong, h.exp, { bankId: h.id }); }, 3);
add('historia', 'vf', (ctx, s, r) => { const h = r.pick(leastUsed(ctx.historia.filter(x => x.fmt === 'vf'), s.usedBank)); return vfQ('Historia', h.q, h.a, h.exp, { bankId: h.id }); }, 3);
add('historia', 'orden', (ctx, s, r) => { const h = r.pick(leastUsed(ctx.historia.filter(x => x.fmt === 'orden'), s.usedBank)); return ordenQ(r, 'Historia', h.q, h.items.map(t => ({ text: t })), h.exp, { bankId: h.id }); }, 3);
add('historia', 'multi', (ctx, s, r) => { const h = r.pick(leastUsed(ctx.historia.filter(x => x.fmt === 'multi'), s.usedBank)); return multiQ(r, 'Historia', h.q, h.right, h.wrong, h.exp, { bankId: h.id }); }, 3);

// --- Banco de preguntas escritas a mano (opción múltiple) de cada tema ---
for (const grp of Object.keys(CATS)) {
  add(grp, 'preguntas', (ctx, s, r) => {
    const list = ctx.bank.filter(q => q.grp === grp); if (!list.length) return null;
    const q = r.pick(leastUsed(list, s.usedBank));
    return mcQ(r, q.cat, q.q, q.a, q.wrong.slice(0, 3), q.exp || '', { bankId: q.id });
  }, 3);
}
// Preguntas propias: siempre entran, sin importar las categorías elegidas.
add('propias', 'preguntas', (ctx, s, r) => {
  const list = ctx.bank.filter(q => q.grp === 'propias'); if (!list.length) return null;
  const q = r.pick(leastUsed(list, s.usedBank));
  return mcQ(r, q.cat, q.q, q.a, q.wrong.slice(0, 3), '', { bankId: q.id });
}, 3);

// --- Habilidades (datos de PokéAPI; en los juegos actuales) ---
const abName = (ctx, id) => ctx.extra.abilities[id];
const monAbs = (ctx, p) => (ctx.extra.monAbilities[p.id] || []);
const abList = (ctx, p) => monAbs(ctx, p).map(([a, h]) => `${abName(ctx, a)}${h ? ' (oculta)' : ''}`).join(', ');
add('pokemon', 'preguntas', (ctx, s, r, P, L) => {
  const p = r.pick(L.filter(x => monAbs(ctx, x).length)); if (!p) return null;
  const mine = new Set(monAbs(ctx, p).map(x => +x[0])), a = r.pick([...mine]);
  const wrong = r.shuffle(Object.keys(ctx.extra.abilities).map(Number).filter(x => !mine.has(x))).slice(0, 3).map(x => abName(ctx, x));
  return mcQ(r, 'Habilidades', `¿Cuál de estas habilidades puede tener ${p.name} en los juegos actuales?`, abName(ctx, a), wrong, `${p.name} puede tener: ${abList(ctx, p)}.`, { ids: [p.id], types: p.types });
}, 2);
add('pokemon', 'preguntas', (ctx, s, r, P) => {
  const ab = r.pick([...ctx.abHolders].filter(([, l]) => l.length >= 1 && l.length <= 10 && l.some(id => P.some(x => x.id === id)))); if (!ab) return null;
  const [aid, holders] = ab, inPool = holders.filter(id => P.some(x => x.id === id)), p = ctx.byId.get(r.pick(inPool));
  const wrong = r.shuffle(P.filter(x => !holders.includes(x.id) && Math.abs(x.gen - p.gen) <= 1)).slice(0, 3).map(x => x.name);
  if (wrong.length < 3) return null;
  return mcQ(r, 'Habilidades', `¿Qué Pokémon puede tener la habilidad ${abName(ctx, aid)}?`, p.name, wrong, `${abName(ctx, aid)}: ${holders.slice(0, 8).map(id => ctx.byId.get(id).name).join(', ')}${holders.length > 8 ? '…' : ''}.`, { ids: [p.id], types: p.types });
}, 2);
add('pokemon', 'vf', (ctx, s, r, P, L) => {
  const p = r.pick(L.filter(x => monAbs(ctx, x).length)); if (!p) return null;
  const mine = new Set(monAbs(ctx, p).map(x => +x[0])), truth = r.next() < 0.5;
  const a = truth ? r.pick([...mine]) : r.pick(Object.keys(ctx.extra.abilities).map(Number).filter(x => !mine.has(x)));
  return vfQ('Habilidades', `${p.name} puede tener la habilidad ${abName(ctx, a)}.`, truth, `${p.name} puede tener: ${abList(ctx, p)}.`, { ids: [p.id], types: p.types });
}, 2);
add('pokemon', 'escribir', (ctx, s, r) => {
  const ab = r.pick([...ctx.abHolders].filter(([, l]) => l.length >= 3 && l.length <= 40)); if (!ab) return null;
  const [aid, holders] = ab;
  return escribirQ('Habilidades', `Escribe un Pokémon que pueda tener la habilidad ${abName(ctx, aid)}.`, holders.map(String), holders.map(id => ctx.byId.get(id).name), 'pokemon');
});
add('pokemon', 'multi', (ctx, s, r, P) => {
  const ab = r.pick([...ctx.abHolders].filter(([, l]) => l.filter(id => P.some(x => x.id === id)).length >= 3)); if (!ab) return null;
  const [aid, holders] = ab;
  const sets = pickMulti(r, P.filter(x => holders.includes(x.id)), P.filter(x => !holders.includes(x.id))); if (!sets) return null;
  return multiQ(r, 'Habilidades', `¿Cuáles de estos Pokémon pueden tener la habilidad ${abName(ctx, aid)}?`, sets[0].map(x => x.name), sets[1].map(x => x.name), '', { ids: sets[0].map(x => x.id) });
});

// --- Formas de evolucionar ---
const evoOf = (ctx, p) => ctx.extra.evo[p.id];
add('pokemon', 'preguntas', (ctx, s, r, P, L) => {
  const p = r.pick(L.filter(x => x.from && evoOf(ctx, x))); if (!p) return null;
  const pre = ctx.byId.get(p.from), right = evoOf(ctx, p).text;
  const texts = [...new Set(Object.values(ctx.extra.evo).map(e => e.text))].filter(t => t !== right);
  const lv = evoOf(ctx, p).level;
  const near = lv ? [lv - 4, lv + 4, lv + 9].filter(x => x > 1 && x <= 100).map(x => `Al subir al nivel ${x}`) : [];
  const wrong = [...new Set([...r.shuffle(near).slice(0, 1), ...r.shuffle(texts)])].filter(t => t !== right).slice(0, 3);
  return mcQ(r, 'Evoluciones', `¿Cómo evoluciona ${pre.name} en ${p.name}?`, right, wrong, `${pre.name} → ${p.name}: ${right.toLowerCase()}.`, { ids: [p.id], types: p.types });
}, 3);
add('pokemon', 'vf', (ctx, s, r, P, L) => {
  const p = r.pick(L.filter(x => x.from && evoOf(ctx, x))); if (!p) return null;
  const pre = ctx.byId.get(p.from), right = evoOf(ctx, p).text, truth = r.next() < 0.5;
  const claim = truth ? right : r.pick([...new Set(Object.values(ctx.extra.evo).map(e => e.text))].filter(t => t !== right));
  return vfQ('Evoluciones', `${pre.name} evoluciona en ${p.name} ${claim.charAt(0).toLowerCase() + claim.slice(1)}.`, truth, `${pre.name} → ${p.name}: ${right.toLowerCase()}.`, { ids: [p.id], types: p.types });
}, 2);
add('pokemon', 'estimacion', (ctx, s, r, P, L) => {
  const p = r.pick(L.filter(x => x.from && evoOf(ctx, x)?.level)); if (!p) return null;
  const pre = ctx.byId.get(p.from), lv = evoOf(ctx, p).level;
  return estQ('Evoluciones', `¿A qué nivel evoluciona ${pre.name} en ${p.name}?`, lv, { min: 1, max: 100, rel: false, tol: [0, 3], exp: `${pre.name} evoluciona en ${p.name} al nivel ${lv}.` }, { ids: [p.id], types: p.types });
}, 2);

// --- Movimientos ---
const mvs = ctx => ctx.extra.moves;
const CLS = { 1: 'de estado', 2: 'físico', 3: 'especial' };
add('mecanicas', 'preguntas', (ctx, s, r) => {
  const [m, key] = pickW(r, s, mvs(ctx), 'mt');
  const wrong = r.shuffle(ctx.types.filter(t => t.id !== m.type)).slice(0, 3).map(t => t.name);
  return mcQ(r, 'Movimientos', `¿De qué tipo es el movimiento ${m.name}?`, tn(ctx, m.type), wrong, `${m.name}: ${tok(m.type)}, ${CLS[m.cls]}${m.power ? `, potencia ${m.power}` : ''}.`, { bankId: key, types: [m.type] });
}, 3);
add('mecanicas', 'vf', (ctx, s, r) => {
  const [m, key] = pickW(r, s, mvs(ctx), 'mc'), truth = r.next() < 0.5;
  const c = truth ? m.cls : r.pick([1, 2, 3].filter(x => x !== m.cls));
  return vfQ('Movimientos', `${m.name} es un movimiento ${CLS[c]}.`, truth, `${m.name} es ${CLS[m.cls]} y de tipo ${tok(m.type)}.`, { bankId: key, types: [m.type] });
}, 2);
add('mecanicas', 'vf', (ctx, s, r) => {
  const [m, key] = pickW(r, s, mvs(ctx), 'mv'), truth = r.next() < 0.5;
  const t = truth ? m.type : r.pick(ctx.types.filter(x => x.id !== m.type)).id;
  return vfQ('Movimientos', `${m.name} es un movimiento de tipo ${tok(t)}.`, truth, `${m.name} es de tipo ${tok(m.type)}.`, { bankId: key, types: [m.type] });
}, 2);
add('mecanicas', 'orden', (ctx, s, r) => {
  const four = distinctBy(r.shuffle(mvs(ctx).filter(m => m.power > 1)), m => m.power, 4); if (!four) return null;
  four.sort((a, b) => a.power - b.power);
  return ordenQ(r, 'Movimientos', 'Ordena estos movimientos de menor a mayor potencia.', four.map(m => ({ text: m.name, note: String(m.power) })));
}, 2);
add('mecanicas', 'pares', (ctx, s, r) => {
  const four = distinctBy(r.shuffle(mvs(ctx)), m => m.type, 4); if (!four) return null;
  return paresQ(r, 'Movimientos', 'Une cada movimiento con su tipo.', four.map(m => [m.name, tn(ctx, m.type)]));
}, 2);
add('mecanicas', 'multi', (ctx, s, r) => {
  const t = r.pick(ctx.types).id;
  const sets = pickMulti(r, mvs(ctx).filter(m => m.type === t), mvs(ctx).filter(m => m.type !== t)); if (!sets) return null;
  return multiQ(r, 'Movimientos', `¿Cuáles de estos movimientos son de tipo ${tok(t)}?`, sets[0].map(m => m.name), sets[1].map(m => m.name), [...sets[0], ...sets[1]].map(m => `${m.name}: ${tok(m.type)}`).join(' · '));
}, 2);
add('mecanicas', 'estimacion', (ctx, s, r) => {
  const [m, key] = pickW(r, s, mvs(ctx).filter(x => x.power > 1), 'mp');
  return estQ('Movimientos', `¿Cuál es la potencia del movimiento ${m.name}?`, m.power, { min: 10, max: 250, step: 5, rel: false, tol: [5, 15], exp: `${m.name} tiene potencia ${m.power}.` }, { bankId: key, types: [m.type] });
}, 2);

// --- El intruso ---
add('pokemon', 'intruso', (ctx, s, r, P) => {
  const t = r.pick(ctx.types).id, yes = r.shuffle(P.filter(x => x.types.includes(t))).slice(0, 3), odd = r.pick(P.filter(x => !x.types.includes(t)));
  if (yes.length < 3 || !odd) return null;
  return intrusoQ(r, 'Datos', odd.name, yes.map(x => x.name), `Los demás son de tipo ${tok(t)}.`, `${odd.name} es ${typesTok(odd.types)}.`, { ids: [odd.id] });
}, 2);
add('pokemon', 'intruso', (ctx, s, r) => {
  const g = r.pick([1, 2, 3, 4, 5, 6, 7, 8, 9]), yes = r.shuffle(ctx.pokemon.filter(x => x.gen === g)).slice(0, 3), odd = r.pick(ctx.pokemon.filter(x => x.gen !== g));
  return intrusoQ(r, 'Datos', odd.name, yes.map(x => x.name), `Los demás debutaron en la generación ${g}.`, `${odd.name} es de la generación ${odd.gen}.`, { ids: [odd.id] });
});
add('pokemon', 'intruso', (ctx, s, r) => {
  const [g, o] = r.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2);
  const yes = STARTERS[g].map(id => ctx.byId.get(id)), odd = ctx.byId.get(r.pick(STARTERS[o]));
  return intrusoQ(r, 'Iniciales', odd.name, yes.map(x => x.name), `Los demás son los iniciales de la generación ${g}.`, `${odd.name} es inicial de la generación ${o}.`, { ids: [odd.id] });
}, 2);
add('pokemon', 'intruso', (ctx, s, r, P) => {
  const legs = r.shuffle(ctx.pokemon.filter(x => x.leg)).slice(0, 3), odd = r.pick(P.filter(x => !x.leg));
  return intrusoQ(r, 'Datos', odd.name, legs.map(x => x.name), 'Los demás son legendarios o singulares.', `${odd.name} no lo es.`, { ids: [odd.id] });
});
add('personajes', 'intruso', (ctx, s, r) => {
  const reg = r.pick(['kanto', 'johto', 'hoenn', 'sinnoh', 'teselia', 'kalos', 'galar', 'paldea']);
  const yes = r.shuffle(lids(ctx).filter(l => l.region === reg)).slice(0, 3), odd = r.pick(lids(ctx).filter(l => l.region !== reg));
  return intrusoQ(r, 'Líderes de gimnasio', odd.name, yes.map(l => l.name), `Los demás son líderes de ${regName(ctx, reg)}.`, `${odd.name} es de ${regName(ctx, odd.region)}.`);
}, 2);
add('juegos', 'intruso', (ctx, s, r) => {
  const plat = r.pick(['Game Boy Advance', 'Nintendo DS', 'Nintendo 3DS', 'Nintendo Switch']);
  const yes = r.shuffle(games(ctx).filter(g => g.platform === plat)).slice(0, 3), odd = r.pick(games(ctx).filter(g => g.platform !== plat));
  if (yes.length < 3) return null;
  return intrusoQ(r, 'Juegos', fullName(odd), yes.map(fullName), `Los demás salieron para ${plat}.`, `${fullName(odd)} salió para ${odd.platform}.`);
}, 2);
add('regiones', 'intruso', (ctx, s, r) => {
  const jp = regs(ctx).filter(x => x.insp.includes('Japón')), other = regs(ctx).filter(x => !x.insp.includes('Japón'));
  const yes = r.shuffle(jp).slice(0, 3), odd = r.pick(other);
  return intrusoQ(r, 'Regiones', odd.name, yes.map(x => x.name), 'Las demás se inspiran en lugares de Japón.', `${odd.name} se inspira en ${odd.insp}.`);
});

// --- Estimación ---
const kg = w => (w / 10).toLocaleString('es');
add('pokemon', 'estimacion', (ctx, s, r, P, L) => {
  const p = r.pick(L.filter(x => x.w >= 5));
  return estQ('Pokémon', `¿Cuánto pesa ${p.name}?`, p.w / 10, { unit: 'kg', min: 0.1, max: 1000, step: 0.1, scale: 'log', exp: `${p.name} pesa ${kg(p.w)} kg.` }, { ids: [p.id], types: p.types });
}, 2);
add('pokemon', 'estimacion', (ctx, s, r, P, L) => {
  const p = r.pick(L);
  return estQ('Pokémon', `¿Cuánto mide ${p.name}?`, p.h / 10, { unit: 'm', min: 0.1, max: 20, step: 0.1, scale: 'log', exp: `${p.name} mide ${(p.h / 10).toLocaleString('es')} m.` }, { ids: [p.id], types: p.types });
}, 2);
add('pokemon', 'estimacion', (ctx, s, r, P, L) => {
  const p = r.pick(L), t = p.stats.reduce((a, b) => a + b, 0);
  return estQ('Pokémon', `¿Cuál es el total de estadísticas base de ${p.name}?`, t, { min: 150, max: 720, step: 5, tol: [0.05, 0.12], exp: `${p.stats.join(' / ')} = ${t}.` }, { ids: [p.id], types: p.types });
});
add('pokemon', 'estimacion', (ctx, s, r, P, L) => {
  const p = r.pick(L);
  return estQ('Pokémon', `¿Qué número tiene ${p.name} en la Pokédex Nacional?`, p.id, { min: 1, max: 1025, rel: false, tol: [15, 50], exp: `${p.name} es el #${p.id}.` }, { ids: [p.id], types: p.types });
});
add('juegos', 'estimacion', (ctx, s, r) => {
  const [g, key] = pickW(r, s, games(ctx), 'ey');
  return estQ('Juegos', `¿En qué año salió ${fullName(g)} en Japón?`, g.year, { min: 1996, max: 2026, rel: false, tol: [0, 2], exp: `Salió en ${g.year} para ${g.platform}.` }, { bankId: key });
}, 2);

// ---------- elegir y crear una pregunta ----------
const weighted = (r, items, w) => { const total = items.reduce((a, x) => a + w(x), 0); let k = r.next() * total; for (const x of items) { k -= w(x); if (k <= 0) return x; } return items[items.length - 1]; };

export function genPregunta(ctx, state, r, P, L, only = null) {
  const cats = new Set(state.config.cats?.length ? state.config.cats : Object.keys(CATS));
  const banned = new Set(state.config.type === 'contrarreloj' ? ['bomba'] : []);
  const allowedFmt = new Set(only ? [only] : (state.config.formats?.length ? state.config.formats : Object.keys(WEIGHTS)).filter(f => f in WEIGHTS));
  // Las preguntas propias salen más mientras más haya (hasta 1 de cada 8).
  const own = ctx.bank.filter(q => q.grp === 'propias').length;
  if (own && (!only || only === 'preguntas') && r.next() < Math.min(0.12, own * 0.015)) {
    const q = M.find(m => m.grp === 'propias').fn(ctx, state, r, P, L);
    if (q) return { ...q, grp: 'propias' };
  }
  let usable = M.filter(m => cats.has(m.grp) && !banned.has(m.fmt) && allowedFmt.has(m.fmt));
  if (!usable.length) usable = M.filter(m => cats.has(m.grp) && !banned.has(m.fmt));
  if (!usable.length) usable = M.filter(m => m.fmt === 'preguntas' && m.grp !== 'propias');
  const fmts = Object.keys(WEIGHTS).filter(f => usable.some(m => m.fmt === f));
  for (let tries = 0; tries < 40; tries++) {
    const fmt = weighted(r, fmts, f => WEIGHTS[f]);
    const grps = [...new Set(usable.filter(m => m.fmt === fmt).map(m => m.grp))];
    const grp = r.pick(grps);
    const maker = weighted(r, usable.filter(m => m.fmt === fmt && m.grp === grp), m => m.w);
    let q = null;
    try { q = maker.fn(ctx, state, r, P, L); } catch { q = null; }
    if (q) return { ...q, grp };
  }
  const p = r.pick(L);
  return mcQ(r, 'Datos', `¿En qué generación debutó ${p.name}?`, `Generación ${p.gen}`, [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(g => g !== p.gen).slice(0, 3).map(g => `Generación ${g}`), '', { ids: [p.id], grp: 'pokemon' });
}
