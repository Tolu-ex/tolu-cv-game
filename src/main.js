import './style.css';
import { Game } from './core/Game.js';

const canvas = document.getElementById('scene');
const loadingScreen = document.getElementById('loading-screen');
const loadingBarFill = document.getElementById('loading-bar-fill');
const introScreen = document.getElementById('intro-screen');
const startButton = document.getElementById('start-button');

async function boot() {
  const game = new Game(canvas);
  if (import.meta.env.DEV) window.__game = game; // dev-only debug handle

  // Fake but smooth progress while the hub world geometry is built —
  // everything is procedural, so there's no network fetch to wait on.
  let progress = 0;
  const progressTimer = setInterval(() => {
    progress = Math.min(92, progress + Math.random() * 18);
    loadingBarFill.style.width = `${progress}%`;
  }, 90);

  // Let the loading screen paint before we do the (synchronous, potentially
  // heavy) world construction work. Browsers stop firing rAF in a backgrounded
  // tab, so race it against a timer — otherwise opening the game in a
  // background tab hangs on the loading screen until it is focused.
  await Promise.race([
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    new Promise((r) => setTimeout(r, 250)),
  ]);
  await game.preload();

  clearInterval(progressTimer);
  loadingBarFill.style.width = '100%';

  setTimeout(() => {
    loadingScreen.classList.add('hidden');
    introScreen.classList.remove('hidden');
    // The title screen is a window onto the world, not a wall in front of it.
    game.startAttract();
  }, 200);

  startButton.addEventListener('click', () => {
    introScreen.classList.add('hidden');
    game.start();
  }, { once: true });
}

boot();
