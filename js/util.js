// Utilidades compartidas por el motor y los generadores de preguntas.
// Sin pantalla: sirven igual en el navegador que en un servidor.

// Generador aleatorio con semilla (mulberry32). Su estado es un número,
// así que se guarda dentro del estado del juego.
export function rng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick: arr => arr[Math.floor(next() * arr.length)],
    shuffle: arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    get state() { return s; },
  };
}

export function normalize(str) {
  return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

// ¿Están a un solo error de tipeo? Cuenta como un error: una letra de más,
// una de menos, una cambiada o dos letras vecinas intercambiadas (Jhoto → Johto).
export function near1(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
// Se perdona un error en respuestas de 5 letras o más.
export const TYPO_MIN = 5;
export const typoOk = (canon, typed) => canon.length >= TYPO_MIN && typed.length >= TYPO_MIN - 1 && near1(canon, typed);

// Lo menos repetido posible: primero lo que nunca salió; si ya salió
// casi todo, lo que salió hace más tiempo (la mitad más antigua).
export function leastUsed(list, used, key = x => x.id) {
  const set = new Set(used);
  const unseen = list.filter(x => !set.has(key(x)));
  if (unseen.length >= Math.min(8, list.length)) return unseen;
  const last = new Map(used.map((id, i) => [id, i]));
  const sorted = list.slice().sort((a, b) => (last.get(key(a)) ?? -1) - (last.get(key(b)) ?? -1));
  return sorted.slice(0, Math.max(4, Math.ceil(sorted.length / 2)));
}

export function typeMultiplier(ctx, atkType, defTypes) {
  return defTypes.reduce((m, d) => m * (ctx.efficacy[`${atkType}-${d}`] ?? 1), 1);
}

export function typesLabel(ctx, p) {
  return p.types.map(t => ctx.typeName.get(t)).join(' / ');
}

// {t:10} se dibuja en pantalla como la etiqueta del tipo Fuego.
export const tok = id => `{t:${id}}`;
export const typesTok = types => types.map(tok).join(' ');

export const fmtMult = x => x === 0 ? 'No le afecta (×0)' : `×${String(x).replace('.', ',')}`;
