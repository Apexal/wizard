import * as Tone from "tone";

export async function startVoice() {
  await Tone.start();

  const mic = new Tone.UserMedia();

  // 1. The Deepening (Pitch Shift)
  const pitchShift = new Tone.PitchShift({
    pitch: -3, // Down 8 semitones. Deep, but intelligible!
    windowSize: 0.05,
    delayTime: Tone.Time("10").toSeconds(),
    feedback: 0,
  });

  // 2. The Thundering Bass (Equalizer)
  const eq = new Tone.EQ3({
    low: 4,
    mid: 0,
    high: -2, // Roll off piercing highs
  });

  // 3. The Iron Grip (Compressor)
  const compressor = new Tone.Compressor({
    threshold: -24, // When to start squashing the sound
    ratio: 3, // How hard to squash it
    attack: 0.01,
    release: 0.1,
  });

  // 4. The Grand Hall (Reverb)
  const reverb = new Tone.Freeverb({
    roomSize: 0.6, // A massive throne room
    dampening: 4000,
    wet: 0.35, // 35% echo, 65% your actual voice
  });

  // The Master Stroke: Chain the magic together!
  // Microphone -> Pitch -> EQ -> Compressor -> Reverb -> Output
  mic.chain(pitchShift, eq, compressor, reverb, Tone.Destination);

  try {
    await mic.open();
    console.log("Microphone access granted");
  } catch (err) {
    console.error("Error accessing microphone: ", err);
  }
}
