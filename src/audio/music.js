/**
 * Title-screen music, synthesised rather than streamed.
 *
 * Everything else in this game's audio is generated at runtime — the motor, the
 * tyres, the hydraulics, the freewheel — so the music is too. That keeps the
 * build free of an audio asset, avoids any licensing question on a repo that is
 * public under the author's name, and means the whole soundtrack ships in a few
 * kilobytes of code.
 *
 * Four bars in D, looping: Dmaj7 - Bm7 - Gmaj7 - A7sus4. Warm, unhurried,
 * major-seventh voicings — the sound equivalent of the flat-vector poster the
 * title screen is drawn as. Four voices:
 *
 *   pad    slow-swelling detuned triangles behind a lowpass, the harmonic bed
 *   bass   the chord root, plucked on the downbeat and the third beat
 *   bell   a sparse arpeggio over the upper chord tones, the only real melody
 *   hat    a very quiet filtered noise tick on the offbeats, for pulse
 *
 * Notes are scheduled ahead of the clock rather than fired from a timer:
 * setInterval drifts by tens of milliseconds, which is audible as a stumbling
 * rhythm, so a 25 ms poll queues every event up to 120 ms in advance and the
 * audio clock decides exactly when each one sounds.
 */

const BPM = 82;
const STEP = 60 / BPM / 2;          // an eighth note
const STEPS_PER_BAR = 8;
const LOOKAHEAD = 0.12;             // seconds of events queued in advance

/** MIDI note number to frequency. */
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Voicings, low to high. Root first — the bass reads it directly.
const PROGRESSION = [
  [50, 54, 57, 61],   // Dmaj7    D  F#  A  C#
  [47, 50, 54, 57],   // Bm7      B  D   F# A
  [43, 47, 50, 54],   // Gmaj7    G  B   D  F#
  [45, 50, 52, 55],   // A7sus4   A  D   E  G
];

// Which eighth-notes of a bar carry a bell note, and which chord tone it takes.
// Deliberately sparse and off the beat, so it sits over the pad rather than
// marching with it.
const BELL_PATTERN = [
  { step: 0, tone: 2 }, { step: 3, tone: 3 }, { step: 6, tone: 1 },
  { step: 10, tone: 3 }, { step: 12, tone: 2 }, { step: 15, tone: 0 },
];

export class TitleMusic {
  /**
   * @param ctx          the shared AudioContext
   * @param destination  node to play into (the engine's compressor bus)
   */
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);

    // One lowpass for the pad, so the chords stay behind the melody.
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 1400;
    this.padFilter.Q.value = 0.6;
    this.padFilter.connect(this.out);

    this._noise = this._makeNoise(1);
    this._step = 0;
    this._nextTime = 0;
    this._timer = null;
    this.playing = false;
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  start(volume = 0.34, fadeIn = 2.2) {
    if (this.playing) return;
    this.playing = true;
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.08;
    // A slow swell in: the music should arrive rather than switch on.
    this.out.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.out.gain.setTargetAtTime(volume, this.ctx.currentTime, fadeIn / 3);
    this._timer = setInterval(() => this._pump(), 25);
    this._pump();
  }

  /** Fades out and stops scheduling. Safe to call when not playing. */
  stop(fade = 1.4) {
    if (!this.playing) return;
    this.playing = false;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.setTargetAtTime(0.0001, t, fade / 4);
    clearInterval(this._timer);
    this._timer = null;
  }

  _pump() {
    if (!this.playing) return;
    const until = this.ctx.currentTime + LOOKAHEAD;
    while (this._nextTime < until) {
      this._scheduleStep(this._step, this._nextTime);
      this._nextTime += STEP;
      this._step++;
    }
  }

  _scheduleStep(step, when) {
    const bar = Math.floor(step / STEPS_PER_BAR) % PROGRESSION.length;
    const inBar = step % STEPS_PER_BAR;
    const chord = PROGRESSION[bar];

    // Pad: re-voiced once per bar, held across it.
    if (inBar === 0) this._pad(chord, when, STEP * STEPS_PER_BAR);

    // Bass: downbeat, plus a lighter note on beat three.
    if (inBar === 0) this._bass(chord[0] - 12, when, 0.9, 0.20);
    if (inBar === 4) this._bass(chord[0] - 12, when, 0.7, 0.13);

    // Bell melody, two bars' worth of pattern spread over the bar pair.
    const patStep = step % (STEPS_PER_BAR * 2);
    for (const n of BELL_PATTERN) {
      if (n.step === patStep) this._bell(chord[n.tone] + 12, when);
    }

    // Hat on the offbeats only, barely there.
    if (inBar % 2 === 1) this._hat(when, inBar === 3 || inBar === 7 ? 0.016 : 0.009);
  }

  _pad(notes, when, dur) {
    for (const n of notes) {
      // Two oscillators a few cents apart: the beating between them is what
      // stops a synth pad sounding like a test tone.
      for (const detune of [-4, 4]) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = hz(n);
        o.detune.value = detune;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(0.055, when + 0.9);          // slow swell
        g.gain.setTargetAtTime(0.0001, when + dur * 0.62, 0.5);     // and decay
        o.connect(g); g.connect(this.padFilter);
        o.start(when);
        o.stop(when + dur + 1.2);
      }
    }
  }

  _bass(note, when, dur, gain) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz(note);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.03);
    g.gain.setTargetAtTime(0.0001, when + 0.06, dur * 0.32);
    // A touch of low-pass keeps the pluck round rather than clicky.
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420;
    o.connect(g); g.connect(f); f.connect(this.out);
    o.start(when);
    o.stop(when + dur + 0.3);
  }

  _bell(note, when) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = hz(note);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.085, when + 0.012);
    g.gain.setTargetAtTime(0.0001, when + 0.02, 0.42);
    // A quiet fifth above, one octave up, gives it a music-box shimmer.
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = hz(note + 19);
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0.0001, when);
    g2.gain.linearRampToValueAtTime(0.022, when + 0.01);
    g2.gain.setTargetAtTime(0.0001, when + 0.02, 0.26);

    o.connect(g); g.connect(this.out);
    o2.connect(g2); g2.connect(this.out);
    o.start(when); o.stop(when + 1.6);
    o2.start(when); o2.stop(when + 1.2);
  }

  _hat(when, gain) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
    src.connect(f); f.connect(g); g.connect(this.out);
    src.start(when);
    src.stop(when + 0.08);
  }
}
