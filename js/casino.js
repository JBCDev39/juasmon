// ============================================================
//  CASINO AZULONA: juegos con colones del juego (no hay plata de verdad).
//  Pokémon 21, Carta alta, Doble o nada y la Raspadita diaria.
// ============================================================
export function createCasino(api) {
  const { esc, store } = api;
  const ctx = () => api.ctx();
  const STATS = [['PS', 0], ['Ataque', 1], ['Defensa', 2], ['Ataque Especial', 3], ['Defensa Especial', 4], ['Velocidad', 5]];
  let g = {};          // estado del juego abierto
  let bet = 10;        // apuesta elegida

  const chips = () => api.fichas().n;
  const randMon = (avoid = []) => { const list = ctx().pokemon; let p; do { p = list[Math.floor(Math.random() * list.length)]; } while (avoid.includes(p.id)); return p; };
  const randStat = () => STATS[Math.floor(Math.random() * STATS.length)];
  const COIN = '<svg class="coin" viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 0h4v1h2v2h1v4h-1v2h-2v1h-4v-1h-2v-2h-1v-4h1v-2h2z" fill="#d4a300"/><path d="M3 1h4v1h1v1h1v4h-1v1h-1v1h-4v-1h-1v-1h-1v-4h1v-1h1z" fill="#ffcb05"/><path d="M4 3h2v4h-2z" fill="#b8860b"/></svg>';
  const chipLine = () => `<div class="chipbar">${COIN}<b class="px" data-count="${chips()}">₡${chips()}</b></div>`;
  const pay = n => { api.addFichas(n); };
  const take = n => { api.addFichas(-n); };
  function betPicker() {
    const have = chips();
    const opts = [5, 10, 25, 50, 100].filter(n => n <= have);
    if (have && !opts.includes(have)) opts.push(have);
    if (bet > have) bet = Math.min(10, have);
    if (!opts.length) return '<p class="hint">Se quedó sin harina. Raspe la raspadita del día o juegue otros modos para ganar más.</p>';
    return `<span class="l px">Apuesta</span><div class="togs">${opts.map(n => api.tog('cas-bet', n, bet === n, n === have ? `Todo (₡${n})` : `₡${n}`)).join('')}</div>`;
  }
  const head = title => `${api.screenHead(title, title === 'Casino Azulona' ? 'menu' : 'casino')}<main class="${api.F().newScreen ? 'enter' : ''} casino">`;
  let seen = new Set();
  const flipCls = key => { if (!key || seen.has(key)) return ''; seen.add(key); return ' flip keep'; };
  const card = (p, val, label, hidden = false, key = null) => hidden
    ? `<div class="pcard back${flipCls(key && key + 'b')}"><span class="px">?</span></div>`
    : `<div class="pcard${flipCls(key && `${key}${val ?? ''}`)}"><span class="pname">${esc(p.name)}</span>${val !== null ? `<span class="pval px">${val}</span>` : '<span class="pval px">?</span>'}</div>`;
  const won = (win, stake) => { if (win > stake) api.coinRain(); };
  // Lado de la mesa: nombre, total grande, barrita hacia 300 y las cartas en fila.
  const side = (who, cards, total, shown, cls = '') => {
    const pct = Math.min(100, total / TARGET * 100), over = total > TARGET;
    return `<div class="side ${cls}"><div class="sidehead"><b class="px">${who}</b><span class="tot px ${over ? 'over' : total === TARGET ? 'exact' : ''}">${shown}</span><span class="hint">/ ${TARGET}</span></div>
      <div class="sbar"><i style="width:${pct}%;${over ? 'background:var(--bad)' : ''}"></i></div>
      <div class="mcards">${cards}</div></div>`;
  };

  // ---------- menú del casino ----------
  function hubView() {
    const s = scratchState(), today = api.crDate();
    const done = s.date === today && s.claimed;
    return `${head('Casino Azulona')}
      ${chipLine()}
      <p class="hint">Los colones se ganan jugando: ₡1 por acierto, más extras por récords y retos. Son colones del juego, nunca plata de verdad.</p>
      <div class="casgrid">
        ${tile('cas-open', '21', 'Pokémon 21', 'Sume una estadística sin pasarse de 300.', '#2e9e4f')}
        ${tile('cas-open', 'alta', 'Carta alta', 'Su Pokémon contra el de la casa. ¿Qué estadística saldrá?', '#2f6fdb')}
        ${tile('cas-open', 'doble', 'Doble o nada', '¿Más o menos? Cada acierto duplica. Retírese a tiempo.', '#e3350d')}
        ${tile('cas-open', 'rasca', 'Raspadita diaria', done ? `Hoy ya ganó ₡${s.prize}. Vuelva mañana.` : '¡Una gratis cada día!', '#e8a500', done ? '' : 'GRATIS')}
      </div></main>`;
  }
  const tile = (a, v, t, d, c, badge = '') => `<button class="castile" data-act="${a}" data-val="${v}" style="--cc:${c}"><b class="px">${t}</b><span>${d}</span>${badge ? `<span class="nbadge px">${badge}</span>` : ''}</button>`;

  // ---------- Pokémon 21 ----------
  const TARGET = 300, HOUSE_STOP = 250;
  const sum = hand => hand.reduce((a, c) => a + c.val, 0);
  let stepTimer = null;
  function deal21() {
    if (bet > chips() || bet <= 0) return;
    take(bet);
    const [label, idx] = randStat(), used = [];
    const draw = () => { const p = randMon(used); used.push(p.id); return { p, val: p.stats[idx] }; };
    seen = new Set();
    g = { game: '21', phase: 'play', label, idx, used, draw, bet, me: [draw(), draw()], house: [draw(), draw()], shown: 1 };
    if (sum(g.me) >= TARGET) stand21(); else api.render();
  }
  // La casa revela y pide sus cartas una por una, con una pausa, para que se pueda seguir.
  function stand21() {
    g.phase = 'house';
    clearTimeout(stepTimer);
    const step = () => {
      if (g.game !== '21' || g.phase !== 'house') return;
      if (g.shown < g.house.length) { g.shown++; api.Sound.play('select'); api.render(); stepTimer = setTimeout(step, 800); return; }
      if (sum(g.me) <= TARGET && sum(g.house) < HOUSE_STOP) { g.house.push(g.draw()); api.render(); stepTimer = setTimeout(step, 150); return; }
      finish21();
    };
    api.render();
    stepTimer = setTimeout(step, 700);
  }
  function finish21() {
    const m = sum(g.me), h = sum(g.house);
    let res, win = 0;
    if (m > TARGET) res = 'Se pasó de 300.';
    else if (h > TARGET) { res = 'La casa se pasó.'; win = m === TARGET ? Math.floor(g.bet * 2.5) : g.bet * 2; }
    else if (m > h) { res = m === TARGET ? `¡${TARGET} exacto!` : 'Le ganó a la casa.'; win = m === TARGET ? Math.floor(g.bet * 2.5) : g.bet * 2; }
    else if (m === h) { res = 'Empate: recupera su apuesta.'; win = g.bet; }
    else res = 'La casa ganó.';
    pay(win);
    g.phase = 'end'; g.res = res; g.win = win; g.shown = g.house.length;
    api.Sound.play(win > g.bet ? 'juas' : win === g.bet ? 'ok' : 'over');
    api.render(); won(win, g.bet);
  }
  function view21() {
    const top = `${head('Pokémon 21')}${chipLine()}`;
    if (g.game !== '21') return `${top}<div class="box"><p class="q">Se reparten Pokémon y se suma una estadística, que sale al azar en cada mano. Acérquese a ${TARGET} sin pasarse.</p>
      <p class="hint">Primero juega usted: pide cartas o se planta. Después la casa pide hasta llegar a ${HOUSE_STOP}. Si gana, cobra el doble; con ${TARGET} exacto, 2,5 veces.</p></div>
      <div class="box field">${betPicker()}<div class="row end"><button class="btn" data-act="c21-deal" ${chips() ? '' : 'disabled'}>Repartir</button></div></div></main>`;
    const hv = g.house.slice(0, g.shown), hsum = sum(hv);
    const houseCards = g.house.map((c, i) => card(c.p, c.val, g.label, i >= g.shown, `h${i}`)).join('');
    const meCards = g.me.map((c, i) => card(c.p, c.val, g.label, false, `m${i}`)).join('');
    const msum = sum(g.me);
    const status = g.phase === 'play' ? 'Su turno: ¿pide otra carta o se planta?' : g.phase === 'house' ? 'La casa está jugando…' : `${g.res} ${g.win > g.bet ? `+₡${g.win - g.bet}` : g.win === g.bet ? '' : `−₡${g.bet}`}`;
    const cls = g.phase === 'end' ? (g.win > g.bet ? 'ok' : g.win === g.bet ? '' : 'bad') : '';
    return `${top}<div class="box table21">
      <div class="row between"><span class="hint px catl">Se suma: ${g.label}</span><span class="hint">Apuesta: ₡${g.bet}</span></div>
      <p class="status21 ${cls}">${esc(status)}</p>
      ${side('Casa', houseCards, hsum, g.phase === 'play' ? `${hsum} + ?` : hsum, 'house')}
      ${side('Usted', meCards, msum, msum, 'me')}
      </div>
      <div class="playbar">${g.phase === 'play'
        ? '<button class="btn ghost" data-act="c21-stand">Plantarse</button><button class="btn" data-act="c21-hit">Pedir otra</button>'
        : g.phase === 'end' ? '<button class="btn ghost" data-act="go-casino">Casino</button><button class="btn" data-act="c21-new">Otra mano</button>' : ''}</div></main>`;
  }

  // ---------- Carta alta ----------
  function altaDeal() {
    const me = randMon(), house = randMon([me.id]);
    seen = new Set();
    g = { game: 'alta', phase: 'bet', me, house };
    api.render();
  }
  function altaReveal() {
    if (bet > chips() || bet <= 0) return;
    take(bet);
    const [label, idx] = randStat();
    const m = g.me.stats[idx], h = g.house.stats[idx];
    const win = m > h ? bet * 2 : m === h ? bet : 0;
    pay(win);
    Object.assign(g, { phase: 'end', label, m, h, win, bet });
    api.Sound.play(win > bet ? 'juas' : win === bet ? 'ok' : 'over');
    api.render(); won(win, bet);
  }
  function altaView() {
    const top = `${head('Carta alta')}${chipLine()}`;
    if (g.game !== 'alta') return `${top}<div class="box"><p class="q">Le sale un Pokémon y la casa tiene otro escondido. Usted apuesta sin saber qué estadística se va a comparar.</p>
      <p class="hint">Si su Pokémon tiene más, cobra el doble. Si empatan, recupera la apuesta.</p>
      <div class="row end" style="margin-top:12px"><button class="btn" data-act="alta-deal" ${chips() ? '' : 'disabled'}>Repartir</button></div></div></main>`;
    if (g.phase === 'bet') return `${top}<div class="box"><div class="vsrow"><div><span class="hint">Usted</span><div class="pcard"><span class="pname">${esc(g.me.name)}</span>${api.typePills(g.me)}</div></div><div class="vsmark px">vs</div><div><span class="hint">Casa</span>${card(g.house, null, '', true, 'ah')}</div></div>
      <p class="hint" style="margin-top:10px">Este es su Pokémon. ¿Cuánto le apuesta?</p></div>
      <div class="box field">${betPicker()}<div class="row end"><button class="btn" data-act="alta-reveal" ${chips() ? '' : 'disabled'}>Revelar</button></div></div></main>`;
    return `${top}<div class="box"><span class="hint px catl">Salió: ${g.label}</span>
      <div class="vsrow" style="margin-top:10px"><div><span class="hint">Usted</span>${card(g.me, g.m, g.label, false, 'am')}</div><div class="vsmark px">vs</div><div><span class="hint">Casa</span>${card(g.house, g.h, g.label, false, 'ah')}</div></div>
      <p class="flash ${g.win > g.bet ? 'ok' : g.win === g.bet ? '' : 'bad'} keep">${g.win > g.bet ? `¡JUAS! +₡${g.win - g.bet}` : g.win === g.bet ? 'Empate: recupera su apuesta.' : `Diay, no. −₡${g.bet}`}</p>
      <div class="row end"><button class="btn ghost" data-act="go-casino">Casino</button><button class="btn" data-act="alta-deal">Otra carta</button></div></div></main>`;
  }

  // ---------- Doble o nada ----------
  function dobleStart() {
    if (bet > chips() || bet <= 0) return;
    take(bet);
    const [label, idx] = randStat(), a = randMon();
    seen = new Set();
    g = { game: 'doble', phase: 'play', label, idx, a, b: randMon([a.id]), pot: bet, bet, streak: 0, seen: [a.id] };
    api.render();
  }
  function dobleGuess(more) {
    const va = g.a.stats[g.idx], vb = g.b.stats[g.idx];
    const ok = vb === va || (more ? vb > va : vb < va);
    g.lastB = { p: g.b, v: vb, ok };
    if (!ok) { g.phase = 'lost'; api.Sound.play('over'); api.render(); return; }
    g.pot *= 2; g.streak++;
    api.Sound.play('ok');
    g.seen.push(g.b.id); g.a = g.b; g.b = randMon(g.seen);
    api.render();
  }
  function dobleCash() {
    pay(g.pot);
    g.phase = 'cashed';
    api.Sound.play('juas');
    api.render(); won(g.pot, g.bet);
  }
  function dobleView() {
    const top = `${head('Doble o nada')}${chipLine()}`;
    if (g.game !== 'doble') return `${top}<div class="box"><p class="q">Sale un Pokémon con una estadística. ¿El siguiente tiene más o menos? Cada acierto duplica lo que tiene en juego.</p>
      <p class="hint">Puede retirarse cuando quiera con lo ganado. Si falla, lo pierde todo. Si empatan, cuenta como acierto.</p></div>
      <div class="box field">${betPicker()}<div class="row end"><button class="btn" data-act="doble-start" ${chips() ? '' : 'disabled'}>Empezar</button></div></div></main>`;
    const va = g.a.stats[g.idx];
    const last = g.lastB && g.phase === 'play' ? `<p class="flash ok keep">¡Bien! ${esc(g.lastB.p.name)} tenía ${g.lastB.v}. En juego: ₡${g.pot}</p>` : '';
    if (g.phase !== 'play') {
      const t = g.phase === 'cashed' ? `¡Se retiró con ₡${g.pot}!` : `Diay, no. ${g.lastB.p.name} tenía ${g.lastB.v}. Perdió ₡${g.pot}.`;
      return `${top}<div class="box"><p class="verdict px ${g.phase === 'cashed' ? 'ok' : 'bad'}" data-tw="${esc(t)}">${esc(t)}</p>
        <p class="hint">${api.plural(g.streak, 'acierto', 'aciertos')} seguidos con ${g.label}.</p>
        <div class="row end"><button class="btn ghost" data-act="go-casino">Casino</button><button class="btn" data-act="doble-new">Otra vez</button></div></div></main>`;
    }
    return `${top}<div class="box"><span class="hint px catl">${g.label} · en juego ₡${g.pot}</span>
      <div class="vsrow" style="margin-top:10px"><div>${card(g.a, va, g.label, false, `a${g.a.id}`)}</div><div class="vsmark px">?</div><div>${card(g.b, null, '', false, `b${g.b.id}`)}</div></div>
      ${last}<p class="q">¿${esc(g.b.name)} tiene más o menos ${g.label} que ${esc(g.a.name)}?</p>
      <div class="row end"><button class="btn ghost" data-act="doble-cash" ${g.streak ? '' : 'disabled'}>Retirarse con ₡${g.pot}</button><button class="btn" data-act="doble-less">Menos</button><button class="btn" data-act="doble-more">Más</button></div></div></main>`;
  }

  // ---------- Raspadita diaria ----------
  const SYMBOLS = { corona: 200, estrella: 50, rayo: 30, llama: 20, gota: 10 };
  const ODDS = [['corona', 0.02], ['estrella', 0.08], ['rayo', 0.15], ['llama', 0.25], ['gota', 0.3]];
  function scratchState() { return store.load('pt-rasca', { date: null }); }
  function newScratch(date) {
    let k = Math.random(), win = null;
    for (const [s, p] of ODDS) { k -= p; if (k <= 0) { win = s; break; } }
    const syms = Object.keys(SYMBOLS), cells = [];
    if (win) cells.push(win, win, win);
    // El resto, sin que ningún otro símbolo salga tres veces.
    const count = {};
    if (win) count[win] = 3;
    while (cells.length < 9) {
      const s = syms[Math.floor(Math.random() * syms.length)];
      if ((count[s] || 0) >= (s === win ? 3 : 2)) continue;
      count[s] = (count[s] || 0) + 1; cells.push(s);
    }
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    return { date, cells, open: cells.map(() => false), win, prize: win ? SYMBOLS[win] : 5, claimed: false };
  }
  function rascaView() {
    const today = api.crDate();
    let s = scratchState();
    if (s.date !== today) { s = newScratch(today); store.save('pt-rasca', s); }
    const all = s.open.every(Boolean);
    const cells = s.cells.map((sym, i) => s.open[i]
      ? `<div class="rcell open ${s.win === sym ? 'win' : ''}">${api.pixSvg(api.AV_ICONS[sym], '#1d2321')}</div>`
      : `<button class="rcell" data-act="rasca" data-val="${i}" aria-label="Raspar casilla ${i + 1}"><span class="px">?</span></button>`).join('');
    const msg = all ? (s.win ? `¡Tres ${s.win === 'corona' ? 'coronas, premio gordo' : s.win}! +₡${s.prize}` : `Esta vez no hubo tres iguales. Le dejamos ₡${s.prize} de consuelo.`) : 'Toque las casillas para rasparlas. Tres iguales ganan.';
    return `${head('Raspadita diaria')}${chipLine()}
      <div class="box"><div class="rgrid">${cells}</div>
      <p class="${all ? `flash ${s.win ? 'ok' : ''} keep` : 'hint'}" style="margin-top:12px">${esc(msg)}</p>
      <p class="hint">Premios: 👑 ₡200 · ⭐ ₡50 · ⚡ ₡30 · 🔥 ₡20 · 💧 ₡10.</p>
      <div class="row end">${all ? '<button class="btn" data-act="go-casino">Ir al casino</button>' : '<button class="btn ghost" data-act="rasca-all">Raspar todo</button>'}</div></div></main>`;
  }
  function rascar(i) {
    const s = scratchState();
    if (s.date !== api.crDate() || s.claimed) return;
    if (i === 'all') s.open = s.open.map(() => true); else s.open[+i] = true;
    if (s.open.every(Boolean) && !s.claimed) { s.claimed = true; pay(s.prize); api.Sound.play(s.win ? 'rankup' : 'ok'); if (s.win) setTimeout(() => api.coinRain(), 50); }
    else api.Sound.play('select');
    store.save('pt-rasca', s);
    api.render();
  }

  const VIEWS = { casino: hubView, c21: view21, alta: altaView, doble: dobleView, rasca: rascaView };
  function act(a, v) {
    switch (a) {
      case 'cas-open': g = {}; api.goto({ 21: 'c21', alta: 'alta', doble: 'doble', rasca: 'rasca' }[v]); return true;
      case 'cas-bet': bet = +v; api.render(); return true;
      case 'c21-deal': case 'c21-new': if (a === 'c21-new') { g = {}; api.render(); } else deal21(); return true;
      case 'c21-hit': if (g.phase !== 'play') return true; g.me.push(g.draw()); api.Sound.play('select'); if (sum(g.me) >= TARGET) stand21(); else api.render(); return true;
      case 'c21-stand': if (g.phase === 'play') stand21(); return true;
      case 'alta-deal': altaDeal(); return true;
      case 'alta-reveal': altaReveal(); return true;
      case 'doble-start': dobleStart(); return true;
      case 'doble-new': g = {}; api.render(); return true;
      case 'doble-more': dobleGuess(true); return true;
      case 'doble-less': dobleGuess(false); return true;
      case 'doble-cash': dobleCash(); return true;
      case 'rasca': rascar(v); return true;
      case 'rasca-all': rascar('all'); return true;
    }
    return false;
  }
  return {
    VIEWS, act,
    // Si se sale a mitad de Doble o nada, se cobra lo que tenía en juego para no perderlo.
    leave: () => { if (g.game === 'doble' && g.phase === 'play') dobleCash(); if (g.game === '21' && (g.phase === 'play' || g.phase === 'house')) { clearTimeout(stepTimer); while (sum(g.me) <= TARGET && sum(g.house) < HOUSE_STOP) g.house.push(g.draw()); finish21(); } g = {}; },
    scratchDone: () => { const s = scratchState(); return s.date === api.crDate() && s.claimed; },
    scratchPrize: () => scratchState().prize,
  };
}
