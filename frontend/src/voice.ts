import * as Tone from "tone";

/**
 * Start the voice processing chain and return a MediaStream
 * that can be sent over WebRTC. The processed audio is NOT
 * played locally (no Tone.Destination) — only the TV hears it.
 */
export async function startVoice(): Promise<MediaStream> {
  await Tone.start();

  const mic = new Tone.UserMedia();

  // 1. The Deepening (Pitch Shift)
  const pitchShift = new Tone.PitchShift({
    pitch: -3, // Down 3 semitones. Deep, but intelligible!
    windowSize: 0.05,
    delayTime: 0,
    feedback: 0,
    delay: 10,
  });

  // 2. The Thundering Bass (Equalizer)
  const eq = new Tone.EQ3({
    low: 2,
    mid: 0,
    high: 2, // Roll off piercing highs
  });

  // 3. The Iron Grip (Compressor)
  const compressor = new Tone.Compressor({
    threshold: -24, // When to start squashing the sound
    ratio: 3, // How hard to squash it
    attack: 0.01,
    release: 0.1,
  });

  // 4. Auto-gain normalization — adjusts to a target RMS level
  const targetRMS = 0.15;
  const autoGain = new Tone.Gain(1);
  const meter = new Tone.Meter({ smoothing: 0.9 });
  compressor.connect(meter);

  // Periodically adjust gain to hit target level
  setInterval(() => {
    const dbVal = meter.getValue() as number;
    if (dbVal < -100) return; // silence, don't adjust
    const rms = Math.pow(10, dbVal / 20);
    if (rms > 0.001) {
      const desired = targetRMS / rms;
      // Clamp between 0.5x and 10x, move slowly
      const clamped = Math.max(0.5, Math.min(10, desired));
      const current = autoGain.gain.value;
      autoGain.gain.value = current + (clamped - current) * 0.1;
    }
  }, 200);

  // 5. The Grand Hall (Reverb)
  const reverb = new Tone.Freeverb({
    roomSize: 0.6, // A massive throne room
    dampening: 4000,
    wet: 0.35, // 35% echo, 65% your actual voice
  });

  // Chain: Mic -> Pitch -> EQ -> Compressor -> AutoGain -> Reverb
  mic.chain(pitchShift, eq, compressor, autoGain, reverb);

  // Tap the processed output into a MediaStream for WebRTC
  const rawCtx = Tone.getContext().rawContext as AudioContext;
  const dest = rawCtx.createMediaStreamDestination();
  Tone.connect(reverb, dest);

  await mic.open();
  console.log("Microphone access granted");

  return dest.stream;
}
