// The notes write queue, within a tab and across tabs (Web Locks).
import { afterEach, describe, it, expect, vi } from 'vitest';
import { NOTES_WEB_LOCK, WriteLock } from '../lib/storage/writeLock';

/** A Web Locks stand-in shared by "tabs": one holder per name, FIFO. */
function fakeLocks() {
  const queues = new Map<string, Promise<unknown>>();
  const requested: string[] = [];
  return {
    requested,
    request(name: string, callback: () => Promise<unknown>) {
      requested.push(name);
      const prev = queues.get(name) ?? Promise.resolve();
      const run = prev.then(callback, callback);
      queues.set(
        name,
        run.catch(() => {}),
      );
      return run;
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('WriteLock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs tasks in this tab one at a time without Web Locks', async () => {
    vi.stubGlobal('navigator', {});
    const lock = new WriteLock();
    const order: string[] = [];
    let release!: () => void;
    const first = lock.run(async () => {
      order.push('first:start');
      await new Promise<void>((resolve) => (release = resolve));
      order.push('first:end');
    });
    const second = lock.run(async () => {
      order.push('second');
    });
    await tick();
    expect(order).toEqual(['first:start']);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  it('serializes tasks from different tabs through one Web Lock', async () => {
    const locks = fakeLocks();
    vi.stubGlobal('navigator', { locks });
    // two NoteStorage instances = two tabs
    const tabA = new WriteLock();
    const tabB = new WriteLock();
    const order: string[] = [];
    let release!: () => void;

    const syncInA = tabA.run(async () => {
      order.push('A:start');
      await new Promise<void>((resolve) => (release = resolve));
      order.push('A:end');
    });
    await tick();
    const saveInB = tabB.run(async () => {
      order.push('B');
    });
    await tick();
    expect(order).toEqual(['A:start']);

    release();
    await Promise.all([syncInA, saveInB]);
    expect(order).toEqual(['A:start', 'A:end', 'B']);
    expect(locks.requested).toEqual([NOTES_WEB_LOCK, NOTES_WEB_LOCK]);
  });

  it('keeps the queue going after a task fails', async () => {
    vi.stubGlobal('navigator', { locks: fakeLocks() });
    const lock = new WriteLock();
    await expect(lock.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(lock.run(async () => 'next')).resolves.toBe('next');
  });
});
