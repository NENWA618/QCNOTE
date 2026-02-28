import IDB from './idb';

export interface ReminderItem {
  id?: string;
  title: string;
  body: string;
  targetAt: string;
  localOnly?: boolean;
}

const REM_KEY = 'NOTE_LOCAL_REMINDERS';

async function getLocalReminders(): Promise<ReminderItem[]> {
  const data = await IDB.getItem<ReminderItem[]>(REM_KEY);
  return data || [];
}
async function saveLocalReminders(arr: ReminderItem[]) {
  await IDB.setItem(REM_KEY, arr);
}

// minimal reminder parser + client API wrapper
export async function scheduleReminderFromText(text: string) {
  // naive parsing: 支持 "提醒我在 YYYY-MM-DD HH:MM 做 内容" 或 "提醒我明天 HH:MM 做 内容" 或 "提醒我在 HH:MM 做 内容"
  const r1 = /提醒我(?:在)?\s*(\d{4}-\d{1,2}-\d{1,2})\s*(\d{1,2}:\d{2})\s*(?:做|去|)\s*(.+)/.exec(text);
  const r2 = /提醒我(?:明天)\s*(\d{1,2}:\d{2})\s*(?:做|去|)\s*(.+)/.exec(text);
  const r3 = /提醒我(?:在)?\s*(\d{1,2}:\d{2})\s*(?:做|去|)\s*(.+)/.exec(text);
  let target: string | null = null;
  let title = '提醒';
  let body = '';
  if (r1) {
    const date = r1[1]; const time = r1[2]; body = r1[3]; target = new Date(`${date}T${time}:00`).toISOString();
  } else if (r2) {
    const now = new Date(); const tomorrow = new Date(now.getTime() + 24*3600*1000);
    const hm = r2[1]; body = r2[2];
    const td = `${tomorrow.getFullYear()}-${tomorrow.getMonth()+1}-${tomorrow.getDate()}T${hm}:00`;
    target = new Date(td).toISOString();
  } else if (r3) {
    const now = new Date(); const dateStr = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`; const hm = r3[1]; body = r3[2];
    target = new Date(`${dateStr}T${hm}:00`).toISOString();
  } else {
    return { ok: false, message: '无法解析提醒时间，请使用 “提醒我在 YYYY-MM-DD HH:MM 做 X” 或类似格式' };
  }

  const serverBase = (process.env.NEXT_PUBLIC_CHARACTER_SERVER_URL || '').replace(/\/$/, '');
  const url = (serverBase || '') + '/reminders';
  // always save locally first
  const localRec: ReminderItem = { title, body, targetAt };
  const locals = await getLocalReminders();
  locals.push(localRec);
  await saveLocalReminders(locals);

  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body, targetAt: target }) });
    if (!res.ok) {
      return { ok: false, message: 'server-error' };
    }
    const data = await res.json();
    if (data && data.ok) {
      // mark local record as synced (optional: remove or add id)
      const updated = locals.map((r) => (r === localRec ? { ...r, id: data.id, localOnly: false } : r));
      await saveLocalReminders(updated);
      return { ok: true, id: data.id, targetAt: target };
    }
    return { ok: false, message: 'server-failed' };
  } catch (e) {
    // network error, keep local only
    return { ok: false, message: e && e.message };
  }
}

// try to sync unsent reminders with server when connectivity returns
export async function syncLocalReminders() {
  const locals = await getLocalReminders();
  if (locals.length === 0) return;
  const serverBase = (process.env.NEXT_PUBLIC_CHARACTER_SERVER_URL || '').replace(/\/$/, '');
  const url = (serverBase || '') + '/reminders';
  const updated: ReminderItem[] = [];
  for (const r of locals) {
    if (r.id && !r.localOnly) {
      updated.push(r);
      continue;
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: r.title, body: r.body, targetAt: r.targetAt }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          updated.push({ ...r, id: data.id, localOnly: false });
          continue;
        }
      }
    } catch {
      // ignore, keep local
    }
    updated.push(r); // keep for retry later
  }
  await saveLocalReminders(updated);
}

