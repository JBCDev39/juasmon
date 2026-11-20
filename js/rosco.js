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

function candidates(ctx, gens) {
  const out = [];
  const add = (answer, clue, acc = []) => out.push({ answer, clue, acc });
  const P = ctx.pokemon.filter(p => gens.includes(p.gen));
  for (const p of P) {
    if (p.genus && ctx.genusCount.get(p.genus) === 1) add(p.name, `Pokémon conocido como el «${p.genus}».`, [p.en]);
    if (p.from && ctx.evolvesTo.get(p.from)?.length === 1) add(p.name, `Pokémon que evoluciona de ${ctx.byId.get(p.from).name}.`, [p.en]);
    const next = ctx.evolvesTo.get(p.id);
    if (next?.length === 1) add(p.name, `Pokémon que evoluciona en ${next[0].name}.`, [p.en]);
  }
  const w = ctx.world;
  const reg = id => w.regiones.find(x => x.id === id).name;
  for (const l of w.lideres) {
    const same = w.lideres.filter(x => x.region === l.region && x.type === l.type);
    if (same.length === 1) add(l.name, `Líder de gimnasio de tipo ${ctx.typeName.get(l.type)} en ${reg(l.region)}.`, l.alias);
    const place = l.city.replace(/^(Ciudad|Pueblo|Isla|Sierra)\s+/, '');
    add(place, `Lugar del gimnasio de ${l.name}, en ${reg(l.region)}.`, [l.city]);
  }
  for (const g of w.regiones) {
    add(g.name, `Región inspirada en ${g.insp}.`);
    if (g.profAlias.length === 1) add(g.prof, `Profesor o profesora Pokémon de ${g.name}.`);
  }
  const champs = { kanto: ['Azul', 'Kanto, en Rojo y Azul'], johto: ['Lance', 'Johto'], sinnoh: ['Cintia', 'Sinnoh'], kalos: ['Dianta', 'Kalos'], galar: ['Lionel', 'Galar'], paldea: ['Ságita', 'Paldea'], hoenn: ['Máximo', 'Hoenn en Rubí y Zafiro'], teselia: ['Mirto', 'Teselia en Negro y Blanco'] };
  for (const [ans, where] of Object.values(champs)) add(ans, `Campeón o campeona de la Liga de ${where}.`);
  for (const b of w.jefes) add(b.name, `Jefe del ${b.team}.`);
  for (const g of w.juegos.filter(x => !x.name.includes(' '))) add(g.name, `Juego de ${g.year} para ${g.platform}, ambientado en ${g.region}.`, [`Pokémon ${g.name}`]);
  return out;
}

// Arma un rosco de 27 letras. avoid: respuestas que ya usó otro jugador.
export function buildRosco(ctx, r, gens, avoid = new Set()) {
  const gen = candidates(ctx, gens.length ? gens : [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const hand = ctx.rosco || [];
  const used = new Set(avoid);
  return LETTERS.map(L => {
    const ok = x => !used.has(core(x.answer));
    let pool = hand.filter(x => x.L === L && ok(x)).map(x => ({ ...x, w: 3 }))
      .concat(gen.filter(x => L !== 'Ñ' && firstLetter(x.answer) === L && ok(x)).map(x => ({ ...x, mode: 'empieza', w: 1 })));
    if (!pool.length) pool = gen.filter(x => normalize(x.answer).includes(normalize(L)) && ok(x)).map(x => ({ ...x, mode: 'contiene', w: 1 }));
    if (!pool.length) pool = hand.filter(x => x.L === L).map(x => ({ ...x, w: 1 }));
    // Las escritas a mano pesan más: salen más seguido.
    const total = pool.reduce((a, x) => a + x.w, 0);
    let k = r.next() * total, pick = pool[pool.length - 1];
    for (const x of pool) { k -= x.w; if (k <= 0) { pick = x; break; } }
    used.add(core(pick.answer));
    return { L, mode: pick.mode || 'empieza', clue: pick.clue, answer: pick.answer, acc: pick.acc || [] };
  });
}
