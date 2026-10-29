let audioContext: AudioContext | null = null;

export function unlockMessageAudio() {
  if (typeof window === 'undefined' || !window.AudioContext) return;
  audioContext ??= new window.AudioContext();
  if (audioContext.state === 'suspended') void audioContext.resume().catch(() => undefined);
}

function playTone(context: AudioContext, frequency: number, startAt: number, duration: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.055, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

export function playMessageSound() {
  if (!audioContext || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  playTone(audioContext, 740, now, 0.12);
  playTone(audioContext, 988, now + 0.14, 0.16);
}
