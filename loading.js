(() => {
  const overlay = document.getElementById('loadingScreen');
  const sound = document.getElementById('loadingAudio');
  const startScreen = document.getElementById('startScreen');
  const startButton = document.getElementById('startLoading');
  let started = false;
  let finished = false;
  startButton.addEventListener('click', () => {
  if (started) return;
  started = true;
  startButton.disabled = true;
  startScreen.hidden = true;
  overlay.hidden = false;
  overlay.classList.add('isLoading');
  try {
    const playing = sound.play();
    if (playing && typeof playing.then === 'function') playing.then(() => {
      if (finished) sound.pause();
    }).catch(() => {});
  } catch {}
  setTimeout(() => {
    finished = true;
    sound.pause();
    sound.currentTime = 0;
    overlay.hidden = true;
    const login = document.getElementById('loginGate');
    login.hidden = false;
    login.inert = false;
    document.getElementById('loginPassword').focus();
  }, 7000);
  });
})();
