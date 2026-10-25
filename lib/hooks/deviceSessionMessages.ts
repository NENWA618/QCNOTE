// Cross-tab device-session messaging over BroadcastChannel: channel name and
// message shapes.

export const CHANNEL_NAME = 'qcnote-session-channel';

export type DeviceSessionBroadcastMessage =
  | {
      type: 'token:set';
      sourceId: string;
      userId: string;
      token: string;
      timestamp: number;
    }
  | {
      type: 'token:remove';
      sourceId: string;
      userId: string;
      timestamp: number;
    }
  | {
      type: 'token:request';
      sourceId: string;
      requestId: string;
      userId: string;
      timestamp: number;
    }
  | {
      type: 'token:response';
      sourceId: string;
      requestId: string;
      userId: string;
      token: string;
      timestamp: number;
    };

export function createRandomId(): string {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
