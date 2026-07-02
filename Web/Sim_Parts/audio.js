// Web/Sim_Parts/audio.js
// Procedural audio synthesis for Beep, Rocket Launch, and Gun Fire sounds.

let gunNoiseBuffer = null;
let activeGunSources = [];

export class Audio {
  constructor(ctx) {
    this.ctx = ctx;
  }

  // Static audio synthesis method for rocket launch
  static playRocketLaunch(audioCtx) {
    if (!audioCtx) return;
    try {
      const t0 = audioCtx.currentTime;
      const DUR = 3.6;
      
      const bufLen = Math.floor(audioCtx.sampleRate * 2);
      const buffer = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

      // Low-frequency rumble
      const rumbleSrc = audioCtx.createBufferSource();
      rumbleSrc.buffer = buffer;
      rumbleSrc.loop = true;
      
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t0);
      lp.frequency.exponentialRampToValueAtTime(250, t0 + DUR);
      
      const rumbleGain = audioCtx.createGain();
      rumbleSrc.connect(lp);
      lp.connect(rumbleGain);
      rumbleGain.connect(audioCtx.destination);

      // Mid-frequency roar
      const roarSrc = audioCtx.createBufferSource();
      roarSrc.buffer = buffer;
      roarSrc.loop = true;
      
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.7;
      bp.frequency.setValueAtTime(500, t0);
      bp.frequency.linearRampToValueAtTime(1400, t0 + 0.6);
      bp.frequency.exponentialRampToValueAtTime(700, t0 + DUR);
      
      const roarGain = audioCtx.createGain();
      roarSrc.connect(bp);
      bp.connect(roarGain);
      roarGain.connect(audioCtx.destination);

      // Envelope
      const VOL = 0.16;
      rumbleGain.gain.setValueAtTime(0, t0);
      rumbleGain.gain.linearRampToValueAtTime(VOL, t0 + 0.15);
      rumbleGain.gain.setValueAtTime(VOL, t0 + DUR * 0.5);
      rumbleGain.gain.linearRampToValueAtTime(0, t0 + DUR);
      
      roarGain.gain.setValueAtTime(0, t0);
      roarGain.gain.linearRampToValueAtTime(VOL * 0.7, t0 + 0.1);
      roarGain.gain.linearRampToValueAtTime(0, t0 + DUR);

      rumbleSrc.start(t0);
      rumbleSrc.stop(t0 + DUR + 0.05);
      
      roarSrc.start(t0);
      roarSrc.stop(t0 + DUR + 0.05);
    } catch (e) {
      console.warn('rocket launch sound 실패:', e);
    }
  }

  // Static audio synthesis method for gun fire
  static playGunFire(audioCtx) {
    if (!audioCtx) return;
    try {
      const t0 = audioCtx.currentTime + 0.005;
      
      if (!gunNoiseBuffer) {
        const bufLen = Math.floor(audioCtx.sampleRate * 1.5);
        gunNoiseBuffer = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
        const data = gunNoiseBuffer.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      }
      
      for (const s of activeGunSources) {
        try { s.stop(); } catch {}
      }
      activeGunSources = [];

      // Low boom
      const boomSrc = audioCtx.createBufferSource();
      boomSrc.buffer = gunNoiseBuffer;
      
      const boomLp = audioCtx.createBiquadFilter();
      boomLp.type = 'lowpass';
      boomLp.frequency.value = 280;
      
      const boomGain = audioCtx.createGain();
      boomSrc.connect(boomLp);
      boomLp.connect(boomGain);
      boomGain.connect(audioCtx.destination);
      
      boomGain.gain.setValueAtTime(0.0001, t0);
      boomGain.gain.linearRampToValueAtTime(0.75, t0 + 0.003);
      boomGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.70);

      // High crack
      const crackSrc = audioCtx.createBufferSource();
      crackSrc.buffer = gunNoiseBuffer;
      
      const crackHp = audioCtx.createBiquadFilter();
      crackHp.type = 'highpass';
      crackHp.frequency.value = 2000;
      
      const crackGain = audioCtx.createGain();
      crackSrc.connect(crackHp);
      crackHp.connect(crackGain);
      crackGain.connect(audioCtx.destination);
      
      crackGain.gain.setValueAtTime(0.0001, t0);
      crackGain.gain.linearRampToValueAtTime(0.5, t0 + 0.002);
      crackGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);

      // Ultra-low rumble
      const rumbleSrc = audioCtx.createBufferSource();
      rumbleSrc.buffer = gunNoiseBuffer;
      
      const rumbleLp = audioCtx.createBiquadFilter();
      rumbleLp.type = 'lowpass';
      rumbleLp.frequency.setValueAtTime(160, t0);
      rumbleLp.frequency.exponentialRampToValueAtTime(70, t0 + 1.1);
      
      const rumbleGain = audioCtx.createGain();
      rumbleSrc.connect(rumbleLp);
      rumbleLp.connect(rumbleGain);
      rumbleGain.connect(audioCtx.destination);
      
      rumbleGain.gain.setValueAtTime(0.0001, t0);
      rumbleGain.gain.linearRampToValueAtTime(0.35, t0 + 0.04);
      rumbleGain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.10);

      boomSrc.start(t0);
      boomSrc.stop(t0 + 0.75);
      
      crackSrc.start(t0);
      crackSrc.stop(t0 + 0.10);
      
      rumbleSrc.start(t0);
      rumbleSrc.stop(t0 + 1.15);
      
      activeGunSources.push(boomSrc, crackSrc, rumbleSrc);
    } catch (e) {
      console.warn('gun fire sound 실패:', e);
    }
  }

  // Synthesizes a square wave beep sound
  playBeep(hz, sec) {
    if (!hz || sec <= 0) return;
    try {
      const audioCtx = this.ctx.getAudioCtx();
      if (!audioCtx) return;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.value = hz;
      o.connect(g);
      g.connect(audioCtx.destination);
      
      const t0 = audioCtx.currentTime;
      const t1 = t0 + sec;
      const VOL = 0.06;
      
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(VOL, t0 + 0.005);
      g.gain.setValueAtTime(VOL, Math.max(t0 + 0.006, t1 - 0.01));
      g.gain.linearRampToValueAtTime(0, t1);
      
      o.start(t0);
      o.stop(t1 + 0.02);
    } catch (e) {
      console.warn('beep 실패:', e);
    }
  }

  playRocketLaunch() {
    const audioCtx = this.ctx.getAudioCtx();
    Audio.playRocketLaunch(audioCtx);
  }

  playGunFire() {
    const audioCtx = this.ctx.getAudioCtx();
    Audio.playGunFire(audioCtx);
  }
}
