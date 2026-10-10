// Shared client-side password gate for casual access only.
(() => {
  const gate = document.getElementById('loginGate');
  const form = document.getElementById('loginForm');
  const input = document.getElementById('loginPassword');
  const message = document.getElementById('loginMessage');
  const content = document.getElementById('calculatorContent');
  const speech = window.speechSynthesis;
  let welcome;
  function playWelcome() {
    if (!speech || typeof SpeechSynthesisUtterance === 'undefined') return;
    speech.cancel();
    const voices = speech.getVoices();
    welcome = new SpeechSynthesisUtterance('Welcome.');
    const english = voices.filter(v => /^en(?:-|$)/i.test(v.lang));
    // Browser voices have no standard gender field; prefer known female voices.
    welcome.voice = english.find(v => /Zira|Samantha|Victoria|Karen|Moira|Tessa|Serena|Susan|Hazel|Aria|Jenny|Sonia|Libby|Natasha|female/i.test(v.name))
      || english.find(v => /Google US English/i.test(v.name)) || english[0] || null;
    welcome.lang = welcome.voice?.lang || 'en-US';
    welcome.rate = 0.95;
    welcome.pitch = 1;
    welcome.volume = 0.8;
    welcome.onerror = () => {};
    speech.speak(welcome);
  }
  // Request voices early; some browsers populate the list asynchronously.
  if (speech) speech.getVoices();
  function lock() {
    content.hidden = true;
    content.inert = true;
    gate.hidden = false;
    form.reset();
    message.textContent = '';
    input.focus();
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (input.value !== 'charter') {
      message.textContent = 'Incorrect password. Please try again.';
      input.setAttribute('aria-invalid', 'true');
      input.select();
      return;
    }
    input.removeAttribute('aria-invalid');
    form.reset();
    message.textContent = '';
    gate.hidden = true;
    content.hidden = false;
    content.inert = false;
    try { playWelcome(); } catch {}
    window.__STARTAPP();
    document.getElementById('qTitle').focus();
  });
  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    lock();
  });
  lock();
})();
