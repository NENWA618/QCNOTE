import { scheduleReminderFromText, syncLocalReminders, ReminderItem } from '../lib/reminder';
import IDB from '../lib/idb';

describe('reminder logic', () => {
  beforeEach(async () => {
    if (IDB.clearStore) await IDB.clearStore();
    // stub fetch
    (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true, id: 'srv1' }) }));
  });

  it('parses and schedules reminder, stores locally', async () => {
    const res = await scheduleReminderFromText('提醒我在 2099-01-01 10:00 做 测试');
    expect(res.ok).toBe(true);
    const locals = await IDB.getItem<ReminderItem[]>('NOTE_LOCAL_REMINDERS');
    expect(locals && locals.length).toBe(1);
    expect(locals![0].title).toBe('提醒');
  });

  it('syncLocalReminders retries unsent', async () => {
    // create local-only entry
    await IDB.setItem('NOTE_LOCAL_REMINDERS', [{ title: 'foo', body: '', targetAt: '2025-01-01T00:00:00Z', localOnly: true }]);
    await syncLocalReminders();
    const locals = await IDB.getItem<ReminderItem[]>('NOTE_LOCAL_REMINDERS');
    expect(locals && locals[0].id).toBe('srv1');
  });
});