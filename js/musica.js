// ============================================================
//  Música de fondo chiptune, compuesta para JUASmon (melodías propias).
//  Se toca con WebAudio, sin archivos. Dos piezas: «menu» (tranquila)
//  y «juego» (más movida). Cada una es un ciclo de 8 compases.
// ============================================================
const n = null;
// Notas en número MIDI (60 = Do central). Cada compás tiene 8 corcheas.
const TRACKS = {
  menu: {
    bpm: 100,
    lead: [
      76, n, 79, n, 81, 79, 76, n,    74, n, 72, n, 69, 72, 74, n,
      72, n, 74, 76, 77, n, 76, 74,   74, n, 71, n, 67, n, n, n,
      76, n, 79, n, 84, 83, 81, 79,   81, n, 79, 76, 74, n, 72, n,
      69, 72, 74, 77, 76, 74, 72, 74, 71, n, 74, n, 79, n, n, n,
    ],
    bass: [
      48, n, 55, n, 48, n, 55, n,     45, n, 52, n, 45, n, 52, n,
      41, n, 48, n, 41, n, 48, n,     43, n, 50, n, 43, n, 50, n,
      48, n, 55, n, 48, n, 55, n,     45, n, 52, n, 45, n, 52, n,
      41, n, 48, n, 41, n, 48, n,     43, n, 50, n, 43, 47, 50, n,
    ],
    hat: [0, 0, 1, 0, 0, 0, 1, 0],
    kick: [1, 0, 0, 0, 1, 0, 0, 0],
    leadVol: 0.028, bassVol: 0.05,
  },
  juego: {
    bpm: 132,
    lead: [
      69, 72, 76, 72, 81, 76, 72, 76,   77, 76, 74, 72, 74, n, 69, n,
      72, 76, 79, 76, 84, 79, 76, 79,   83, 81, 79, 74, 79, n, n, n,
      81, n, 84, 81, 79, 76, 74, 76,    77, n, 81, 77, 76, 74, 72, 74,
      76, 79, 84, 79, 76, 72, 74, 76,   74, 71, 67, 71, 74, 79, 83, n,
    ],
    bass: [
      45, 57, 45, 57, 45, 57, 45, 57,   41, 53, 41, 53, 41, 53, 41, 53,
      48, 60, 48, 60, 48, 60, 48, 60,   43, 55, 43, 55, 43, 55, 43, 55,
      45, 57, 45, 57, 45, 57, 45, 57,   41, 53, 41, 53, 41, 53, 41, 53,
      48, 60, 48, 60, 48, 60, 48, 60,   43, 55, 43, 55, 47, 50, 53, 55,
    ],
    hat: [1, 0, 1, 0, 1, 0, 1, 1],
    kick: [1, 0, 0, 0, 1, 0, 1, 0],
    leadVol: 0.026, bassVol: 0.05,
  },
};
const freq = m => 440 * Math.pow(2, (m - 69) / 12);

export function createMusic(Sound, store) {
  let on = store.load('pt-music', true);
  let track = null, step = 0, nextAt = 0, timer = null, master = null, noise = null;

  function ensure() {
    const ac = Sound.ensure();
    if (!ac) return null;
    if (!master) { master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination); }
    if (!noise) {
      noise = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ac;
  }
  function note(ac, f, at, dur, type, vol) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.01);
    g.gain.setValueAtTime(vol, at + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, at + dur);
    o.connect(g); g.connect(master); o.start(at); o.stop(at + dur + 0.02);
  }
  function hit(ac, at, vol, hp) {
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noise; f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = hp ? 6000 : 180;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + (hp ? 0.04 : 0.12));
    src.connect(f); f.connect(g); g.connect(master); src.start(at); src.stop(at + 0.15);
  }
  function schedule() {
    const ac = Sound.ac;
    if (!ac || !track) return;
    const t = TRACKS[track], len = 60 / t.bpm / 2;
    while (nextAt < ac.currentTime + 0.25) {
      const i = step % t.lead.length, b = step % 8;
      if (t.lead[i] !== null) note(ac, freq(t.lead[i]), nextAt, len * 0.9, 'square', t.leadVol);
      if (t.bass[i] !== null) note(ac, freq(t.bass[i]), nextAt, len * 0.95, 'triangle', t.bassVol);
      if (t.hat[b]) hit(ac, nextAt, 0.012, true);
      if (t.kick[b]) hit(ac, nextAt, 0.05, false);
      nextAt += len; step++;
    }
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } track = null; }
  function play(name) {
    if (!on || Sound.muted || document.hidden) { stop(); return; }
    if (track === name && timer) return;
    const ac = ensure();
    if (!ac) return;
    track = name; step = 0; nextAt = ac.currentTime + 0.08;
    if (!timer) timer = setInterval(schedule, 90);
    schedule();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  return {
    get on() { return on; },
    toggle() { on = !on; store.save('pt-music', on); if (!on) stop(); },
    play, stop,
  };
}
