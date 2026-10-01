import { actorCue } from './cue-model.js';

const $ = id => document.getElementById(id);
let data, cues, state, events;
let connected = false;
let busy = false;
let lastSeen = 0;
let role = '';
let highlighted;
let actorKey = '';
let retryTimer;
const cueElements = [];
const preference = {
  get(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* Storage is optional. */ } },
};

function notice(message = '') {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}

function connection(ok) {
  connected = ok;
  $('connection').textContent = ok ? 'Live · all screens synced' : 'Reconnecting · cue may be out of date';
  $('connection').classList.toggle('online', ok);
  document.body.classList.toggle('disconnected', !ok);
  updateControls();
  if (cues && state) renderActor();
}

function updateControls() {
  const disabled = !connected || !state || busy;
  $('previous').disabled = disabled || state?.index === 0;
  $('next').disabled = disabled || state?.index === cues?.length - 1;
  $('scene-picker').disabled = disabled;
  $('jump-input').disabled = disabled;
  $('jump-form').querySelector('button').disabled = disabled;
}

function chooseRole(value) {
  role = ['operator', 'actor'].includes(value) ? value : '';
  $('chooser').hidden = !!role;
  $('operator').hidden = role !== 'operator';
  $('actor').hidden = role !== 'actor';
  $('switch-screen').hidden = !role;
  document.body.dataset.role = role;
  if (state) render(true);
}

function scrollToCue() {
  if (role !== 'operator' || !state) return;
  const element = cueElements[state.index];
  const container = $('script');
  const offset = element.getBoundingClientRect().top - container.getBoundingClientRect().top;
  container.scrollTop += offset - Math.max(0, (container.clientHeight - element.offsetHeight) / 2);
}

function buildScript() {
  $('script-title').textContent = data.title;
  $('script-summary').textContent = `${cues.length} speaking cues · ${data.characters.length} characters`;
  $('jump-input').max = cues.length;
  for (const character of data.characters) $('character').add(new Option(character, character));
  const savedCharacter = preference.get('script-cue-character');
  if (data.characters.includes(savedCharacter)) $('character').value = savedCharacter;
  const savedSize = preference.get('script-cue-text-size');
  if (['auto', 'medium', 'large', 'extra'].includes(savedSize)) $('text-size').value = savedSize;
  let cueIndex = 0;
  for (const item of data.items) {
    let element;
    if (item.type === 'section') {
      element = document.createElement('h2');
      element.className = 'script-section';
      element.textContent = item.text;
      if (cueIndex < cues.length) $('scene-picker').add(new Option(item.text, cueIndex));
    } else if (item.type === 'direction') {
      element = document.createElement('p');
      element.className = 'direction';
      element.textContent = `[${item.text}]`;
    } else if (item.type === 'dialogue') {
      element = document.createElement('article');
      element.className = 'script-cue';
      const heading = document.createElement('h3');
      heading.textContent = `${String(cueIndex + 1).padStart(2, '0')}  /  ${item.speaker}`;
      const words = document.createElement('p');
      words.textContent = item.text;
      element.append(heading, words);
      cueElements.push(element);
      cueIndex += 1;
    } else continue;
    $('script').append(element);
  }
}

function renderActor() {
  const character = $('character').value;
  const target = actorCue(cues, state.index, character);
  $('actor-speaker').textContent = `Current: ${cues[state.index].speaker}`;
  $('actor-position').textContent = `Cue ${state.index + 1} / ${cues.length}`;
  $('actor-card').className = `actor-card ${connected ? target.kind : 'offline'}`;
  $('actor-card').dataset.size = $('text-size').value;
  $('actor-card').dataset.length = target.cue?.text.length > 650 ? 'long' : target.cue?.text.length > 280 ? 'medium' : 'short';
  $('target-cue').textContent = target.cue ? `YOUR CUE ${target.index + 1}` : '';
  let words = 'Choose your character above.';
  let countdown = 'Select a character to begin';
  let status = 'READY WHEN YOU ARE';
  if (target.kind === 'complete') {
    words = `No more lines for ${character}.`;
    countdown = 'All of your cues are complete';
    status = 'THAT’S A WRAP';
  } else if (target.cue) {
    words = target.cue.text;
    countdown = target.distance === 0 ? 'YOUR LINE — NOW' : `${target.distance} ${target.distance === 1 ? 'line' : 'lines'} until your cue`;
    status = target.distance === 0 ? 'YOU’RE ON' : 'UP NEXT FOR YOU';
  }
  if (!connected) {
    countdown = 'Connection lost — waiting to sync';
    status = 'LAST KNOWN CUE · NOT LIVE';
  }
  if ($('actor-text').textContent !== words) $('actor-text').textContent = words;
  $('countdown').textContent = countdown;
  $('actor-state').textContent = status;
  const key = `${character}:${target.index}:${target.kind}`;
  if (key !== actorKey) $('actor-card').scrollTop = 0;
  actorKey = key;
}

function render(forceScroll = false) {
  const changed = highlighted !== state.index;
  if (changed) {
    const old = cueElements[highlighted];
    old?.classList.remove('current');
    old?.removeAttribute('aria-current');
    const current = cueElements[state.index];
    current.classList.add('current');
    current.setAttribute('aria-current', 'step');
    highlighted = state.index;
  }
  $('cue-status').textContent = `Cue ${state.index + 1} of ${cues.length}`;
  $('speaker-status').textContent = cues[state.index].speaker;
  if (document.activeElement !== $('jump-input')) $('jump-input').value = state.index + 1;
  let scene;
  for (const option of $('scene-picker').options) if (Number(option.value) <= state.index) scene = option.value;
  if (scene !== undefined) $('scene-picker').value = scene;
  updateControls();
  renderActor();
  if (changed || forceScroll) requestAnimationFrame(scrollToCue);
}

function applyState(incoming) {
  if (incoming.scriptVersion !== data.scriptVersion) {
    location.reload();
    return;
  }
  if (state?.session === incoming.session && incoming.revision < state.revision) return;
  if (state && state.session !== incoming.session) notice('The server restarted. The shared cue has reset to the beginning.');
  state = incoming;
  lastSeen = Date.now();
  connection(true);
  render();
}

function subscribe() {
  events?.close();
  connection(false);
  events = new EventSource('/api/events');
  events.addEventListener('state', event => applyState(JSON.parse(event.data)));
  events.onerror = () => connection(false);
}

async function command(action, index) {
  if (!connected || busy || !state) return;
  busy = true;
  updateControls();
  notice();
  try {
    const response = await fetch('/api/control', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, index, session: state.session, revision: state.revision }),
      signal: AbortSignal.timeout(6000),
    });
    const result = await response.json();
    if (response.status === 409) {
      applyState(result.state);
      notice(result.error);
    } else if (!response.ok) throw new Error(result.error);
    else applyState(result);
  } catch {
    notice('Could not confirm that move. Reconnecting to check the current cue; the move will not be sent again automatically.');
    subscribe();
  } finally {
    busy = false;
    updateControls();
  }
}

document.querySelectorAll('[data-role]').forEach(button => button.addEventListener('click', () => { location.hash = button.dataset.role; }));
$('switch-screen').addEventListener('click', () => { location.hash = ''; });
window.addEventListener('hashchange', () => chooseRole(location.hash.slice(1)));
$('previous').addEventListener('click', () => command('previous'));
$('next').addEventListener('click', () => command('next'));
$('follow').addEventListener('click', scrollToCue);
$('scene-picker').addEventListener('change', event => command('jump', Number(event.target.value)));
$('jump-form').addEventListener('submit', event => { event.preventDefault(); command('jump', Number($('jump-input').value) - 1); });
$('character').addEventListener('change', () => { preference.set('script-cue-character', $('character').value); if (state) renderActor(); });
$('text-size').addEventListener('change', () => { preference.set('script-cue-text-size', $('text-size').value); if (state) renderActor(); });
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else notice('Fullscreen is not available in this browser. You can use Add to Home Screen from the browser menu.');
  } catch { notice('The browser could not enter fullscreen.'); }
});
document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });
document.addEventListener('keydown', event => {
  if (role !== 'operator' || event.altKey || event.ctrlKey || event.metaKey || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName)) return;
  const action = { ArrowDown: 'next', ArrowRight: 'next', ArrowUp: 'previous', ArrowLeft: 'previous', Home: 'jump', End: 'jump' }[event.key];
  if (action) { event.preventDefault(); command(action, event.key === 'End' ? cues.length - 1 : 0); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && data) subscribe(); });
window.addEventListener('online', () => { if (data) subscribe(); else load(); });
window.addEventListener('offline', () => connection(false));
setInterval(() => {
  if (connected && Date.now() - lastSeen > 12000) subscribe();
}, 2000);

async function load() {
  clearTimeout(retryTimer);
  try {
    const response = await fetch('/api/script', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Script unavailable');
    data = await response.json();
    cues = data.items.filter(item => item.type === 'dialogue');
    buildScript();
    chooseRole(location.hash.slice(1));
    notice();
    subscribe();
  } catch {
    notice('The script is not available yet. Retrying automatically…');
    retryTimer = setTimeout(load, 3000);
  }
}
chooseRole(location.hash.slice(1));
updateControls();
load();
