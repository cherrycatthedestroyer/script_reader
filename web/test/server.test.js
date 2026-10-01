import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCueServer } from '../server.js';
import { actorCue, nextIndex } from '../public/cue-model.js';

test('actor cues: selection, countdown, current line, completion, and moving backward', () => {
  const cues = [{ speaker: 'A', text: 'One' }, { speaker: 'B', text: 'Two' }, { speaker: 'A', text: 'Three' }];
  assert.equal(actorCue(cues, 0, '').kind, 'unselected');
  assert.equal(actorCue(cues, 0, 'B').distance, 1);
  assert.equal(actorCue(cues, 1, 'B').kind, 'now');
  assert.equal(actorCue(cues, 2, 'B').kind, 'complete');
  assert.equal(actorCue(cues, 0, 'B').cue.text, 'Two');
  assert.equal(actorCue(cues, 1, 'A').index, 2);
});

test('navigation clamps at boundaries and rejects invalid commands', () => {
  assert.equal(nextIndex(0, { action: 'previous' }, 3), 0);
  assert.equal(nextIndex(2, { action: 'next' }, 3), 2);
  assert.equal(nextIndex(2, { action: 'jump', index: 0 }, 3), 0);
  for (const index of [-1, 3, 0.5, '1', null]) assert.throws(() => nextIndex(0, { action: 'jump', index }, 3));
  assert.throws(() => nextIndex(0, { action: 'unknown' }, 3));
});

test('real HTTP server synchronizes two screens, reconnects, and rejects stale commands', async t => {
  const server = await createCueServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const aborters = [];
  t.after(async () => {
    aborters.forEach(controller => controller.abort());
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const get = async path => (await fetch(base + path)).json();
  const post = async (state, action, index) => fetch(base + '/api/control', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: state.session, revision: state.revision, action, index }),
  });
  async function screen() {
    const controller = new AbortController();
    aborters.push(controller);
    const response = await fetch(base + '/api/events', { signal: controller.signal });
    const reader = response.body.getReader();
    let buffer = '';
    const decoder = new TextDecoder();
    return async () => {
      while (true) {
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const line = frame.split('\n').find(value => value.startsWith('data: '));
          if (line) return JSON.parse(line.slice(6));
        }
        const { done, value } = await reader.read();
        assert.equal(done, false);
        buffer += decoder.decode(value, { stream: true });
      }
    };
  }
  const script = await get('/api/script');
  assert.ok(script.items.some(item => item.type === 'section'));
  assert.ok(script.characters.includes('ARNAB'));
  const operator = await screen();
  const actor = await screen();
  const initial = await operator();
  assert.deepEqual(await actor(), initial);
  assert.equal(initial.index, 0);
  const moved = await (await post(initial, 'next')).json();
  assert.equal(moved.index, 1);
  assert.deepEqual(await operator(), moved);
  assert.deepEqual(await actor(), moved);
  assert.equal((await post(initial, 'next')).status, 409);
  assert.equal((await get('/api/state')).index, 1);
  const reconnected = await screen();
  assert.deepEqual(await reconnected(), moved);
  const jumped = await (await post(moved, 'jump', initial.cueCount - 1)).json();
  assert.equal(jumped.index, initial.cueCount - 1);
  const bounded = await (await post(jumped, 'next')).json();
  assert.equal(bounded.revision, jumped.revision);
  const previous = await (await post(bounded, 'previous')).json();
  assert.equal(previous.index, initial.cueCount - 2);
  assert.equal((await post(previous, 'jump', -1)).status, 400);
  assert.equal((await post({ ...previous, session: 'old-server' }, 'next')).status, 409);
  const hostile = await fetch(base + '/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://elsewhere.example' }, body: '{}' });
  assert.equal(hostile.status, 403);
  assert.equal((await fetch(base + '/api/control', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await fetch(base + '/server.js')).status, 404);
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/app.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await fetch(base + '/health')).status, 200);
});
