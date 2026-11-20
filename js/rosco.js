// ============================================================
//  JUASROSCO: una pista por cada letra del abecedario.
//  Mezcla pistas escritas a mano con pistas armadas con los datos
//  (Pokémon, líderes, ciudades, regiones, juegos…). Sin pantalla.
// ============================================================
import { normalize, typoOk } from './util.js';

export const LETTERS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');

const firstLetter = s => { const c = s.trim()[0].toUpperCase(); return c === 'Ñ' ? 'Ñ' : c.normalize('NFD')[0]; };
const PREFIX = /^(ciudad|pueblo|isla|islas|sierra|profesora?|team|equipo|el|la|los|las|pokemon)\s+/i;
export const core = s => normalize(String(s).trim().replace(PREFIX, ''));

// Devuelve 'ok' si está bien escrito, 'typo' si tiene un error de tipeo perdonable, o false.
export function roscoMatch(entry, text) {
  const t = core(text);
  if (!t) return false;
  const all = [entry.answer, ...(entry.acc || [])].map(core);
  if (all.includes(t)) return 'ok';
  return all.some(c => typoOk(c, t)) ? 'typo' : false;
}

// Pistas armadas con los datos, cada una con su categoría.
function candidates(ctx, gens) {
  const out = [];
  const add = (cat, answer, clue, acc = []) => out.push({ cat, answer, clue, acc });
  const P = ctx.pokemon.filter(p => gens.includes(p.gen));
  const tn = id => ctx.typeName.get(id);
  // Pokémon
  const combo = new Map();
  for (const p of ctx.pokemon) { const k = p.types.slice().sort().join('-'); combo.set(k, (combo.get(k) || 0) + 1); }
  for (const p of P) {
    if (p.genus && ctx.genusCount.get(p.genus) === 1) add('pokemon', p.name, `Pokémon conocido como el «${p.genus}».`, [p.en]);
    if (p.from && ctx.evolvesTo.get(p.from)?.length === 1) add('pokemon', p.name, `Pokémon que evoluciona de ${ctx.byId.get(p.from).name}.`, [p.en]);
    const next = ctx.evolvesTo.get(p.id);
    if (next?.length === 1) add('pokemon', p.name, `Pokémon que evoluciona en ${next[0].name}.`, [p.en]);
    if (p.types.length === 2 && combo.get(p.types.slice().sort().join('-')) === 1) add('pokemon', p.name, `El único Pokémon de tipo ${tn(p.types[0])} y ${tn(p.types[1])}.`, [p.en]);
    if (p.leg && p.gen) add('pokemon', p.name, `Pokémon legendario o singular de la generación ${p.gen}, de tipo ${p.types.map(tn).join(' y ')}.`, [p.en]);
  }
  // Movimientos: solo si la combinación de tipo, potencia y generación los identifica.
  const mv = ctx.extra?.moves || [];
  const mkey = m => `${m.type}-${m.power}-${m.gen}`, mcount = new Map();
  for (const m of mv) mcount.set(mkey(m), (mcount.get(mkey(m)) || 0) + 1);
  for (const m of mv) if (m.power && mcount.get(mkey(m)) === 1 && m.type <= 18) add('movimientos', m.name, `Movimiento de tipo ${tn(m.type)} con ${m.power} de potencia, de la generación ${m.gen}.`);
  // Habilidades: «la tiene X», si X no tiene otra habilidad con la misma letra.
  const abName = id => ctx.extra?.abilities?.[id];
  for (const p of P) {
    const abs = (ctx.extra?.monAbilities?.[p.id] || []).map(([a, h]) => ({ name: abName(a), hidden: h })).filter(x => x.name);
    for (const x of abs) {
      if (abs.filter(y => firstLetter(y.name) === firstLetter(x.name)).length > 1) continue;
      add('habilidades', x.name, x.hidden ? `Habilidad oculta de ${p.name}.` : `Habilidad que puede tener ${p.name}.`);
    }
  }
  // Tipos
  const imm = [[8, [1, 2]], [1, [8]], [9, [4]], [3, [5]], [5, [13]], [17, [14]], [18, [16]]];
  for (const [t, from] of imm) add('tipos', tn(t), `Tipo inmune a los ataques de tipo ${from.map(tn).join(' y ')}.`);
  for (const p of P.filter(x => x.types.length === 1 && x.gen <= 4 && !x.from)) add('tipos', tn(p.types[0]), `El único tipo de ${p.name}.`);
  // Lugares y personajes
  const w = ctx.world;
  const reg = id => w.regiones.find(x => x.id === id).name;
  for (const l of w.lideres) {
    const same = w.lideres.filter(x => x.region === l.region && x.type === l.type);
    if (same.length === 1) add('personajes', l.name, `Líder de gimnasio de tipo ${tn(l.type)} en ${reg(l.region)}.`, l.alias);
    const place = l.city.replace(/^(Ciudad|Pueblo|Isla|Sierra)\s+/, '');
    add('lugares', place, `Lugar del gimnasio de ${l.name}, en ${reg(l.region)}.`, [l.city]);
  }
  for (const g of w.regiones) {
    add('lugares', g.name, `Región inspirada en ${g.insp}.`);
    if (g.profAlias.length === 1) add('personajes', g.prof, `Profesor o profesora Pokémon de ${g.name}.`);
  }
  const champs = { kanto: ['Azul', 'Kanto, en Rojo y Azul'], johto: ['Lance', 'Johto'], sinnoh: ['Cintia', 'Sinnoh'], kalos: ['Dianta', 'Kalos'], galar: ['Lionel', 'Galar'], paldea: ['Ságita', 'Paldea'], hoenn: ['Máximo', 'Hoenn en Rubí y Zafiro'], teselia: ['Mirto', 'Teselia en Negro y Blanco'] };
  for (const [ans, where] of Object.values(champs)) add('personajes', ans, `Campeón o campeona de la Liga de ${where}.`);
  for (const b of w.jefes) add('personajes', b.name, `Jefe del ${b.team}.`);
  for (const g of w.juegos.filter(x => !x.name.includes(' '))) add('juegos', g.name, `Juego de ${g.year} para ${g.platform}, ambientado en ${g.region}.`, [`Pokémon ${g.name}`]);
  return out;
}

// Cuántas veces puede salir cada categoría en un mismo rosco.
const CAT_MAX = { pokemon: 6, movimientos: 5, habilidades: 4, tipos: 3, lugares: 5, personajes: 5, juegos: 3, mano: 99 };

// Arma un rosco de 27 letras. Para cada letra elige primero una categoría y después la pista,
// así no salen puras de «Pokémon conocido como…». avoid: respuestas que ya usó otro jugador.
export function buildRosco(ctx, r, gens, avoid = new Set()) {
  const gen = candidates(ctx, gens.length ? gens : [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const hand = (ctx.rosco || []).map(x => ({ ...x, cat: 'mano' }));
  const used = new Set(avoid), count = {};
  const pickFrom = (list, mode) => {
    const byCat = new Map();
    for (const x of list) byCat.set(x.cat, (byCat.get(x.cat) || []).concat(x));
    let cats = [...byCat.keys()].filter(c => (count[c] || 0) < CAT_MAX[c]);
    if (!cats.length) cats = [...byCat.keys()];
    // Las escritas a mano pesan doble; las demás categorías, lo mismo cada una.
    const wsum = cats.reduce((a, c) => a + (c === 'mano' ? 2 : 1), 0);
    let k = r.next() * wsum, cat = cats[cats.length - 1];
    for (const c of cats) { k -= c === 'mano' ? 2 : 1; if (k <= 0) { cat = c; break; } }
    const x = r.pick(byCat.get(cat));
    count[cat] = (count[cat] || 0) + 1;
    return { ...x, mode: x.mode || mode };
  };
  return LETTERS.map(L => {
    const ok = x => !used.has(core(x.answer));
    let pick;
    const starts = hand.filter(x => x.L === L && ok(x)).concat(gen.filter(x => L !== 'Ñ' && firstLetter(x.answer) === L && ok(x)));
    if (starts.length) pick = pickFrom(starts, 'empieza');
    else {
      const contains = gen.filter(x => normalize(x.answer).includes(normalize(L)) && ok(x));
      pick = contains.length ? pickFrom(contains, 'contiene') : pickFrom(hand.filter(x => x.L === L), 'empieza');
    }
    used.add(core(pick.answer));
    return { L, mode: pick.mode, clue: pick.clue, answer: pick.answer, acc: pick.acc || [] };
  });
}
