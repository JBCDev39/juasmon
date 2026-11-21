// ============================================================
//  El cielo del paisaje: clima real de San José (Open-Meteo, gratis
//  y sin cuenta), día o noche según la hora de Costa Rica, y las
//  decoraciones de las fechas ticas.
//  Para ver cómo se ve otra fecha o clima: ?fecha=2026-09-15&clima=lluvia&noche=1
// ============================================================
const URL_CLIMA = 'https://api.open-meteo.com/v1/forecast?latitude=9.93&longitude=-84.08&current=weather_code,is_day&timezone=America%2FCosta_Rica';
const CADA = 30 * 60 * 1000;

const params = new URLSearchParams(location.search);
const forced = { fecha: params.get('fecha'), clima: params.get('clima'), noche: params.get('noche') };

// Código del tiempo (WMO) → cómo se dibuja.
function weatherFromCode(c) {
  if (c === 0 || c === 1) return 'despejado';
  if (c === 2) return 'parcial';
  if (c === 3) return 'nublado';
  if (c === 45 || c === 48) return 'neblina';
  if (c >= 51 && c <= 57) return 'llovizna';
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'lluvia';
  if (c >= 95) return 'tormenta';
  return 'nublado';
}
export const WEATHER_LABEL = { despejado: 'despejado', parcial: 'parcialmente nublado', nublado: 'nublado', neblina: 'con neblina', llovizna: 'con llovizna', lluvia: 'lloviendo', tormenta: 'con tormenta' };

export function crNow() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: +get('hour') % 24 };
}

// Fechas ticas (y una pokémon).
export function holidayFor(date) {
  const [, m, d] = date.split('-').map(Number);
  if ((m === 12 && d === 31) || (m === 1 && d === 1)) return { id: 'anonuevo', label: '¡Feliz Año Nuevo!' };
  if ((m === 12 && d <= 30) || (m === 1 && d <= 6)) return { id: 'navidad', label: m === 12 && d >= 24 ? '¡Feliz Navidad!' : '¡Ya huele a tamal! Feliz época navideña' };
  if (m === 2 && d === 27) return { id: 'pokemon', label: '¡Feliz Día de Pokémon!' };
  if (m === 9 && d <= 15) return { id: 'patria', label: d === 15 ? '¡Feliz 15 de setiembre!' : d === 14 ? '¡Hoy es el desfile de faroles!' : 'Mes de la Patria' };
  if (m === 8 && d === 15) return { id: 'madre', label: '¡Feliz Día de la Madre!' };
  return null;
}

export function createSky(store, onChange) {
  let wx = store.load('pt-clima', null);   // { at, code, isDay }
  const state = () => {
    const now = crNow();
    const date = forced.fecha || now.date;
    const hourNight = now.hour < 6 || now.hour >= 18;
    const fresh = wx && Date.now() - wx.at < 3 * 60 * 60 * 1000;
    const night = forced.noche !== null ? forced.noche === '1' : fresh ? !wx.isDay : hourNight;
    const weather = forced.clima || (fresh ? weatherFromCode(wx.code) : 'despejado');
    return { night, weather, holiday: holidayFor(date), date, live: !!fresh };
  };
  let key = '';
  const keyOf = s => `${s.night}|${s.weather}|${s.holiday?.id || ''}`;
  async function refresh() {
    if (wx && Date.now() - wx.at < CADA) return;
    try {
      const r = await fetch(URL_CLIMA);
      if (!r.ok) return;
      const j = await r.json();
      wx = { at: Date.now(), code: j.current.weather_code, isDay: j.current.is_day === 1 };
      store.save('pt-clima', wx);
    } catch { /* sin internet: se queda con lo último o con despejado */ }
    check();
  }
  function check() {
    const k = keyOf(state());
    if (k !== key) { key = k; onChange(); }
  }
  key = keyOf(state());
  refresh();
  setInterval(() => { refresh(); check(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refresh(); check(); } });
  return { state, refresh };
}

// ---------- dibujos encima del paisaje (en unidades del dibujo: 320 × 180) ----------
function rnd(seed) { let s = seed; return () => (s = s * 16807 % 2147483647) / 2147483647; }

export function weatherLayer(w) {
  const r = rnd(777);
  let out = '';
  if (w === 'nublado' || w === 'lluvia' || w === 'tormenta' || w === 'llovizna') out += '<rect width="320" height="180" fill="#3c4a5c" opacity=".22"/>';
  if (w === 'lluvia' || w === 'tormenta' || w === 'llovizna') {
    const n = w === 'llovizna' ? 40 : 90;
    for (let i = 0; i < n; i++) {
      const x = Math.floor(r() * 330) - 5, y = Math.floor(r() * 150), d = (0.5 + r() * 0.4).toFixed(2);
      out += `<rect class="drop" x="${x}" y="${y - 160}" width="1" height="${w === 'llovizna' ? 2 : 4}" fill="#cfe3ff" opacity=".75" style="animation-duration:${d}s;animation-delay:${(-r() * 2).toFixed(2)}s"/>`;
    }
  }
  if (w === 'tormenta') out += '<rect class="flash" width="320" height="180" fill="#fff"/>';
  if (w === 'neblina') {
    out += '<g class="fogband"><rect x="-40" y="104" width="400" height="10" fill="#fff" opacity=".35"/><rect x="-60" y="122" width="440" height="14" fill="#fff" opacity=".3"/><rect x="-20" y="142" width="380" height="8" fill="#fff" opacity=".28"/></g>';
  }
  return out;
}

const px = (x, y, w, h, c, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" ${extra}/>`;

export function holidayLayer(h) {
  if (!h) return '';
  const r = rnd(4242);
  let out = '';
  if (h.id === 'navidad' || h.id === 'anonuevo') {
    // Guirnalda de luces arriba
    const colors = ['#ff4b4b', '#ffd23f', '#3fd47a', '#4b9bff', '#ff8be0'];
    let path = '';
    for (let x = 0; x <= 320; x += 4) { const y = 6 + Math.round(Math.sin(x / 26) * 4 + 4); path += px(x, y, 4, 1, '#2b3a2b'); if (x % 16 === 0) out += px(x + 1, y + 1, 2, 3, colors[(x / 16) % colors.length], `class="blinkl" style="animation-delay:${(-(x / 16) % 5 * 0.3).toFixed(1)}s"`); }
    out = path + out;
    if (h.id === 'navidad') {
      // Arbolito en la colina
      const tx = 126, ty = 104;  // cerca del centro: en el celular solo se ve el centro del paisaje
      out += px(tx + 6, ty - 3, 2, 2, '#ffd23f');
      for (let i = 0; i < 4; i++) out += px(tx + 6 - i * 2, ty + i * 4, 2 + i * 4, 4, '#1f6b35');
      out += px(tx + 5, ty + 16, 4, 4, '#6b3f1f');
      out += px(tx + 4, ty + 6, 1, 1, '#ff4b4b') + px(tx + 9, ty + 9, 1, 1, '#4b9bff') + px(tx + 3, ty + 13, 1, 1, '#ffd23f') + px(tx + 11, ty + 13, 1, 1, '#ff8be0');
    } else {
      // Fuegos artificiales
      const bursts = [[132, 44, '#ffd23f'], [160, 26, '#ff4b4b'], [188, 50, '#4b9bff'], [70, 40, '#3fd47a'], [250, 34, '#ff8be0']];
      bursts.forEach(([cx, cy, c], k) => {
        let g = '';
        for (let a = 0; a < 12; a++) { const ang = a / 12 * Math.PI * 2; for (let d = 4; d <= 10; d += 3) g += px(Math.round(cx + Math.cos(ang) * d), Math.round(cy + Math.sin(ang) * d), 1, 1, c); }
        out += `<g class="burst" style="animation-delay:${k * 0.7}s;transform-origin:${cx}px ${cy}px">${g}</g>`;
      });
    }
  }
  if (h.id === 'patria') {
    // Faroles colgando de un mecate
    const colors = ['#ff4b4b', '#4b7bff', '#ffffff', '#ffd23f', '#3fd47a'];
    for (let x = 0; x <= 320; x += 4) out += px(x, 10 + Math.round(Math.sin(x / 30) * 3), 4, 1, '#6b4a2a');
    for (let i = 0; i < 9; i++) {
      const x = 14 + i * 36, y = 12 + Math.round(Math.sin(x / 30) * 3), c = colors[i % colors.length];
      out += `<g class="swing" style="transform-origin:${x + 3}px ${y}px;animation-delay:${(-i * 0.4).toFixed(1)}s">${px(x + 2, y, 2, 3, '#6b4a2a')}${px(x, y + 3, 7, 1, '#3a2a1a')}${px(x, y + 4, 7, 8, c)}${px(x + 2, y + 6, 3, 4, '#fff5b0', 'opacity=".8"')}${px(x, y + 12, 7, 1, '#3a2a1a')}</g>`;
    }
    // Bandera de Costa Rica en un asta, en la colina
    const fx = 190, fy = 90;
    out += px(fx, fy, 1, 30, '#5a4a3a');
    out += `<g class="wave" style="transform-origin:${fx + 1}px ${fy}px">${px(fx + 1, fy, 20, 2, '#1f3fa8')}${px(fx + 1, fy + 2, 20, 2, '#ffffff')}${px(fx + 1, fy + 4, 20, 4, '#d81f2a')}${px(fx + 1, fy + 8, 20, 2, '#ffffff')}${px(fx + 1, fy + 10, 20, 2, '#1f3fa8')}</g>`;
  }
  if (h.id === 'pokemon') {
    const colors = ['#ff4b4b', '#ffd23f', '#3fd47a', '#4b9bff', '#ff8be0', '#ffffff'];
    for (let i = 0; i < 70; i++) out += px(Math.floor(r() * 320), Math.floor(r() * 120) - 130, 2, 2, colors[i % colors.length], `class="confe" style="animation-duration:${(4 + r() * 4).toFixed(1)}s;animation-delay:${(-r() * 8).toFixed(1)}s"`);
  }
  if (h.id === 'madre') {
    const colors = ['#ff6fae', '#ff4b4b', '#ffd23f', '#ffffff', '#c58bff'];
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(r() * 316), y = 154 + Math.floor(r() * 22), c = colors[i % colors.length];
      out += px(x + 1, y + 2, 1, 4, '#2c6a2a') + px(x, y, 3, 1, c) + px(x + 1, y - 1, 1, 3, c);
    }
  }
  return out;
}
