// Shared client-side password gate for casual access only.
(() => {
  const gate = document.getElementById('loginGate');
  const form = document.getElementById('loginForm');
  const input = document.getElementById('loginPassword');
  const message = document.getElementById('loginMessage');
  const content = document.getElementById('calculatorContent');
  const loginSound = document.getElementById('loginAudio');
  function playWelcome() {
    loginSound.pause();
    loginSound.currentTime = 0;
    const playing = loginSound.play();
    if (playing && typeof playing.catch === 'function') playing.catch(() => {});
  }
  function lock() {
    content.hidden = true;
    content.inert = true;
    const loading = document.getElementById('loadingScreen');
    const startScreen = document.getElementById('startScreen');
    gate.hidden = (!!loading && !loading.hidden) || (!!startScreen && !startScreen.hidden);
    gate.inert = gate.hidden;
    form.reset();
    message.textContent = '';
    if (!gate.hidden) input.focus();
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
    loginSound.pause();
    loginSound.currentTime = 0;
    lock();
  });
  lock();
})();
