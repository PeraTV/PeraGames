'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createDownloads, readProgress } = require('../src/downloads');
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
    { id: 'steam-123', name: 'Game', source: 'Steam', status: 'external', progress: 25 }
  ]);
});
