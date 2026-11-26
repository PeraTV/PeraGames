'use strict';

function readProgress(line) {
  const match = /\bprogress(?:\s+for[^:\r\n]+)?\s*[:=]\s*(\d{1,3}(?:\.\d+)?)(?=%|\s|$)/i.exec(line)
    || /^\s*(\d{1,3}(?:\.\d+)?)\s*%/.exec(line);
  const value = match ? Number(match[1]) : NaN;
  return value >= 0 && value <= 100 ? Math.min(value, 99) : undefined;
}

function createDownloads(publish) {
  const jobs = new Map();
  let active = false;
  const list = () => Array.from(jobs.values(), entry => ({ ...entry.job }));
  function changed() { publish(list()); }
  async function run() {
    if (active) return;
    const entry = Array.from(jobs.values()).find(item => item.job.status === 'queued');
    if (!entry) return;
    active = true;
    const { job, task } = entry;
    job.status = 'running';
    changed();
    let lastUpdate = 0;
    try {
      await task(progress => {
        if (progress === undefined || (job.progress !== undefined && progress <= job.progress)) return;
        job.progress = progress;
        if (Date.now() - lastUpdate >= 350) {
          lastUpdate = Date.now();
          changed();
        }
      });
      Object.assign(job, { status: 'done', progress: 100 });
    } catch (error) {
      Object.assign(job, { status: 'failed', error: error.message });
    } finally {
      active = false;
      changed();
      void run();
    }
  }
  return {
    list,
    has: id => ['queued', 'running'].includes(jobs.get(id)?.job.status),
    add(id, name, source, task) {
      if (this.has(id)) return;
      if (jobs.size >= 100) {
        const old = Array.from(jobs.values()).find(item => !this.has(item.job.id));
        if (!old) throw new Error('A fila de downloads está cheia.');
        jobs.delete(old.job.id);
      }
      jobs.delete(id);
      jobs.set(id, { job: { id, source, name, status: 'queued' }, task });
      changed();
      void run();
    },
    retry(id) {
      const entry = jobs.get(id);
      if (entry?.job.status === 'failed') this.add(id, entry.job.name, entry.job.source, entry.task);
    },
    remove(id) {
      const entry = jobs.get(id);
      if (entry && entry.job.status !== 'running') {
        jobs.delete(id);
        changed();
      }
    }
  };
}

module.exports = { createDownloads, readProgress };
