/**
 * Procedural audio.
 *
 * Every sound here is synthesised at runtime — there are no audio files. That
 * keeps the download at zero bytes and matches how the rest of the game is
 * built, but it also means each sound has to be designed rather than recorded.
 *
 * The design brief is an ELECTRIC refuse truck, which is a genuinely different
 * sound to a diesel one: no combustion rumble, no exhaust bark. What you hear
 * instead is a rising inverter whine over a low torque hum, with tyre roar
 * doing most of the work at speed — plus the hydraulics, air brakes and the
 * reversing beeper that make a truck sound like a working vehicle.
 *
 * Continuous voices (motor, tyres, wind) are built once and driven by
 * parameter automation; per-frame node creation would allocate constantly and
 * click. One-shots (bin tip, air brake, hydraulics) are built on demand and
 * disposed when they finish.
 */

const MASTER_VOLUME = 0.34;
const STORAGE_KEY = 'rova-audio-muted';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch { /* private browsing — default to unmuted */ }
    this._beepPhase = 0;
    this._lastIndicatorOn = false;
    this._prevSpeed = 0;
  }

  /**
   * Must be called from a user gesture — browsers refuse to start an
   * AudioContext otherwise. The Start Engine button is that gesture.
   */
  start() {
    if (this.ready) { this.ctx.resume?.(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;                       // no WebAudio: run silent
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(this.ctx.destination);

    // A little compression stops the layers from summing into clipping when
    // everything happens at once — arm cycle over motor over tyres.
    this.bus = this.ctx.createDynamicsCompressor();
    this.bus.threshold.value = -18;
    this.bus.ratio.value = 6;
    this.bus.attack.value = 0.005;
    this.bus.release.value = 0.15;
    this.bus.connect(this.master);

    this._noiseBuffer = this._makeNoise(2);
    this._buildMotor();
    this._buildTyres();
    this._buildWind();

    this.ready = true;
    this.ctx.resume?.();
  }

  /** Two seconds of white noise, looped by the continuous voices. */
  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _loopNoise() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    src.start();
    return src;
  }

  // --- Continuous voices ---------------------------------------------------

  /**
   * The motor: a low torque hum plus an inverter whine an octave-and-a-fifth
   * above it. The whine is what says "electric" — a diesel would need a
   * rattling sawtooth and a much lower fundamental.
   */
  _buildMotor() {
    const ctx = this.ctx;

    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    this.motorGain.connect(this.bus);

    // Low hum — the sense of mass being moved.
    this.hum = ctx.createOscillator();
    this.hum.type = 'sawtooth';
    this.hum.frequency.value = 42;
    this.humFilter = ctx.createBiquadFilter();
    this.humFilter.type = 'lowpass';
    this.humFilter.frequency.value = 260;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.5;
    this.hum.connect(this.humFilter).connect(this.humGain).connect(this.motorGain);
    this.hum.start();

    // Inverter whine — narrow and tonal, riding well above the hum.
    this.whine = ctx.createOscillator();
    this.whine.type = 'triangle';
    this.whine.frequency.value = 240;
    this.whineFilter = ctx.createBiquadFilter();
    this.whineFilter.type = 'bandpass';
    this.whineFilter.Q.value = 4;
    this.whineFilter.frequency.value = 900;
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0.32;
    this.whine.connect(this.whineFilter).connect(this.whineGain).connect(this.motorGain);
    this.whine.start();

    // A second whine detuned slightly: two nearly-identical tones beat against
    // each other, which stops the note sounding like a test oscillator.
    this.whine2 = ctx.createOscillator();
    this.whine2.type = 'triangle';
    this.whine2.frequency.value = 243;
    this.whine2.connect(this.whineFilter);
    this.whine2.start();
  }

  /** Tyre roar: filtered noise whose brightness and level track road speed. */
  _buildTyres() {
    const ctx = this.ctx;
    this.tyreSrc = this._loopNoise();
    this.tyreFilter = ctx.createBiquadFilter();
    this.tyreFilter.type = 'bandpass';
    this.tyreFilter.Q.value = 0.7;
    this.tyreFilter.frequency.value = 320;
    this.tyreGain = ctx.createGain();
    this.tyreGain.gain.value = 0;
    this.tyreSrc.connect(this.tyreFilter).connect(this.tyreGain).connect(this.bus);
  }

  /** Wind: only audible near the top of the speed range. */
  _buildWind() {
    const ctx = this.ctx;
    this.windSrc = this._loopNoise();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'highpass';
    this.windFilter.frequency.value = 900;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSrc.connect(this.windFilter).connect(this.windGain).connect(this.bus);
  }

  // --- One-shots -----------------------------------------------------------

  /**
   * Short filtered-noise burst, used for air brakes and impacts.
   *
   * Note on `gain`: a bandpass discards far more energy than a highpass, and a
   * high Q narrows the band further, so the same nominal gain through
   * different filters lands at wildly different loudness. Measured on the
   * master bus, a bandpass burst came out ~9x quieter than a highpass one at
   * matched gain. The compensation below normalises that so callers can think
   * in relative loudness rather than filter physics.
   */
  _noiseBurst({ duration = 0.3, type = 'highpass', freq = 1200, Q = 1, gain = 0.5, sweepTo = null }) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = Q;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
    // Bandpass keeps only a slice of the spectrum; compensate so `gain` means
    // roughly the same thing regardless of filter type and width.
    const comp = type === 'bandpass' ? 2.6 * Math.max(1, Math.sqrt(Q)) : 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * comp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  /** Short tone, used for the reversing beeper and indicator tick. */
  _tone({ freq = 880, duration = 0.12, gain = 0.18, type = 'square', decay = true }) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + duration + 0.02);
  }

  /** Air brakes: the pressure release you hear when a truck comes to rest. */
  airBrake() {
    this._noiseBurst({ duration: 0.45, type: 'highpass', freq: 2600, sweepTo: 700, gain: 0.36 });
  }

  /** Hydraulic arm: a groaning sweep under a whirr, for the collection cycle. */
  hydraulic(rising = true) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 0.75;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(rising ? 70 : 130, t);
    o.frequency.linearRampToValueAtTime(rising ? 130 : 70, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 620;
    f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.08);
    g.gain.setValueAtTime(0.2, t + dur - 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.bus);
    o.start(t); o.stop(t + dur + 0.02);
    // Servo whirr layered over it.
    this._noiseBurst({ duration: dur, type: 'bandpass', freq: 1500, Q: 5, gain: 0.09 });
  }

  /** A wheelie bin emptying into the hopper: plastic knock then a rattle. */
  binTip() {
    // Knock, then rattle. Louder than the ambient one-shots on purpose: this
    // is the reward for the game's core action and needs to cut through.
    this._noiseBurst({ duration: 0.14, type: 'bandpass', freq: 420, Q: 1.4, gain: 0.55 });
    setTimeout(() => this._noiseBurst({
      duration: 0.35, type: 'bandpass', freq: 1700, Q: 1.0, gain: 0.34, sweepTo: 600,
    }), 110);
  }

  /** Load tipped at the depot — a longer, heavier version of the same idea. */
  depotDump() {
    this._noiseBurst({ duration: 0.9, type: 'lowpass', freq: 900, Q: 1, gain: 0.4, sweepTo: 200 });
    this.hydraulic(false);
  }

  /** Portal transition. */
  whoosh() {
    this._noiseBurst({ duration: 0.85, type: 'bandpass', freq: 300, Q: 1.0, gain: 0.42, sweepTo: 3000 });
  }

  // --- Per-frame -----------------------------------------------------------

  /**
   * Drives the continuous voices from the truck's state.
   *
   * `setTargetAtTime` rather than direct assignment throughout: stepping an
   * audio parameter once per frame produces audible zipper noise, whereas a
   * short time-constant glides between values.
   */
  /** Switches the drivetrain sound. A bicycle has no motor to hum. */
  setVehicle(kind) {
    this.vehicle = kind || 'truck';
    this._freewheel = 0;
  }

  update(delta, truck, input) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (this.vehicle === 'bike') return this._updateBike(delta, truck, input, t);

    const speed = Math.abs(truck.speed);
    const frac = Math.min(speed / truck.maxSpeed, 1);
    const throttle = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);

    // Motor. Level rises with speed but also with load: holding the throttle
    // at a steady speed should sound like effort, and lifting off should
    // audibly relax even though the speed has not changed yet.
    const load = Math.abs(throttle) > 0 ? 1 : 0.45;
    const motorLevel = (0.05 + frac * 0.5) * load;
    this.motorGain.gain.setTargetAtTime(motorLevel, t, 0.08);
    this.hum.frequency.setTargetAtTime(40 + frac * 55, t, 0.1);
    this.whine.frequency.setTargetAtTime(180 + frac * 900, t, 0.06);
    this.whine2.frequency.setTargetAtTime(184 + frac * 912, t, 0.06);
    this.whineFilter.frequency.setTargetAtTime(700 + frac * 2200, t, 0.08);

    // Tyres.
    this.tyreGain.gain.setTargetAtTime(frac * 0.2, t, 0.1);
    this.tyreFilter.frequency.setTargetAtTime(260 + frac * 700, t, 0.1);

    // Wind, only near the top of the range.
    this.windGain.gain.setTargetAtTime(Math.max(0, frac - 0.55) * 0.16, t, 0.2);

    // Air brake on coming to rest from a decent speed.
    const decel = (this._prevSpeed - speed) / Math.max(delta, 1e-4);
    if (this._prevSpeed > 3 && speed < 0.6 && decel > 0) this.airBrake();
    this._prevSpeed = speed;

    // Reversing beeper — legally required on a real truck, and instantly
    // recognisable.
    if (truck.speed < -0.3) {
      this._beepPhase += delta;
      if (this._beepPhase > 0.85) {
        this._beepPhase = 0;
        this._tone({ freq: 1050, duration: 0.16, gain: 0.15 });
      }
    } else {
      this._beepPhase = 0.85;   // beep immediately next time reverse engages
    }

    // Indicator relay tick, fired on the leading edge of each blink.
    const steering = Math.abs(truck.steerAngle) > truck.maxSteer * 0.12;
    const blinkOn = steering && (truck._elapsed % 0.68) < 0.36;
    if (blinkOn && !this._lastIndicatorOn) {
      this._tone({ freq: 2100, duration: 0.035, gain: 0.05, type: 'square' });
    }
    this._lastIndicatorOn = blinkOn;
  }

  /**
   * Bicycle: no motor at all. What you actually hear riding an omafiets is
   * tyres on the track, a little wind, and the freewheel ticking whenever you
   * stop pedalling — that tick is the sound people recognise a bike by.
   */
  _updateBike(delta, truck, input, t) {
    const speed = Math.abs(truck.speed);
    const frac = Math.min(speed / truck.maxSpeed, 1);
    const throttle = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);

    this.motorGain.gain.setTargetAtTime(0, t, 0.12);

    // Tyres on a dirt field track: darker and softer than tarmac.
    this.tyreGain.gain.setTargetAtTime(frac * 0.11, t, 0.12);
    this.tyreFilter.frequency.setTargetAtTime(180 + frac * 340, t, 0.12);
    this.windGain.gain.setTargetAtTime(Math.max(0, frac - 0.35) * 0.14, t, 0.2);

    // Freewheel: ticks only while coasting, at a rate set by wheel speed.
    const coasting = throttle === 0 && speed > 0.4;
    if (coasting) {
      this._freewheel = (this._freewheel ?? 0) + speed * delta;
      const spacing = 0.085;          // metres of travel between pawl clicks
      while (this._freewheel > spacing) {
        this._freewheel -= spacing;
        this._tone({ freq: 2600 + Math.random() * 400, duration: 0.012, gain: 0.022, type: 'square' });
      }
    } else {
      this._freewheel = 0;
    }

    this._prevSpeed = speed;
  }

  // --- Control -------------------------------------------------------------

  setMuted(muted) {
    this.muted = muted;
    try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
    if (!this.ready) return;
    this.master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.05);
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Pulls everything down during story cards and world transitions. */
  duck(on) {
    if (!this.ready || this.muted) return;
    this.master.gain.setTargetAtTime(on ? MASTER_VOLUME * 0.15 : MASTER_VOLUME, this.ctx.currentTime, 0.12);
  }
}
