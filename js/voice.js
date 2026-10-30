// Dictation through the browser's built-in speech recognition (Safari on iPhone uses
// Apple's dictation; Chrome uses Google's service). No audio is handled by Evenday itself.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const voiceSupported = () => Boolean(Recognition);

const MESSAGES = {
  'not-allowed': 'Microphone access is blocked. Allow it in your browser settings, or use the mic on your keyboard.',
  'service-not-allowed': 'Voice input isn’t available here. On iPhone, turn on Siri & Dictation in Settings, or use the mic on your keyboard.',
  'audio-capture': 'No microphone was found.',
  network: 'Voice input needs an internet connection in this browser.',
  'no-speech': 'Didn’t catch that. Tap the mic and try again.',
};

// Starts listening. Returns a function that stops it.
export function listen({ onText, onEnd, onError }) {
  if (!Recognition) {
    onError?.('Voice input isn’t supported in this browser. Use the mic on your keyboard instead.');
    onEnd?.();
    return () => {};
  }
  const rec = new Recognition();
  rec.lang = navigator.language || 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    let text = '';
    for (const r of e.results) text += r[0].transcript;
    onText?.(text.trim(), e.results[e.results.length - 1].isFinal);
  };
  rec.onerror = (e) => { if (e.error !== 'aborted') onError?.(MESSAGES[e.error] || 'Voice input stopped unexpectedly.'); };
  rec.onend = () => onEnd?.();
  try {
    rec.start();
  } catch {
    onError?.('Voice input couldn’t start. Try again.');
    onEnd?.();
  }
  return () => { try { rec.stop(); } catch { /* already stopped */ } };
}
