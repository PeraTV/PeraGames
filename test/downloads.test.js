'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createDownloads, createSteamDownloadTracker, readProgress } = require('../src/downloads');
const { launch, steamDownloads } = require('../src/system');

test('extrai o progresso sem marcar como concluído antes de o instalador sair', () => {
  assert.equal(readProgress('[DLManager] INFO: Progress: 4.96% (4/100)'), 4.96);
  assert.equal(readProgress('[DOWNLOAD] INFO: Progress: 23.70 (24/100)'), 23.7);
  assert.equal(readProgress('Progress for Jogo: 100%/85MiB/00:00:00'), 99);
  assert.equal(readProgress('Timeout after 30 seconds'), undefined);
});

test('processa um download por vez, remove itens pendentes e repete falhas', async () => {
  let finishFirst;
  let fail = true;
  const updates = [];
  const queue = createDownloads(jobs => updates.push(jobs));
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const first = progress => new Promise(resolve => { progress(40); finishFirst = resolve; });
  queue.add('a', 'A', 'epic', first);
  queue.add('b', 'B', 'gog', async () => { if (fail) throw new Error('failure'); });
  queue.add('c', 'C', 'amazon', async () => { assert.fail('removed job ran'); });
  queue.remove('c');
  assert.deepEqual(queue.list().map(item => [item.id, item.status]), [['a', 'running'], ['b', 'queued']]);
  assert.ok(updates.some(jobs => jobs[0].progress === 40));
  finishFirst();
  await tick();
  assert.equal(queue.list()[0].status, 'done');
  assert.equal(queue.list()[1].status, 'failed');
  fail = false;
  queue.retry('b');
  await tick();
  assert.equal(queue.list()[1].status, 'done');
});

test('lê stdout e stderr com finais de linha distintos', async () => {
  const lines = [];
  await launch(process.execPath, ['-e', 'process.stdout.write("first\\rsecond"); process.stderr.write("third\\n");'],
    { wait: true, onLine: line => { if (line) lines.push(line); } });
  assert.deepEqual(lines.sort(), ['first', 'second', 'third']);
});

test('cancela downloads na fila e em execução e só avança após a interrupção', async () => {
  let finish;
  const updates = [];
  const queue = createDownloads(jobs => updates.push(jobs));
  queue.add('epic', 'A', 'epic', (_progress, signal) => new Promise(resolve => {
    signal.addEventListener('abort', () => { finish = resolve; }, { once: true });
  }));
  queue.add('gog', 'B', 'gog', () => assert.fail('executou download cancelado na fila'));
  queue.add('amazon', 'C', 'amazon', async () => {});
  queue.cancel('gog');
  queue.cancel('epic');
  assert.deepEqual(queue.list().map(job => job.status), ['cancelling', 'cancelled', 'queued']);
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(queue.list().map(job => job.status), ['cancelled', 'cancelled', 'done']);
  assert.ok(updates.some(jobs => jobs[0].status === 'cancelling'));
});

test('preserva a verificação da loja após concluir o download', async () => {
  let confirm;
  const queue = createDownloads(() => {});
  queue.add('epic', 'A', 'epic', (_progress, _signal, finish) => new Promise(resolve => {
    finish();
    confirm = resolve;
  }));
  queue.cancel('epic');
  assert.equal(queue.list()[0].status, 'finishing');
  confirm();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queue.list()[0].status, 'done');
});

test('interrompe o processo real de download quando recebe cancelamento', async () => {
  const controller = new AbortController();
  const job = launch(process.execPath, ['-e', 'console.log("ready"); setInterval(() => {}, 1000);'], {
    wait: true, signal: controller.signal,
    onLine(line) { if (line === 'ready') controller.abort(); }
  });
  await assert.rejects(job, { name: 'AbortError' });
});

test('mostra andamento da Steam a partir dos bytes reais do manifesto', async context => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'peragames-steam-progress-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const folder = path.join(root, 'steamapps');
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, 'appmanifest_123.acf'),
    '"appid" "123" "name" "Game" "StateFlags" "1026" "BytesToDownload" "800" "BytesDownloaded" "200"');
  await fs.writeFile(path.join(folder, 'appmanifest_321.acf'),
    '"appid" "321" "name" "Completed" "StateFlags" "4" "BytesToDownload" "700" "BytesDownloaded" "700"');
  assert.deepEqual(await steamDownloads([root]), [
    { id: 'steam-123', name: 'Game', source: 'Steam', status: 'external', progress: 25 },
    { id: 'steam-321', name: 'Completed', source: 'Steam', status: 'done', progress: 100 }
  ]);
  await fs.writeFile(path.join(folder, 'appmanifest_123.acf'),
    '"appid" "123" "name" "Game" "StateFlags" "2097152" "BytesToDownload" "1026" "BytesDownloaded" "1026"');
  assert.deepEqual((await steamDownloads([root])).find(game => game.id === 'steam-123'),
    { id: 'steam-123', name: 'Game', source: 'Steam', status: 'steam-finalizing', progress: 99 });
});

test('confirma a instalação apenas dos downloads Steam acompanhados e mantém o resultado na lista', () => {
  const tracker = createSteamDownloadTracker();
  const old = { id: 'steam-321', name: 'Already installed', source: 'Steam', status: 'done', progress: 100 };
  const newGame = { id: 'steam-123', name: 'New game', source: 'Steam' };
  assert.deepEqual(tracker.update([old]), []);
  tracker.request(old.id, old.name);
  assert.deepEqual(tracker.list(), []);
  tracker.request(newGame.id, newGame.name);
  assert.equal(tracker.list()[0].status, 'steam-requested');
  const finalizing = { ...newGame, status: 'steam-finalizing', progress: 99 };
  assert.deepEqual(tracker.update([old, finalizing]), []);
  assert.deepEqual(tracker.list(), [finalizing]);
  assert.deepEqual(tracker.update([old]), []);
  const complete = { ...newGame, status: 'done', progress: 100 };
  assert.deepEqual(tracker.update([old, complete]), [complete]);
  assert.deepEqual(tracker.update([old, complete]), []);
  assert.deepEqual(tracker.list(), [complete]);
  tracker.remove(complete.id);
  assert.deepEqual(tracker.list(), []);
});
