// ============================================================
//  Modos cortos de 1 jugador: Pokédle del día, Cadena Pokémon,
//  Tipo contra tipo y Ahorcado. Cada uno guarda su propio estado
//  y se dibuja con las herramientas que le pasa ui.js (api).
// ============================================================
import { rng, typeMultiplier } from './util.js';

export function createMinis(api) {
  const { E, esc, store } = api;
  const ctx = () => api.ctx();
  let st = {};          // estado del modo abierto
  let timer = null;     // reloj de los modos con tiempo

  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
  const startTimer = (fn) => { stopTimer(); timer = setInterval(() => { if (!VIEWS[api.view()]) { stopTimer(); return; } fn(); }, 150); };
  const saveBest = (key, label, score) => {
    const old = api.records().solo[key];
    const isNew = !old || score > old.best;
    if (isNew) api.records().solo[key] = { label, best: score, at: Date.now(), streak: old?.streak || 0 };
    api.saveRecords();
    return { isNew: isNew && score > 0, prev: old ? old.best : null };
  };
  const secs = ms => Math.max(0, Math.ceil(ms / 1000));

  // ---------- Pokédle del día ----------
  const pdAll = () => store.load('pt-pokedle', {});
  function pdSecret(date) {
    const r = rng(E.dailySeed(`pokedle:${date}`));
    const list = ctx().pokemon;
    return list[Math.floor(r.next() * list.length)].id;
  }
  function pdToday() {
    const date = api.crDate(), all = pdAll();
    return { date, rec: all[date] || { guesses: [], done: false, won: false }, secret: pdSecret(date) };
  }
  const PD_MAX = 6;
  const PD_EMO = { ok: '🟩', near: '🟨', no: '🟥', up: '⬆️', down: '⬇️' };
  function pdShare(t) {
    const a = ctx().byId.get(t.secret);
    const lines = t.rec.guesses.map(id => { const f = E.pdFeedback(ctx().byId.get(id), a); return ['t1', 't2', 'gen', 'h', 'w'].map(k => PD_EMO[f[k]]).join(''); });
    const [y, m, d] = t.date.split('-');
    return `JUASmon Pokédle ${d}/${m} · ${t.rec.won ? t.rec.guesses.length : 'X'}/${PD_MAX}\n${lines.join('\n')}`;
  }
  // Leyenda con ejemplos de colores, para que se entienda a la primera.
  const PD_LEGEND = `<div class="pdlegend">
      <span><i class="sw ok"></i>Igual</span>
      <span><i class="sw near"></i>Tiene ese tipo, pero en el otro lugar</span>
      <span><i class="sw no"></i>No coincide</span>
      <span><i class="sw arrow">▲</i>El secreto es mayor</span>
      <span><i class="sw arrow">▼</i>El secreto es menor</span>
    </div>`;
  function pokedleView() {
    const t = pdToday(), a = ctx().byId.get(t.secret), cx = ctx();
    const tile = (label, inner, f) => `<div class="pdtile ${f}"><small>${label}</small><span>${inner}</span></div>`;
    const cards = t.rec.guesses.slice().reverse().map(id => {
      const g = cx.byId.get(id), f = E.pdFeedback(g, a), arrow = k => f[k] === 'up' ? ' ▲' : f[k] === 'down' ? ' ▼' : '';
      return `<div class="pdcard"><b>${esc(g.name)}</b><div class="pdtiles">
        ${tile('Tipo 1', cx.typeName.get(g.types[0]), f.t1)}
        ${tile('Tipo 2', g.types[1] ? cx.typeName.get(g.types[1]) : '—', f.t2)}
        ${tile('Gen', `${g.gen}${arrow('gen')}`, f.gen === 'ok' ? 'ok' : 'no')}
        ${tile('Altura', `${(g.h / 10).toLocaleString('es')} m${arrow('h')}`, f.h === 'ok' ? 'ok' : 'no')}
        ${tile('Peso', `${(g.w / 10).toLocaleString('es')} kg${arrow('w')}`, f.w === 'ok' ? 'ok' : 'no')}
      </div></div>`;
    }).join('');
    const left = PD_MAX - t.rec.guesses.length;
    let top;
    if (!t.rec.done) {
      top = `<div class="box"><p class="q">Adivine el Pokémon secreto de hoy en ${PD_MAX} intentos. Es el mismo para todos y cambia a medianoche, hora de Costa Rica.</p>
        <p class="hint">Cada intento le da pistas comparando su Pokémon con el secreto:</p>${PD_LEGEND}</div>
        <div class="box field"><input class="input" id="typed" data-ac="pokemon" autocomplete="off" placeholder="Escriba un Pokémon">
        <div class="row between"><span class="hint">${api.plural(left, 'intento restante', 'intentos restantes')}</span><button class="btn" data-act="pdd-send">Adivinar</button></div>
        ${st.msg ? `<p class="flash bad keep">${esc(st.msg)}</p>` : ''}</div>`;
    } else {
      const title = t.rec.won ? `¡JUAS! En ${api.plural(t.rec.guesses.length, 'intento', 'intentos')}` : `Diay, no. Era ${a.name}`;
      top = `<div class="box result"><p class="verdict px ${t.rec.won ? 'ok' : 'bad'}" data-tw="${esc(title)}">${esc(title)}</p>
        <div class="row" style="gap:14px;margin:6px 0 10px"><span class="dex px">#${String(a.id).padStart(4, '0')}</span><span class="name">${esc(a.name)}</span>${api.typePills(a)}</div>
        <pre class="share">${esc(pdShare(t))}</pre>
        <div class="row end"><button class="btn ghost" data-act="go-hoy">Volver a Hoy</button><button class="btn" data-act="pdd-share">Compartir</button></div>
        <p class="hint">Mañana hay otro.</p></div>`;
    }
    return `${api.screenHead('Pokédle del día', 'hoy')}<main class="${api.F().newScreen ? 'enter' : ''}">${top}${cards ? `<div class="pdcards">${cards}</div>` : ''}</main>`;
  }
  function pdGuess(text) {
    const t = pdToday();
    if (t.rec.done) return;
    const key = E.matchKey(ctx(), 'pokemon', text);
    if (!key) { st.msg = `No es un Pokémon: ${text.slice(0, 30)}`; api.render(); return; }
    const id = +key;
    if (t.rec.guesses.includes(id)) { st.msg = `Ya lo intentó: ${ctx().byId.get(id).name}`; api.render(); return; }
    st.msg = '';
    t.rec.guesses.push(id);
    t.rec.won = id === t.secret;
    t.rec.done = t.rec.won || t.rec.guesses.length >= PD_MAX;
    const all = pdAll(); all[t.date] = t.rec; store.save('pt-pokedle', all);
    if (t.rec.done) {
      if (t.rec.won) { api.Sound.play('juas'); const f = api.addFichas(10); api.toast(`+₡${f} para el casino`); } else api.Sound.play('wrong');
    } else api.Sound.play('wrong');
    api.render();
    setTimeout(() => document.getElementById('typed')?.focus(), 30);
  }

  // ---------- Tipo contra tipo ----------
  const TVT_TIME = 30000;
  const MULTS = [4, 2, 1, 0.5, 0.25, 0];
  const multLabel = m => m === 0.5 ? '×½' : m === 0.25 ? '×¼' : `×${m}`;
  function tvtQuestion() {
    const types = ctx().types.map(t => t.id);
    const r = Math.random, pick = () => types[Math.floor(r() * types.length)];
    const atk = pick(), d1 = pick();
    let def = [d1];
    if (r() < 0.5) { let d2 = pick(); while (d2 === d1) d2 = pick(); def = [d1, d2]; }
    return { atk, def, ans: typeMultiplier(ctx(), atk, def) };
  }
  function tvtStart() {
    st = { mode: 'tipos', phase: 'play', score: 0, miss: 0, end: Date.now() + TVT_TIME, q: tvtQuestion(), last: null };
    startTimer(() => {
      const left = st.end - Date.now();
      const el = document.getElementById('tvt-time'), bar = document.getElementById('tvt-bar');
      if (el) el.textContent = secs(left);
      if (bar) bar.style.width = `${Math.max(0, left / TVT_TIME * 100)}%`;
      api.hurry(left > 0 && left <= 5000);
      if (left <= 0) tvtEnd();
    });
    api.render();
  }
  function tvtEnd() {
    stopTimer(); api.hurry(false);
    st.phase = 'end';
    st.rec = saveBest('tipos', 'Tipo contra tipo · 30 s', st.score);
    st.fichas = api.addFichas(Math.floor(st.score / 2));
    api.Sound.play(st.rec.isNew ? 'rankup' : 'over');
    api.render();
  }
  function tiposView() {
    const head = api.screenHead('Tipo contra tipo', 'modos');
    if (st.mode !== 'tipos' || st.phase === 'intro') {
      const best = api.records().solo.tipos;
      return `${head}<main class="enter"><div class="box intro"><p class="q">Sale un tipo atacando a un Pokémon de uno o dos tipos. Toque rapidito cuánto le hace: ×4, ×2, ×1, ×½, ×¼ o ×0.</p>
        <p class="hint">Tiene 30 segundos. Cada acierto suma 1. ${best ? `Su récord: ${best.best}.` : 'Todavía no tiene récord.'}</p>
        <div class="row end" style="margin-top:12px"><button class="btn" data-act="tvt-start" id="nextbtn">¡Vamos!</button></div></div></main>`;
    }
    if (st.phase === 'end') {
      const title = st.rec.isNew ? `¡Nuevo récord! ${st.score}` : `${st.score} ${st.score === 1 ? 'acierto' : 'aciertos'}`;
      return `${head}<main class="enter"><div class="box intro"><p class="big px" data-tw="${esc(title)}">${esc(title)}</p>
        <p class="hint">${st.miss ? `${api.plural(st.miss, 'fallo', 'fallos')}. ` : ''}${st.rec.prev !== null && !st.rec.isNew ? `Su récord sigue siendo ${st.rec.prev}.` : ''}${st.fichas ? ` +₡${st.fichas} para el casino.` : ''}</p>
        <div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="go-modos">Más modos</button><button class="btn" data-act="tvt-start" id="nextbtn">Otra vez</button></div></div></main>`;
    }
    const q = st.q, left = st.end - Date.now();
    const last = st.last ? `<p class="flash ${st.last.ok ? 'ok' : 'bad'} keep">${st.last.ok ? '¡JUAS!' : `Diay, no. Era ${multLabel(st.last.ans)}`}</p>` : '<p class="flash keep">&nbsp;</p>';
    return `${head}<main class="tvt">
      <div class="timer px"><span>Aciertos: ${st.score}</span><div class="hp"><i id="tvt-bar" style="width:${left / TVT_TIME * 100}%"></i></div><span id="tvt-time">${secs(left)}</span></div>
      <div class="box tvtq"><div class="tvtrow"><span class="hint">Ataque</span>${api.badge(q.atk)}</div><div class="tvtvs px">contra</div><div class="tvtrow"><span class="hint">Pokémon</span>${q.def.map(api.badge).join('')}</div></div>
      ${last}
      <div class="tvtopts">${MULTS.map(m => `<button class="opt tvto" data-act="tvt-ans" data-val="${m}">${multLabel(m)}</button>`).join('')}</div>
    </main>`;
  }
  function tvtAnswer(m) {
    if (st.phase !== 'play') return;
    const ok = m === st.q.ans;
    if (ok) { st.score++; api.Sound.play('ok'); } else { st.miss++; api.Sound.play('wrong'); }
    st.last = { ok, ans: st.q.ans };
    st.q = tvtQuestion();
    api.render();
  }

  // ---------- Cadena Pokémon ----------
  const CAD_TURN = 20000;
  const lettersOf = name => E.normalize(name).replace(/[^a-z]/g, '');
  function cadLetter(id) {
    const w = lettersOf(ctx().byId.get(id).name);
    // Si ningún Pokémon libre empieza con la última letra, vale la penúltima.
    for (let i = w.length - 1; i >= 0; i--) if (cadFree(w[i]).length) return w[i];
    return w[w.length - 1];
  }
  const cadFree = L => ctx().pokemon.filter(p => !st.used?.has(p.id) && lettersOf(p.name)[0] === L);
  function cadStart() {
    const all = ctx().pokemon;
    const first = all[Math.floor(Math.random() * all.length)];
    st = { mode: 'cadena', phase: 'play', chain: [{ id: first.id, who: 'app' }], used: new Set([first.id]), mine: 0, msg: '', deadline: Date.now() + CAD_TURN, turn: 'yo' };
    st.letter = cadLetter(first.id);
    cadClock();
    api.render();
    setTimeout(() => document.getElementById('typed')?.focus(), 50);
  }
  function cadClock() {
    startTimer(() => {
      if (st.turn !== 'yo' || st.phase !== 'play') return;
      const left = st.deadline - Date.now();
      const el = document.getElementById('cad-time'), bar = document.getElementById('cad-bar');
      if (el) el.textContent = secs(left);
      if (bar) bar.style.width = `${Math.max(0, left / CAD_TURN * 100)}%`;
      api.hurry(left > 0 && left <= 5000);
      if (left <= 0) cadEnd(false, 'Se le acabó el tiempo.');
    });
  }
  function cadEnd(won, why) {
    stopTimer(); api.hurry(false);
    st.phase = 'end'; st.won = won; st.why = why;
    st.rec = saveBest('cadena', 'Cadena Pokémon', st.mine);
    st.fichas = api.addFichas(st.mine + (won ? 5 : 0));
    api.Sound.play(won ? 'rankup' : 'over');
    api.render();
  }
  function cadSend(text) {
    if (st.phase !== 'play' || st.turn !== 'yo') return;
    const key = E.matchKey(ctx(), 'pokemon', text);
    if (!key) { st.msg = `No es un Pokémon: ${text.slice(0, 30)}`; api.render(); return; }
    const p = ctx().byId.get(+key);
    if (st.used.has(p.id)) { st.msg = `${p.name} ya salió.`; api.render(); return; }
    if (lettersOf(p.name)[0] !== st.letter) { st.msg = `${p.name} no empieza con ${st.letter.toUpperCase()}.`; api.render(); return; }
    st.msg = ''; st.used.add(p.id); st.chain.push({ id: p.id, who: 'yo' }); st.mine++;
    api.Sound.play('ok');
    st.turn = 'app'; st.letter = cadLetter(p.id); api.hurry(false);
    api.render();
    setTimeout(cadApp, 1500);
  }
  function cadApp() {
    if (st.mode !== 'cadena' || st.phase !== 'play') return;
    const free = cadFree(st.letter);
    // La app se va cansando: mientras más larga la cadena, más fácil que se quede pegada.
    if (!free.length || Math.random() < Math.min(0.4, 0.015 * st.mine)) { cadEnd(true, `La app se quedó pegada con la ${st.letter.toUpperCase()}.`); return; }
    const p = free[Math.floor(Math.random() * free.length)];
    st.used.add(p.id); st.chain.push({ id: p.id, who: 'app' });
    st.letter = cadLetter(p.id); st.turn = 'yo'; st.deadline = Date.now() + CAD_TURN;
    api.render();
    setTimeout(() => document.getElementById('typed')?.focus(), 30);
  }
  function cadenaView() {
    const head = api.screenHead('Cadena Pokémon', 'modos');
    if (st.mode !== 'cadena') {
      const best = api.records().solo.cadena;
      return `${head}<main class="enter"><div class="box intro"><p class="q">Usted contra la app: por turnos, se turnan para decir un Pokémon que empiece con la última letra del anterior. Por ejemplo: usted dice Pikachu, la app contesta Umbreon y usted sigue con uno que empiece con N.</p>
        <p class="hint">Tiene 20 segundos por turno y no se puede repetir. Pierde quien se quede pegado. ${best ? `Su récord: ${best.best} seguidos.` : ''}</p>
        <div class="row end" style="margin-top:12px"><button class="btn" data-act="cad-start" id="nextbtn">¡Vamos!</button></div></div></main>`;
    }
    const cx = ctx();
    const shown = st.chain.slice(-12);
    const chips = shown.map((c, i) => `<span class="chip2 ${c.who}${i === shown.length - 1 && st.phase === 'play' ? ' last keep' : ''}" style="--c:${c.who === 'yo' ? 'var(--blue)' : 'var(--red)'}">${esc(cx.byId.get(c.id).name)}</span>`).join('<span class="arrow" aria-hidden="true">→</span>');
    const legend = '<p class="cadleg"><span style="--c:var(--blue)">Usted</span><span style="--c:var(--red)">La app</span></p>';
    if (st.phase === 'end') {
      const title = st.won ? '¡Le ganó a la app!' : 'Diay, se quedó pegado';
      return `${head}<main class="enter"><div class="box intro"><p class="big px" data-tw="${esc(title)}">${esc(title)}</p>
        <p class="q">${esc(st.why)} ${api.plural(st.mine, 'Pokémon suyo', 'Pokémon suyos')} en la cadena.</p>
        <p class="hint">${st.rec.isNew ? '¡Nuevo récord!' : st.rec.prev !== null ? `Su récord: ${st.rec.prev}.` : ''}${st.fichas ? ` +₡${st.fichas} para el casino.` : ''}</p>
        <div class="chips cadchips" style="margin-top:10px">${chips}</div>
        <div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="go-modos">Más modos</button><button class="btn" data-act="cad-start" id="nextbtn">Otra vez</button></div></div></main>`;
    }
    const left = st.deadline - Date.now();
    return `${head}<main>
      <div class="timer px"><span>${st.turn === 'yo' ? 'Su turno' : 'Turno de la app…'}</span><div class="hp"><i id="cad-bar" style="width:${st.turn === 'yo' ? Math.max(0, left / CAD_TURN * 100) : 100}%"></i></div><span id="cad-time">${st.turn === 'yo' ? secs(left) : ''}</span></div>
      <div class="box">${legend}<div class="chips cadchips">${chips}</div></div>
      <div class="box field">${st.turn === 'yo'
        ? `<p class="hint cadsaid keep">${st.chain.length === 1 ? 'La app empezó con' : 'La app dijo'} <b>${esc(cx.byId.get(st.chain[st.chain.length - 1].id).name)}</b>.</p><p class="q">Ahora usted: un Pokémon que empiece con <b class="bigletter px">${st.letter.toUpperCase()}</b></p>`
        : `<p class="q cadthink keep">La app está buscando uno con <b class="bigletter px">${st.letter.toUpperCase()}</b>…</p>`}
        <div class="row"><input class="input" id="typed" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${st.turn === 'yo' ? 'Escriba un Pokémon' : 'Espere su turno…'}" style="flex:1" ${st.turn === 'yo' ? '' : 'disabled'}><button class="btn" data-act="cad-send" ${st.turn === 'yo' ? '' : 'disabled'}>Enviar</button></div>
        ${st.msg ? `<p class="flash bad keep">${esc(st.msg)}</p>` : ''}<p class="hint">Lleva ${st.mine}.</p></div>
    </main>`;
  }

  // ---------- Ahorcado ----------
  const ALPHA = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
  const baseLetter = ch => { const u = ch.toUpperCase(); return u === 'Ñ' ? 'Ñ' : u.normalize('NFD')[0]; };
  const isLetter = ch => /[a-zñáéíóúü]/i.test(ch);
  function ahWord() {
    const cx = ctx(), w = cx.world, ex = cx.extra || {};
    const sources = [
      ['Pokémon', cx.pokemon.map(p => p.name)],
      ['Movimiento', (ex.moves || []).map(m => m.name)],
      ['Habilidad', Object.values(ex.abilities || {})],
      ['Líder de gimnasio', w.lideres.map(l => l.name)],
      ['Ciudad o pueblo', [...new Set(w.lideres.map(l => l.city))]],
      ['Región', w.regiones.map(g => g.name)],
    ];
    for (let i = 0; i < 30; i++) {
      const [cat, list] = sources[Math.floor(Math.random() * sources.length)];
      const word = list[Math.floor(Math.random() * list.length)];
      const n = [...word].filter(isLetter).length;
      if (word && n >= 4 && word.length <= 18 && !st.seen?.has(word)) return { cat, word };
    }
    return { cat: 'Pokémon', word: 'Pikachu' };
  }
  function ahStart(keep = false) {
    const prev = keep && st.mode === 'ahorcado' ? st : null;
    st = { mode: 'ahorcado', phase: 'play', words: prev ? prev.words : 0, seen: prev ? prev.seen : new Set(), guessed: new Set(), errors: 0 };
    Object.assign(st, ahWord());
    st.seen.add(st.word);
    api.render();
  }
  const ahSolved = () => [...st.word].every(ch => !isLetter(ch) || st.guessed.has(baseLetter(ch)));
  function ahGuess(L) {
    if (st.phase !== 'play' || st.guessed.has(L)) return;
    st.guessed.add(L);
    const hit = [...st.word].some(ch => isLetter(ch) && baseLetter(ch) === L);
    if (hit) api.Sound.play('ok'); else { st.errors++; api.Sound.play('wrong'); }
    if (ahSolved()) { st.phase = 'won'; st.words++; st.fichas = api.addFichas(3); api.Sound.play('juas'); }
    else if (st.errors >= 6) {
      st.phase = 'lost';
      st.rec = saveBest('ahorcado', 'Ahorcado · palabras seguidas', st.words);
      api.Sound.play('over');
    }
    api.render();
  }
  function gallows(errors, phase) {
    // Ahorcado clásico pixelado: la horca siempre está; con cada error aparece una parte del muñeco.
    const R = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
    const wood = '#a0743c', ink = 'var(--ink)';
    let g = R(4, 44, 30, 3, wood) + R(10, 4, 3, 40, wood) + R(10, 4, 28, 3, wood) + R(13, 7, 3, 3, wood) + R(16, 10, 3, 3, wood) + R(36, 7, 2, 6, '#c9b08a');
    const parts = [
      // cabeza (con cara cuando pierde o gana)
      R(33, 13, 8, 2, ink) + R(31, 15, 2, 6, ink) + R(41, 15, 2, 6, ink) + R(33, 21, 8, 2, ink) +
        (phase === 'lost' ? R(34, 16, 1, 1, ink) + R(36, 16, 1, 1, ink) + R(35, 17, 1, 1, ink) + R(34, 18, 1, 1, ink) + R(36, 18, 1, 1, ink) + R(37, 16, 1, 1, ink) + R(39, 16, 1, 1, ink) + R(38, 17, 1, 1, ink) + R(37, 18, 1, 1, ink) + R(39, 18, 1, 1, ink)
          : R(34, 17, 2, 2, ink) + R(38, 17, 2, 2, ink)),
      R(36, 23, 2, 11, ink),                                   // cuerpo
      R(34, 25, 2, 2, ink) + R(32, 27, 2, 2, ink) + R(30, 29, 2, 2, ink), // brazo izquierdo
      R(38, 25, 2, 2, ink) + R(40, 27, 2, 2, ink) + R(42, 29, 2, 2, ink), // brazo derecho
      R(34, 34, 2, 3, ink) + R(32, 37, 2, 3, ink) + R(30, 40, 2, 2, ink), // pierna izquierda
      R(38, 34, 2, 3, ink) + R(40, 37, 2, 3, ink) + R(42, 40, 2, 2, ink), // pierna derecha
    ];
    for (let i = 0; i < Math.min(errors, 6); i++) g += `<g class="${i === errors - 1 && phase === 'play' ? 'ahnew keep' : ''}">${parts[i]}</g>`;
    return `<svg class="ahfig${phase === 'lost' ? ' ahlost keep' : ''}" viewBox="0 0 48 48" shape-rendering="crispEdges" aria-label="${errors} de 6 errores">${g}</svg>`;
  }
  function ahorcadoView() {
    const head = api.screenHead('Ahorcado', 'modos');
    if (st.mode !== 'ahorcado') {
      const best = api.records().solo.ahorcado;
      return `${head}<main class="enter"><div class="box intro"><p class="q">Adivine la palabra letra por letra. Puede ser un Pokémon, un movimiento, una habilidad, un líder, una ciudad o una región.</p>
        <p class="hint">Tiene 6 errores: con cada uno se va dibujando el ahorcado. Siga adivinando palabras hasta que pierda una. ${best ? `Su récord: ${best.best} seguidas.` : ''}</p>
        <div class="row end" style="margin-top:12px"><button class="btn" data-act="ah-start" id="nextbtn">¡Vamos!</button></div></div></main>`;
    }
    // Cada palabra va junta en su propio bloque (nunca se parte a la mitad) y las letras se achican si la palabra es larga.
    const cell = ch => !isLetter(ch) ? `<span class="ahc sep">${esc(ch)}</span>` : `<span class="ahc ${st.phase === 'lost' && !st.guessed.has(baseLetter(ch)) ? 'miss' : ''}">${st.guessed.has(baseLetter(ch)) || st.phase === 'lost' ? esc(ch.toUpperCase()) : '&nbsp;'}</span>`;
    const parts = st.word.split(' ').filter(Boolean);
    const longest = Math.max(...parts.map(w => [...w].length));
    const show = parts.map(w => `<span class="ahw">${[...w].map(cell).join('')}</span>`).join('');
    const keys = ALPHA.map(L => {
      const used = st.guessed.has(L), hit = used && [...st.word].some(ch => isLetter(ch) && baseLetter(ch) === L);
      return `<button class="ahk ${used ? (hit ? 'hit' : 'no') : ''}" data-act="ah-key" data-val="${L}" ${used || st.phase !== 'play' ? 'disabled' : ''}>${L}</button>`;
    }).join('');
    let foot = '';
    if (st.phase === 'won') foot = `<p class="flash ok keep">¡JUAS! Era ${esc(st.word)}. +₡${st.fichas}</p><div class="row end"><button class="btn" data-act="ah-next" id="nextbtn">Siguiente palabra</button></div>`;
    if (st.phase === 'lost') foot = `<p class="flash bad keep">¡Se despichó tere! Era ${esc(st.word)}.</p><p class="hint">${api.plural(st.words, 'palabra seguida', 'palabras seguidas')}. ${st.rec.isNew ? '¡Nuevo récord!' : st.rec.prev !== null ? `Su récord: ${st.rec.prev}.` : ''}</p>
      <div class="row end"><button class="btn ghost" data-act="go-modos">Más modos</button><button class="btn" data-act="ah-start" id="nextbtn">Otra vez</button></div>`;
    return `${head}<main>
      <div class="box ahbox"><div class="row between"><span class="hint px catl">${esc(st.cat)}</span><span class="hint">Lleva ${st.words} · ${6 - st.errors} ${6 - st.errors === 1 ? 'vida' : 'vidas'}</span></div>
        ${gallows(st.errors, st.phase)}<div class="ahword" style="--n:${longest}">${show}</div>${foot}</div>
      <div class="ahkeys">${keys}</div>
    </main>`;
  }

  // ---------- conexiones con ui.js ----------
  const VIEWS = { pokedleDia: pokedleView, tipos: tiposView, cadena: cadenaView, ahorcado: ahorcadoView };
  function open(view) {
    stopTimer(); api.hurry(false);
    if (view === 'pokedleDia') st = { mode: 'pokedle', msg: '' };
    else st = { mode: null };
    api.goto(view);
  }
  function act(a, v) {
    switch (a) {
      case 'pdd-send': { const t = document.getElementById('typed')?.value.trim(); if (t) pdGuess(t); return true; }
      case 'pdd-share': {
        const text = pdShare(pdToday());
        if (navigator.share) navigator.share({ text }).catch(() => {});
        else navigator.clipboard?.writeText(text).then(() => api.toast('Copiado. Péguelo en WhatsApp.'), () => {});
        return true;
      }
      case 'tvt-start': tvtStart(); return true;
      case 'tvt-ans': tvtAnswer(+v); return true;
      case 'cad-start': cadStart(); return true;
      case 'cad-send': { const t = document.getElementById('typed')?.value.trim(); if (t) cadSend(t); return true; }
      case 'ah-start': ahStart(false); return true;
      case 'ah-next': ahStart(true); return true;
      case 'ah-key': ahGuess(v); return true;
    }
    return false;
  }
  // Enter en el cuadro de texto
  function enter() {
    const v = api.view(), t = document.getElementById('typed')?.value.trim();
    if (!t) return;
    if (v === 'pokedleDia') pdGuess(t);
    if (v === 'cadena') cadSend(t);
  }
  function key(k) {
    if (api.view() === 'ahorcado' && st.phase === 'play') { const L = baseLetter(k); if (ALPHA.includes(L) && k.length === 1) { ahGuess(L); return true; } }
    if (api.view() === 'tipos' && st.phase === 'play') { const m = { 1: 4, 2: 2, 3: 1, 4: 0.5, 5: 0.25, 6: 0 }[k]; if (m !== undefined) { tvtAnswer(m); return true; } }
    return false;
  }
  return {
    VIEWS, open, act, enter, key, stop: () => { stopTimer(); api.hurry(false); },
    pokedleStatus: () => { const t = pdToday(); return t.rec.done ? (t.rec.won ? `Lo sacó en ${t.rec.guesses.length}` : 'Hoy no salió') : t.rec.guesses.length ? `${t.rec.guesses.length} de ${PD_MAX} intentos` : null; },
    pokedleDone: () => pdToday().rec.done,
  };
}
