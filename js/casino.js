// ============================================================
//  CASINO AZULONA: juegos con fichas del juego (no hay plata de verdad).
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
  const chipLine = () => `<div class="chipbar">${COIN}<b class="px">${chips()}</b><span class="hint">fichas</span></div>`;
  const pay = n => { api.addFichas(n); };
  const take = n => { api.addFichas(-n); };
  function betPicker() {
    const have = chips();
    const opts = [5, 10, 25, 50, 100].filter(n => n <= have);
    if (have && !opts.includes(have)) opts.push(have);
    if (bet > have) bet = Math.min(10, have);
    if (!opts.length) return '<p class="hint">Se quedó sin fichas. Raspe la raspadita del día o juegue otros modos para ganar más.</p>';
    return `<span class="l px">Apuesta</span><div class="togs">${opts.map(n => api.tog('cas-bet', n, bet === n, n === have && n > 100 ? `Todo (${n})` : n === have ? `Todo (${n})` : n)).join('')}</div>`;
  }
  const head = title => `${api.screenHead(title, title === 'Casino Azulona' ? 'menu' : 'casino')}<main class="${api.F().newScreen ? 'enter' : ''} casino">`;
  const card = (p, val, label, hidden = false) => hidden
    ? `<div class="pcard back"><span class="px">?</span></div>`
    : `<div class="pcard"><span class="pname">${esc(p.name)}</span>${api.typePills(p)}${val !== null ? `<span class="pval px">${val}</span><span class="hint">${label}</span>` : ''}</div>`;

  // ---------- menú del casino ----------
  function hubView() {
    const s = scratchState(), today = api.crDate();
    const done = s.date === today && s.claimed;
    return `${head('Casino Azulona')}
      ${chipLine()}
      <p class="hint">Las fichas se ganan jugando: 1 por acierto, más extras por récords y retos. Aquí solo se juega con fichas, nunca con plata de verdad.</p>
      <div class="casgrid">
        ${tile('cas-open', '21', 'Pokémon 21', 'Sume una estadística sin pasarse de 300.', '#2e9e4f')}
        ${tile('cas-open', 'alta', 'Carta alta', 'Su Pokémon contra el de la casa. ¿Qué estadística saldrá?', '#2f6fdb')}
        ${tile('cas-open', 'doble', 'Doble o nada', '¿Más o menos? Cada acierto duplica. Retírese a tiempo.', '#e3350d')}
        ${tile('cas-open', 'rasca', 'Raspadita diaria', done ? `Hoy ya ganó ${s.prize} fichas. Vuelva mañana.` : '¡Una gratis cada día!', '#e8a500', done ? '' : 'GRATIS')}
      </div></main>`;
  }
  const tile = (a, v, t, d, c, badge = '') => `<button class="castile" data-act="${a}" data-val="${v}" style="--cc:${c}"><b class="px">${t}</b><span>${d}</span>${badge ? `<span class="nbadge px">${badge}</span>` : ''}</button>`;

  // ---------- Pokémon 21 ----------
  const TARGET = 300, HOUSE_STOP = 250;
  const sum = hand => hand.reduce((a, c) => a + c.val, 0);
  function deal21() {
    if (bet > chips() || bet <= 0) return;
    take(bet);
    const [label, idx] = randStat(), used = [];
    const draw = () => { const p = randMon(used); used.push(p.id); return { p, val: p.stats[idx] }; };
    g = { game: '21', phase: 'play', label, idx, used, draw, bet, me: [draw(), draw()], house: [draw(), draw()] };
    if (sum(g.me) > TARGET) end21();
    api.render();
  }
  function end21() {
    while (sum(g.me) <= TARGET && sum(g.house) < HOUSE_STOP) g.house.push(g.draw());
    const m = sum(g.me), h = sum(g.house);
    let res, win = 0;
    if (m > TARGET) res = 'Se pasó.';
    else if (h > TARGET) { res = 'La casa se pasó.'; win = m === TARGET ? Math.floor(g.bet * 2.5) : g.bet * 2; }
    else if (m > h) { res = m === TARGET ? `¡${TARGET} exacto!` : 'Le ganó a la casa.'; win = m === TARGET ? Math.floor(g.bet * 2.5) : g.bet * 2; }
    else if (m === h) { res = 'Empate: recupera su apuesta.'; win = g.bet; }
    else res = 'La casa ganó.';
    pay(win);
    g.phase = 'end'; g.res = res; g.win = win;
    api.Sound.play(win > g.bet ? 'juas' : win === g.bet ? 'ok' : 'over');
    api.render();
  }
  function view21() {
    const top = `${head('Pokémon 21')}${chipLine()}`;
    if (g.game !== '21') return `${top}<div class="box"><p class="q">Se reparten Pokémon y se suma una estadística (sale al azar en cada mano). Acérquese a ${TARGET} sin pasarse.</p>
      <p class="hint">La casa pide hasta llegar a ${HOUSE_STOP}. Si gana, cobra el doble; con ${TARGET} exacto, 2,5 veces.</p></div>
      <div class="box field">${betPicker()}<div class="row end"><button class="btn" data-act="c21-deal" ${chips() ? '' : 'disabled'}>Repartir</button></div></div></main>`;
    const hideHouse = g.phase === 'play';
    const hv = hideHouse ? g.house[0].val : sum(g.house);
    return `${top}<div class="box"><span class="hint px catl">Se suma: ${g.label} · Apuesta ${g.bet}</span>
      <p class="l px" style="margin-top:12px">Casa · ${hideHouse ? `${hv} + ?` : hv}</p>
      <div class="pcards">${g.house.map((c, i) => card(c.p, c.val, g.label, hideHouse && i === 1)).join('')}</div>
      <p class="l px" style="margin-top:12px">Usted · ${sum(g.me)}${sum(g.me) > TARGET ? ' · ¡se pasó!' : ''}</p>
      <div class="pcards">${g.me.map(c => card(c.p, c.val, g.label)).join('')}</div>
      ${g.phase === 'play'
        ? `<div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="c21-stand">Plantarse</button><button class="btn" data-act="c21-hit">Pedir otra</button></div>`
        : `<p class="flash ${g.win > g.bet ? 'ok' : g.win === g.bet ? '' : 'bad'} keep">${esc(g.res)} ${g.win > g.bet ? `+${g.win - g.bet} fichas` : g.win === g.bet ? '' : `−${g.bet} fichas`}</p>
           <div class="row end"><button class="btn ghost" data-act="go-casino">Casino</button><button class="btn" data-act="c21-new">Otra mano</button></div>`}</div></main>`;
  }

  // ---------- Carta alta ----------
  function altaDeal() {
    const me = randMon(), house = randMon([me.id]);
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
    api.render();
  }
  function altaView() {
    const top = `${head('Carta alta')}${chipLine()}`;
    if (g.game !== 'alta') return `${top}<div class="box"><p class="q">Le sale un Pokémon y la casa tiene otro escondido. Usted apuesta sin saber qué estadística se va a comparar.</p>
      <p class="hint">Si su Pokémon tiene más, cobra el doble. Si empatan, recupera la apuesta.</p>
      <div class="row end" style="margin-top:12px"><button class="btn" data-act="alta-deal" ${chips() ? '' : 'disabled'}>Repartir</button></div></div></main>`;
    if (g.phase === 'bet') return `${top}<div class="box"><div class="pcards">${card(g.me, null)}${card(g.house, null, '', true)}</div>
      <p class="hint" style="margin-top:10px">Este es su Pokémon. ¿Cuánto le apuesta?</p></div>
      <div class="box field">${betPicker()}<div class="row end"><button class="btn" data-act="alta-reveal" ${chips() ? '' : 'disabled'}>Revelar</button></div></div></main>`;
    return `${top}<div class="box"><span class="hint px catl">Salió: ${g.label}</span>
      <div class="pcards" style="margin-top:10px">${card(g.me, g.m, g.label)}<div class="vsmark px">vs</div>${card(g.house, g.h, g.label)}</div>
      <p class="flash ${g.win > g.bet ? 'ok' : g.win === g.bet ? '' : 'bad'} keep">${g.win > g.bet ? `¡JUAS! +${g.win - g.bet} fichas` : g.win === g.bet ? 'Empate: recupera su apuesta.' : `Diay, no. −${g.bet} fichas`}</p>
      <div class="row end"><button class="btn ghost" data-act="go-casino">Casino</button><button class="btn" data-act="alta-deal">Otra carta</button></div></div></main>`;
  }

  // ---------- Doble o nada ----------
  function dobleStart() {
    if (bet > chips() || bet <= 0) return;
    take(bet);
    const [label, idx] = randStat(), a = randMon();
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
    api.render();
  }
  function dobleView() {
    const top = `${head('Doble o nada')}${chipLine()}`;
    if (g.game !== 'doble') return `${top}<div class="box"><p class="q">Sale un Pokémon con una estadística. ¿El siguiente tiene más o menos? Cada acierto duplica lo que tiene en juego.</p>
      <p class="hint">Puede retirarse cuando quiera con lo ganado. Si falla, lo pierde todo. Si empatan, cuenta como acierto.</p></div>
      <div class="box field">${betPicker()}<div class="row end"><button class="btn" data-act="doble-start" ${chips() ? '' : 'disabled'}>Empezar</button></div></div></main>`;
    const va = g.a.stats[g.idx];
    const last = g.lastB && g.phase === 'play' ? `<p class="flash ok keep">¡Bien! ${esc(g.lastB.p.name)} tenía ${g.lastB.v}. En juego: ${g.pot}</p>` : '';
    if (g.phase !== 'play') {
      const t = g.phase === 'cashed' ? `¡Se retiró con ${g.pot} fichas!` : `Diay, no. ${g.lastB.p.name} tenía ${g.lastB.v}. Perdió ${g.pot}.`;
      return `${top}<div class="box"><p class="verdict px ${g.phase === 'cashed' ? 'ok' : 'bad'}" data-tw="${esc(t)}">${esc(t)}</p>
        <p class="hint">${api.plural(g.streak, 'acierto', 'aciertos')} seguidos con ${g.label}.</p>
        <div class="row end"><button class="btn ghost" data-act="go-casino">Casino</button><button class="btn" data-act="doble-new">Otra vez</button></div></div></main>`;
    }
    return `${top}<div class="box"><span class="hint px catl">${g.label} · en juego ${g.pot} fichas</span>
      <div class="pcards" style="margin-top:10px">${card(g.a, va, g.label)}<div class="vsmark px">?</div>${card(g.b, null)}</div>
      ${last}<p class="q">¿${esc(g.b.name)} tiene más o menos ${g.label} que ${esc(g.a.name)}?</p>
      <div class="row end"><button class="btn ghost" data-act="doble-cash" ${g.streak ? '' : 'disabled'}>Retirarse con ${g.pot}</button><button class="btn" data-act="doble-less">Menos</button><button class="btn" data-act="doble-more">Más</button></div></div></main>`;
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
    const msg = all ? (s.win ? `¡Tres ${s.win === 'corona' ? 'coronas, premio gordo' : s.win}! +${s.prize} fichas` : `Esta vez no hubo tres iguales. Le dejamos ${s.prize} fichas de consuelo.`) : 'Toque las casillas para rasparlas. Tres iguales ganan.';
    return `${head('Raspadita diaria')}${chipLine()}
      <div class="box"><div class="rgrid">${cells}</div>
      <p class="${all ? `flash ${s.win ? 'ok' : ''} keep` : 'hint'}" style="margin-top:12px">${esc(msg)}</p>
      <p class="hint">Premios: 👑 200 · ⭐ 50 · ⚡ 30 · 🔥 20 · 💧 10.</p>
      <div class="row end">${all ? '<button class="btn" data-act="go-casino">Ir al casino</button>' : '<button class="btn ghost" data-act="rasca-all">Raspar todo</button>'}</div></div></main>`;
  }
  function rascar(i) {
    const s = scratchState();
    if (s.date !== api.crDate() || s.claimed) return;
    if (i === 'all') s.open = s.open.map(() => true); else s.open[+i] = true;
    if (s.open.every(Boolean) && !s.claimed) { s.claimed = true; pay(s.prize); api.Sound.play(s.win ? 'rankup' : 'ok'); }
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
      case 'c21-hit': g.me.push(g.draw()); if (sum(g.me) >= TARGET) end21(); else api.render(); return true;
      case 'c21-stand': end21(); return true;
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
    leave: () => { if (g.game === 'doble' && g.phase === 'play') dobleCash(); if (g.game === '21' && g.phase === 'play') end21(); g = {}; },
    scratchDone: () => { const s = scratchState(); return s.date === api.crDate() && s.claimed; },
    scratchPrize: () => scratchState().prize,
  };
}
