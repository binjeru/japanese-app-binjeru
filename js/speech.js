"use strict";
// Sprachausgabe über die Web Speech API (Platzhalter, solange keine Audioaufnahmen vorliegen)

const Speech = (() => {
  const supported = "speechSynthesis" in window;
  let voice = null;
  const listeners = [];

  function loadVoice() {
    voice = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith("ja")) || null;
    listeners.forEach(fn => fn());
  }
  if (supported) {
    loadVoice();
    speechSynthesis.addEventListener("voiceschanged", loadVoice);
  }

  // Liefert eine Äußerung; Aufrufer hängt onend/onboundary an und übergibt sie an play()
  function utterance(text, rate = 0.9) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    if (voice) u.voice = voice;
    u.rate = rate;
    return u;
  }
  let current = null; // Referenz halten, sonst feuert onend in Chrome manchmal nicht
  function play(u) {
    if (!supported) return;
    speechSynthesis.cancel();
    current = u;
    speechSynthesis.speak(u);
  }
  function say(text, rate) { if (supported) play(utterance(text, rate)); }
  function cancel() { if (supported) speechSynthesis.cancel(); current = null; }

  return {
    supported, utterance, play, say, cancel,
    get hasVoice() { return !!voice; },
    onVoiceChange: fn => listeners.push(fn),
  };
})();
