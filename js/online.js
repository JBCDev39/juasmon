// ============================================================
//  DUELOS EN LÍNEA (2 jugadores, en vivo) con Firebase.
//  - Una sala por código (ej. JUAS-7K2M). El que la crea es el anfitrión.
//  - Duelo de preguntas: los dos responden la misma pregunta a la vez;
//    el anfitrión genera las preguntas y califica a los dos.
//  - Cadena Pokémon: por turnos, cada uno escribe en su turno.
//  Todo lo de la sala vive en salas/{código} en Firestore.
// ============================================================
export function createOnline(api) {
  const { E, esc, store } = api;
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const ctx = () => api.ctx();
  let room = null, code = null, unsub = null;
  let joinMsg = '', busy = false, pendingJoin = null;
  let shadow = null;                   // generador de preguntas del anfitrión
  const timers = {};                   // relojes del anfitrión
  let shownQi = -1, shownAt = 0;       // cuándo vi la pregunta (para medir mi velocidad)
  let answeredQi = -1, readyQi = -1;
  let recordedSeed = null;
  let turnSeq = -1, turnSeenAt = 0, cadTimer = null, cadMsg = '';

  const live = () => !!api.db()?.live;
  const salas = () => api.db().collection('salas');
  const uid = () => api.uid();
  const isHost = () => room && room.host === uid();
  const meIdx = () => (room && room.players[1]?.uid === uid() ? 1 : 0);
  const rival = () => room?.players[1 - meIdx()];
  const pretty = c => `JUAS-${c}`;
  const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
  const upd = data => salas().doc(code).update({ ...data, updated: Date.now() }).catch(e => api.toast('No se pudo conectar con la sala.'));
  const schedule = (key, ms, fn) => { if (timers[key]) return; timers[key] = setTimeout(() => { delete timers[key]; fn(); }, ms); };
  const clearTimers = () => { for (const k in timers) { clearTimeout(timers[k]); delete timers[k]; } };

  function meEntry() {
    const p = api.profile();
    return { uid: uid(), name: p.name, color: p.color || '#e3350d', icon: p.icon || 'estrella' };
  }
  const DEFAULT_CFG = { n: 10, timer: 20, preset: 'todo', gens: [1, 2, 3, 4, 5, 6, 7, 8, 9], idioma: 'opciones' };
  const PRESETS = {
    todo: ['Todo', E.DUEL_FORMATS],
    clasico: ['Clásico', ['preguntas', 'vf', 'masomenos', 'intruso', 'pokedex', 'idioma']],
    rapido: ['Rápido', ['vf', 'masomenos', 'preguntas', 'intruso', 'multi']],
    escribir: ['A escribir', ['escribir', 'idioma', 'pokedex', 'estimacion']],
  };
  const GENSETS = { all: ['Todas', [1, 2, 3, 4, 5, 6, 7, 8, 9]], clasicas: ['Clásicas (1–4)', [1, 2, 3, 4]], nuevas: ['Nuevas (5–9)', [5, 6, 7, 8, 9]] };
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

  // ---------- entrar y salir de salas ----------
  async function create() {
    if (!live()) return;
    let c = null;
    for (let t = 0; t < 6; t++) {
      const k = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      if (!(await salas().doc(k).get().catch(() => null))) { c = k; break; }
    }
    if (!c) { api.toast('No se pudo crear la sala. Intente otra vez.'); return; }
    code = c;
    const data = {
      code: c, host: uid(), guest: null, players: [meEntry()], status: 'lobby', mode: 'duelo', cfg: { ...DEFAULT_CFG },
      seed: 0, qi: -1, phase: 'lobby', qJson: '', ans: {}, res: {}, scores: [0, 0], logJson: '[]', ready: {}, rematch: {},
      chainJson: '[]', turn: 0, letter: '', seq: 0, winner: null, why: '', updated: Date.now(),
    };
    try { await salas().doc(c).set(data); } catch { api.toast('No se pudo crear la sala.'); return; }
    room = data; store.save('pt-sala', c);
    watch(c);
    api.goto('sala');
  }
  async function join(raw) {
    if (!live()) return;
    const c = String(raw || '').toUpperCase().replace(/^JUAS[-\s]*/, '').replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (c.length !== 4) { joinMsg = 'El código tiene 4 letras o números, por ejemplo JUAS-7K2M.'; api.render(); return; }
    const r = await salas().doc(c).get().catch(() => null);
    if (!r || r.status === 'closed') { joinMsg = `No existe la sala ${pretty(c)}.`; api.render(); return; }
    code = c;
    if (r.host !== uid() && r.guest !== uid()) {
      if (r.guest || r.status !== 'lobby') { joinMsg = 'Esa sala ya está llena o ya empezó.'; code = null; api.render(); return; }
      try { await salas().doc(c).update({ guest: uid(), players: [r.players[0], meEntry()], updated: Date.now() }); }
      catch { joinMsg = 'No se pudo entrar a la sala.'; code = null; api.render(); return; }
    }
    joinMsg = ''; store.save('pt-sala', c);
    watch(c);
    api.goto('sala');
  }
  function watch(c) {
    if (unsub) unsub();
    unsub = salas().doc(c).watch(onRoom, () => api.toast('Se perdió la conexión con la sala.'));
  }
  function leaveLocal(msg) {
    if (unsub) unsub();
    unsub = null; room = null; code = null; shadow = null; clearTimers(); stopCad();
    store.del('pt-sala');
    if (api.getState()?.online) api.setState(null);
    if (msg) api.toast(msg);
    if (['sala', 'game', 'cadenaOnline'].includes(api.view())) api.goto('online');
  }
  function leave() {
    if (code && room) salas().doc(code).update({ status: 'closed', closedBy: uid(), updated: Date.now() }).catch(() => {});
    leaveLocal('');
  }

  // ---------- llega un cambio de la sala ----------
  function onRoom(data) {
    const prev = room;
    room = data;
    if (!data) { leaveLocal('La sala ya no existe.'); return; }
    if (data.status === 'closed') { leaveLocal(data.closedBy === uid() ? '' : `${rival()?.name || 'Su rival'} salió de la sala.`); return; }
    if (!data.players.some(p => p.uid === uid())) { leaveLocal('Ya no está en esa sala.'); return; }
    const v = api.view();
    if (data.status === 'lobby') {
      if (prev && prev.players.length < 2 && data.players.length === 2 && isHost()) { api.Sound.play('start'); api.toast(`¡${data.players[1].name} entró a la sala!`); }
      if (v === 'game' || v === 'cadenaOnline') api.goto('sala'); else if (v === 'sala') api.render();
    } else if (data.mode === 'duelo') {
      duelSync(prev);
      if (v !== 'game') api.goto('game'); else api.render();
    } else if (data.mode === 'cadena') {
      cadSync(prev);
      if (v !== 'cadenaOnline') api.goto('cadenaOnline'); else api.render();
    }
    if (isHost()) hostTick();
  }

  // ---------- anfitrión: arranca, califica y avanza ----------
  function engineConfig(cfg) {
    return { formats: PRESETS[cfg.preset]?.[1] || E.DUEL_FORMATS, gens: cfg.gens, cats: Object.keys(E.CATS), idiomaMode: cfg.idioma };
  }
  async function start() {
    if (!isHost() || room.players.length < 2) return;
    const seed = (Math.random() * 2 ** 31) >>> 0;
    clearTimers(); recordedSeed = null;
    if (room.mode === 'cadena') {
      const all = ctx().pokemon, first = all[Math.floor(Math.random() * all.length)];
      const chain = [{ id: first.id, p: -1 }];
      await upd({ status: 'play', seed, chainJson: JSON.stringify(chain), turn: Math.floor(Math.random() * 2), letter: nextLetter(chain), seq: 1, winner: null, why: '', rematch: {}, scores: [0, 0] });
      return;
    }
    shadow = E.duelNext(E.duelShadow(engineConfig(room.cfg), seed, api.history()), ctx());
    await upd({ status: 'play', seed, qi: 0, phase: 'question', qJson: JSON.stringify(shadow.q), ans: {}, res: {}, ready: {}, scores: [0, 0], logJson: '[]', rematch: {} });
  }
  function hostTick() {
    const r = room;
    if (r.status === 'end') {
      if (r.players.every(p => r.rematch?.[p.uid])) start();
      return;
    }
    if (r.status !== 'play' || r.mode !== 'duelo') return;
    if (r.phase === 'question') {
      if (r.players.every(p => r.ans?.[p.uid])) grade();
      else schedule(`q${r.seed}-${r.qi}`, (r.cfg.timer || 20) * 1000 + 4000, () => { if (room?.phase === 'question' && room.qi === r.qi && room.seed === r.seed) grade(); });
    } else if (r.phase === 'reveal') {
      if (r.players.every(p => r.ready?.[p.uid] === r.qi)) advance();
      else schedule(`r${r.seed}-${r.qi}`, 12000, () => { if (room?.phase === 'reveal' && room.qi === r.qi && room.seed === r.seed) advance(); });
    }
  }
  async function grade() {
    if (busy || room.phase !== 'question') return;
    busy = true;
    const r = room, q = parseJ(r.qJson, null);
    const out = r.players.map((p, i) => {
      const a = r.ans?.[p.uid], v = a ? parseJ(a.v, null) : null;
      const g = v === null || v === undefined ? { points: 0, timeout: true } : E.gradeOne(q, ctx(), v);
      return { i, uid: p.uid, base: g.points, err: g.err ?? null, ms: a ? a.ms : Infinity, timeout: !!g.timeout };
    });
    // Medio punto extra: al más rápido en acertar (en la estimación, al más cercano).
    let bonus = null;
    if (q.kind === 'estimacion') {
      const ok = out.filter(x => x.base > 0 && x.err !== null);
      if (ok.length) bonus = ok.reduce((a, b) => (b.err < a.err ? b : a));
      if (ok.length === 2 && ok[0].err === ok[1].err) bonus = null;
    } else {
      const ok = out.filter(x => x.base >= 1);
      if (ok.length) bonus = ok.reduce((a, b) => (b.ms < a.ms ? b : a));
    }
    const res = {}, scores = r.scores.slice(), log = parseJ(r.logJson, []);
    for (const x of out) {
      const p = x.base + (bonus === x ? 0.5 : 0);
      res[x.uid] = { p, base: x.base, ms: Number.isFinite(x.ms) ? x.ms : null, timeout: x.timeout, bonus: bonus === x };
      scores[x.i] += p;
      log.push({ player: x.i, kind: q.kind, correct: x.base >= 1, points: p, id: q.ids?.[0] ?? null });
    }
    await upd({ phase: 'reveal', res, scores, logJson: JSON.stringify(log) });
    busy = false;
  }
  async function advance() {
    if (busy || room.phase !== 'reveal') return;
    busy = true;
    const r = room;
    if (r.qi + 1 >= r.cfg.n) { await upd({ status: 'end', phase: 'end' }); busy = false; return; }
    if (!shadow || shadow.seed !== r.seed) shadow = E.duelShadow(engineConfig(r.cfg), r.seed + r.qi, api.history());
    shadow = E.duelNext(shadow, ctx());
    await upd({ qi: r.qi + 1, phase: 'question', qJson: JSON.stringify(shadow.q), ans: {}, res: {}, ready: {} });
    busy = false;
  }

  // ---------- duelo: el estado que dibuja ui.js ----------
  function duelSync(prev) {
    const r = room, me = meIdx();
    if (r.phase === 'question' && r.qi !== shownQi) { shownQi = r.qi; shownAt = Date.now(); }
    const q = parseJ(r.qJson, null);
    const log = parseJ(r.logJson, []);
    const mine = log.filter(l => l.player === me);
    let streak = 0; for (let i = mine.length - 1; i >= 0 && mine[i].correct; i--) streak++;
    const myRes = r.res?.[uid()];
    const myAns = r.ans?.[uid()];
    const phase = r.status === 'end' ? 'end' : r.phase;
    const st = {
      v: 3, online: { code: r.code, me, host: isHost() }, seed: r.seed, rng: 0,
      config: { type: 'clasica', structure: 'mezclada', perPlayer: r.cfg.n / 2, timer: r.cfg.timer, idiomaMode: r.cfg.idioma, formats: engineConfig(r.cfg).formats, gens: r.cfg.gens, cats: Object.keys(E.CATS), rounds: [] },
      players: r.players.map((p, i) => ({ id: i, name: p.name })), scores: r.scores.slice(), lives: null,
      streak, bestStreak: 0, streaks: [0, 0], bestStreaks: [0, 0], phase, ri: 0, qi: r.qi, hints: 99,
      q: q ? { ...q, mode: 'mezcla' } : null, log, used: [], usedBank: [],
      result: phase === 'reveal' && myRes ? { given: myAns ? parseJ(myAns.v, null) : null, points: myRes.p, correct: myRes.base >= 1, partial: myRes.base > 0 && myRes.base < 1, streak, timeout: myRes.timeout } : null,
    };
    // Mejor racha de cada uno, para las medallas
    st.bestStreaks = r.players.map((_, i) => { let b = 0, c = 0; for (const l of log.filter(x => x.player === i)) { c = l.correct ? c + 1 : 0; b = Math.max(b, c); } return b; });
    const prevPhase = api.getState()?.online ? api.getState().phase : null;
    api.setState(st);
    if (phase === 'reveal' && prevPhase === 'question' && myRes) api.Sound.play(myRes.base >= 1 ? (streak >= 3 ? 'crit' : 'juas') : myRes.base > 0 ? 'ok' : 'wrong');
    if (phase === 'end' && recordedSeed !== r.seed) { recordedSeed = r.seed; api.recordEnd(); }
  }
  const waiting = () => {
    const s = api.getState();
    return !!(s?.online && s.phase === 'question' && room && (answeredQi === room.qi || room.ans?.[uid()]));
  };
  function action(a) {
    const s = api.getState();
    if (!room || !s?.online) return;
    if (a.type === 'ANSWER' && s.phase === 'question' && !waiting()) {
      answeredQi = room.qi;
      const ms = Date.now() - shownAt;
      upd({ [`ans.${uid()}`]: { v: JSON.stringify(a.value ?? null), ms } });
      api.render();
    } else if (a.type === 'NEXT' && s.phase === 'reveal' && readyQi !== room.qi) {
      readyQi = room.qi;
      upd({ [`ready.${uid()}`]: room.qi });
      api.render();
    }
  }
  function waitView() {
    const s = api.getState(), r = room, other = rival();
    const rivalDone = r.ans?.[other?.uid];
    return `<main class="enter"><div class="box waitbox">
      <p class="hint px catl">Pregunta ${r.qi + 1} de ${r.cfg.n}</p>
      <p class="big px" data-tw="¡Respuesta enviada!">¡Respuesta enviada!</p>
      <p class="q">${rivalDone ? `${esc(other.name)} también respondió. Calificando…` : `Esperando a ${esc(other?.name || 'su rival')}…`}</p>
      <div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>
      ${Date.now() - (r.updated || Date.now()) > 45000 ? `<p class="hint">Parece que se cortó la conexión de ${esc(other?.name || 'su rival')}.</p><button class="btn ghost" data-act="on-leave">Salir del duelo</button>` : ''}</div></main>`;
  }
  function revealExtra() {
    const r = room, me = meIdx(), other = rival();
    if (!r?.res || !other) return '';
    const mr = r.res[uid()], or = r.res[other.uid];
    if (!mr || !or) return '';
    const fmtMs = ms => ms === null || ms === undefined ? '—' : `${(ms / 1000).toLocaleString('es', { maximumFractionDigits: 1 })} s`;
    const line = (name, x, color) => `<div class="drow"><span class="dn" style="color:${color}">${esc(name)}</span><span class="dv ${x.base >= 1 ? 'ok' : x.base > 0 ? 'mid' : 'bad'}">${x.timeout ? 'Sin respuesta' : x.base >= 1 ? '✓ Bien' : x.base > 0 ? '≈ Casi' : '✗ Mal'}</span><span class="dt">${fmtMs(x.ms)}</span><b class="px">+${String(x.p).replace('.', ',')}</b>${x.bonus ? '<span class="dbonus px">¡Más rápido!</span>' : ''}</div>`;
    const ready = r.ready || {};
    const otherReady = ready[other.uid] === r.qi;
    return `<div class="box duelres"><span class="hint px catl">Esta pregunta</span>
      ${line(r.players[me].name, mr, api.pColor(me))}${line(other.name, or, api.pColor(1 - me))}
      <p class="hint">${readyQi === r.qi ? `Esperando a ${esc(other.name)}…` : otherReady ? `${esc(other.name)} ya está listo.` : 'Toque Siguiente cuando esté listo.'} El más rápido en acertar gana medio punto extra.</p></div>`;
  }
  const nextLabel = () => (readyQi === room?.qi ? 'Esperando…' : room && room.qi + 1 >= room.cfg.n ? 'Ver resultado ▶' : '¡Listo! ▶');
  function rematch() {
    if (!room || room.status !== 'end') return;
    upd({ [`rematch.${uid()}`]: true });
    api.toast(room.rematch?.[rival()?.uid] ? '¡Revancha!' : `Esperando a que ${rival()?.name || 'su rival'} acepte la revancha…`);
  }
  // Para la medalla «Remontada»: la peor diferencia que tuve en contra durante el duelo.
  function maxDeficit(log, me) {
    const sc = [0, 0]; let worst = 0;
    for (const l of log) { sc[l.player] += l.points; worst = Math.max(worst, sc[1 - me] - sc[me]); }
    return worst;
  }

  // ---------- Cadena Pokémon en línea ----------
  const CAD_TURN = 20000;
  const lettersOf = name => E.normalize(name).replace(/[^a-z]/g, '');
  function nextLetter(chain) {
    const used = new Set(chain.map(c => c.id));
    const w = lettersOf(ctx().byId.get(chain[chain.length - 1].id).name);
    for (let i = w.length - 1; i >= 0; i--) if (ctx().pokemon.some(p => !used.has(p.id) && lettersOf(p.name)[0] === w[i])) return w[i];
    return w[w.length - 1];
  }
  function stopCad() { if (cadTimer) { clearInterval(cadTimer); cadTimer = null; } api.hurry(false); }
  function cadSync(prev) {
    const r = room;
    if (r.seq !== turnSeq) { turnSeq = r.seq; turnSeenAt = Date.now(); cadMsg = ''; if (r.turn === meIdx() && r.status === 'play') setTimeout(() => document.getElementById('typed')?.focus(), 60); }
    if (r.status === 'end') { stopCad(); if (recordedSeed !== r.seed) { recordedSeed = r.seed; cadRecord(); } return; }
    if (!cadTimer) cadTimer = setInterval(cadTick, 200);
  }
  function cadTick() {
    if (!room || room.mode !== 'cadena' || room.status !== 'play') { stopCad(); return; }
    const mine = room.turn === meIdx(), left = turnSeenAt + CAD_TURN - Date.now();
    const el = document.getElementById('cado-time'), bar = document.getElementById('cado-bar');
    if (el) el.textContent = Math.max(0, Math.ceil(left / 1000));
    if (bar) bar.style.width = `${Math.max(0, left / CAD_TURN * 100)}%`;
    api.hurry(mine && left > 0 && left <= 5000);
    if (mine && left <= 0) { stopCad(); upd({ status: 'end', winner: 1 - meIdx(), why: `${room.players[meIdx()].name} se quedó sin tiempo.` }); }
    // Si el otro no responde (se desconectó), después de 6 s de gracia gana el que espera.
    if (!mine && left <= -6000) { stopCad(); upd({ status: 'end', winner: meIdx(), why: `${rival().name} no respondió a tiempo.` }); }
  }
  function cadSend(text) {
    const r = room;
    if (!r || r.status !== 'play' || r.turn !== meIdx()) return;
    const chain = parseJ(r.chainJson, []);
    const key = E.matchKey(ctx(), 'pokemon', text);
    if (!key) { cadMsg = `No es un Pokémon: ${text.slice(0, 30)}`; api.render(); return; }
    const p = ctx().byId.get(+key);
    if (chain.some(c => c.id === p.id)) { cadMsg = `${p.name} ya salió.`; api.render(); return; }
    if (lettersOf(p.name)[0] !== r.letter) { cadMsg = `${p.name} no empieza con ${r.letter.toUpperCase()}.`; api.render(); return; }
    const next = chain.concat({ id: p.id, p: meIdx() });
    const scores = r.scores.slice(); scores[meIdx()]++;
    api.Sound.play('ok');
    upd({ chainJson: JSON.stringify(next), turn: 1 - meIdx(), letter: nextLetter(next), seq: r.seq + 1, scores });
  }
  function cadRecord() {
    const r = room, me = meIdx(), won = r.winner === me;
    const recs = api.records(), name = r.players[me].name.trim(), rv = rival()?.name.trim() || '';
    recs.xp[name] = (recs.xp[name] || 0) + (r.scores[me] || 0);
    if (won) { recs.duels[name] = (recs.duels[name] || 0) + 1; recs.rivals ||= {}; recs.rivals[rv] = (recs.rivals[rv] || 0) + 1; }
    api.saveRecords();
    api.addFichas((r.scores[me] || 0) + (won ? 5 : 0));
    if (won) { api.grantMedal('mejenga1'); if ((recs.rivals[rv] || 0) >= 10) api.grantMedal('rival10'); }
    api.Sound.play(won ? 'win' : 'over');
  }
  function cadenaView() {
    const r = room;
    if (!r) return onlineView();
    const me = meIdx(), chain = parseJ(r.chainJson, []), cx = ctx();
    const color = p => (p < 0 ? 'var(--soft)' : api.pColor(p));
    const chips = chain.slice(-14).map(c => `<span class="chip2" style="--c:${color(c.p)}">${esc(cx.byId.get(c.id).name)}</span>`).join('<span class="arrow" aria-hidden="true">→</span>');
    const head = api.screenHead('Cadena en línea', 'online');
    const score = `<div class="duelscore">${r.players.map((p, i) => `<span style="--c:${api.pColor(i)}">${api.avatar(p, 'sm')} ${esc(p.name)} <b class="px">${r.scores[i] || 0}</b></span>`).join('')}</div>`;
    if (r.status === 'end') {
      const won = r.winner === me, w = r.players[r.winner];
      const line = won ? api.lineFor(api.WIN_LINES, r.seed) : api.lineFor(api.LOSE_LINES, r.seed, 1);
      return `${head}<main class="enter"><div class="box intro"><p class="big px" style="color:${api.pColor(r.winner)}" data-tw="${esc(`¡${w.name} se la jugó!`)}">¡${esc(w.name)} se la jugó!</p>
        <p class="${won ? 'winline px' : 'loseline'}">${won ? esc(line) : `<b>${esc(line)}</b>`}</p><p class="hint">${esc(r.why)}</p>${score}
        <div class="chips cadchips" style="margin-top:10px">${chips}</div>
        <div class="row end" style="margin-top:12px"><button class="btn ghost" data-act="on-leave">Salir</button><button class="btn ghost" data-act="on-lobby">Cambiar modo</button><button class="btn" data-act="on-rematch" id="nextbtn">${r.rematch?.[uid()] ? 'Esperando…' : 'Revancha'}</button></div></div></main>`;
    }
    const mine = r.turn === me, left = turnSeenAt + CAD_TURN - Date.now();
    return `${head}<main>${score}
      <div class="timer px"><span>${mine ? 'Su turno' : `Turno de ${esc(rival().name)}`}</span><div class="hp"><i id="cado-bar" style="width:${Math.max(0, left / CAD_TURN * 100)}%"></i></div><span id="cado-time">${Math.max(0, Math.ceil(left / 1000))}</span></div>
      <div class="box"><div class="chips cadchips">${chips}</div></div>
      <div class="box field"><p class="q">${mine ? 'Un Pokémon que empiece con' : `${esc(rival().name)} busca uno con`} <b class="bigletter px">${r.letter.toUpperCase()}</b></p>
        <div class="row"><input class="input" id="typed" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${mine ? 'Escriba un Pokémon' : 'Espere su turno…'}" style="flex:1" ${mine ? '' : 'disabled'}><button class="btn" data-act="cado-send" ${mine ? '' : 'disabled'}>Enviar</button></div>
        ${cadMsg ? `<p class="flash bad keep">${esc(cadMsg)}</p>` : ''}</div>
    </main>`;
  }

  // ---------- pantallas: inicio en línea y sala de espera ----------
  function onlineView() {
    const head = api.screenHead('En línea');
    if (!live()) {
      return `${head}<main class="enter"><div class="box intro"><p class="q">Los duelos en línea necesitan la nube del juego.</p>
        <p class="hint">${api.db() ? 'Esta versión dentro de Claude no tiene duelos en línea. Ábralo desde la app: jbcdev39.github.io/juasmon' : 'Revise su conexión a internet y vuelva a abrir el juego.'}</p></div></main>`;
    }
    const saved = store.load('pt-sala', null);
    return `${head}<main class="enter hub">
      <div class="box"><p class="q">Rete a su compa desde donde esté. Uno crea la sala y le pasa el código; el otro se une.</p>
        <div class="row end" style="margin-top:12px"><button class="btn" data-act="on-create">Crear sala</button></div></div>
      <div class="box field"><span class="l px">Unirse con código</span>
        <div class="row"><input class="input codein px" id="joincode" maxlength="9" autocomplete="off" autocapitalize="characters" placeholder="JUAS-0000" style="flex:1"><button class="btn" data-act="on-join">Unirse</button></div>
        ${joinMsg ? `<p class="flash bad keep">${esc(joinMsg)}</p>` : ''}</div>
      ${saved ? `<button class="summary" data-act="on-resume" data-val="${esc(saved)}"><span class="px">Sala</span><span class="sumtxt">Volver a la sala ${pretty(saved)}</span><span class="chev">▸</span></button>` : ''}
    </main>`;
  }
  function salaView() {
    const r = room;
    if (!r) return onlineView();
    const host = isHost(), cfg = r.cfg, two = r.players.length === 2;
    const link = `https://jbcdev39.github.io/juasmon/?sala=${r.code}`;
    const players = [0, 1].map(i => {
      const p = r.players[i];
      return p ? `<div class="lplayer">${api.avatar(p, 'big')}<span><b class="px">${esc(p.name)}</b><small class="hint">${i === 0 ? 'Creó la sala' : 'Invitado'}${p.uid === uid() ? ' · usted' : ''}</small></span></div>`
        : '<div class="lplayer empty"><span class="avatar big"></span><span><b class="px">Esperando…</b><small class="hint">Pásele el código a su compa</small></span></div>';
    }).join('<span class="vsmark px">vs</span>');
    const t = (act, val, on, label) => host ? api.tog(act, val, on, label) : (on ? `<span class="tog ro" aria-pressed="true">${label}</span>` : '');
    const preset = Object.entries(PRESETS).find(([k]) => k === cfg.preset);
    const genKey = Object.entries(GENSETS).find(([, [, g]]) => sameSet(cfg.gens, g))?.[0];
    return `${api.screenHead(`Sala ${pretty(r.code)}`, 'online')}<main class="enter">
      <div class="box codebox"><span class="hint">Código de la sala</span><p class="bigcode px">${pretty(r.code)}</p>
        <div class="row end"><button class="btn ghost" data-act="on-copy" data-val="${esc(link)}">Copiar enlace</button><button class="btn" data-act="on-share" data-val="${esc(link)}">Invitar</button></div></div>
      <div class="box lobby">${players}</div>
      <div class="box field"><span class="l px">Modo</span><div class="togs">${t('on-mode', 'duelo', r.mode === 'duelo', 'Duelo de preguntas')}${t('on-mode', 'cadena', r.mode === 'cadena', 'Cadena Pokémon')}</div>
        ${r.mode === 'duelo' ? `<p class="hint">Los dos responden la misma pregunta a la vez. El más rápido en acertar gana medio punto extra.</p>
          <span class="l px">Preguntas</span><div class="togs">${[6, 10, 16].map(n => t('on-n', n, cfg.n === n, n)).join('')}</div>
          <span class="l px">Formatos</span><div class="togs">${Object.entries(PRESETS).map(([k, [l]]) => t('on-preset', k, cfg.preset === k, l)).join('')}</div>
          <span class="l px">Regiones</span><div class="togs">${Object.entries(GENSETS).map(([k, [l]]) => t('on-gens', k, genKey === k, l)).join('')}${!genKey && !host ? '<span class="tog ro" aria-pressed="true">Personalizado</span>' : ''}</div>
          <span class="l px">Tiempo por pregunta</span><div class="togs">${[15, 20, 30].map(n => t('on-timer', n, cfg.timer === n, `${n} s`)).join('')}</div>
          <span class="l px">Adivinar Pokémon</span><div class="togs">${t('on-idioma', 'opciones', cfg.idioma === 'opciones', '4 opciones')}${t('on-idioma', 'escribir', cfg.idioma === 'escribir', 'Escribir el nombre')}</div>`
        : '<p class="hint">Por turnos: cada uno escribe un Pokémon que empiece con la última letra del anterior. 20 segundos por turno; pierde el que se quede pegado.</p>'}
        ${host ? '' : `<p class="hint">${esc(r.players[0].name)} elige los ajustes.</p>`}</div>
      <div class="playbar"><button class="btn ghost" data-act="on-leave">Salir</button>${host ? `<button class="btn bigbtn" data-act="on-start" ${two ? '' : 'disabled'}>${two ? '¡Empezar!' : 'Esperando a su compa…'}</button>` : `<span class="hint">Esperando a que ${esc(r.players[0].name)} empiece…</span>`}</div>
    </main>`;
  }

  // ---------- acciones ----------
  function act(a, v) {
    switch (a) {
      case 'on-create': create(); return true;
      case 'on-join': join(document.getElementById('joincode')?.value); return true;
      case 'on-resume': join(v); return true;
      case 'on-leave': leave(); return true;
      case 'on-start': start(); return true;
      case 'on-rematch': rematch(); return true;
      case 'on-lobby': if (room && isHost()) upd({ status: 'lobby', rematch: {} }); else api.toast(`${rival()?.name || 'El anfitrión'} puede cambiar el modo.`); return true;
      case 'on-share': {
        const text = `¡Lo reto en JUASmon! Sala ${pretty(room.code)}: ${v}`;
        if (navigator.share) navigator.share({ text }).catch(() => {}); else navigator.clipboard?.writeText(text).then(() => api.toast('Copiado. Mándeselo por WhatsApp.'), () => {});
        return true;
      }
      case 'on-copy': navigator.clipboard?.writeText(v).then(() => api.toast('Enlace copiado.'), () => {}); return true;
      case 'cado-send': { const t = document.getElementById('typed')?.value.trim(); if (t) cadSend(t); return true; }
    }
    if (a.startsWith('on-') && room && isHost() && room.status === 'lobby') {
      const cfg = { ...room.cfg };
      if (a === 'on-mode') { upd({ mode: v }); return true; }
      if (a === 'on-n') cfg.n = +v;
      if (a === 'on-preset') cfg.preset = v;
      if (a === 'on-gens') cfg.gens = GENSETS[v][1].slice();
      if (a === 'on-timer') cfg.timer = +v;
      if (a === 'on-idioma') cfg.idioma = v;
      upd({ cfg });
      return true;
    }
    return false;
  }
  function enter() {
    const v = api.view();
    if (v === 'online') join(document.getElementById('joincode')?.value);
    if (v === 'cadenaOnline') { const t = document.getElementById('typed')?.value.trim(); if (t) cadSend(t); }
  }
  // Al abrir el juego con ?sala=CÓDIGO
  function cloudReady() { if (pendingJoin && live()) { const c = pendingJoin; pendingJoin = null; api.goto('online'); join(c); } }
  function openLink(c) { pendingJoin = c; cloudReady(); }

  return {
    VIEWS: { online: onlineView, sala: salaView, cadenaOnline: cadenaView },
    act, enter, action, waiting, waitView, revealExtra, nextLabel, rematch, leave, cloudReady, openLink,
    maxDeficit: () => maxDeficit(parseJ(room?.logJson, []), meIdx()),
    rivalName: () => rival()?.name || '',
    inRoom: () => !!room,
  };
}
