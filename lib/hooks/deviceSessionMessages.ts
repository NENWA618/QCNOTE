// Cross-tab device-session messaging: message shapes, storage keys, and the
// parser for the legacy localStorage-based fallback transport.

export const CHANNEL_NAME = 'qcnote-session-channel';
export const BROADCAST_KEY = 'qcnote:deviceSessionTokenBroadcast';
export const REQUEST_KEY = 'qcnote:deviceSessionTokenRequest';
export const RESPONSE_KEY = 'qcnote:deviceSessionTokenResponse';

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

export type DeviceSessionBroadcastMessageInternal = DeviceSessionBroadcastMessage & {
  legacyKey?: string;
};

export function createRandomId(): string {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function parseDeviceSessionBroadcastMessage(
  raw: string,
  key: string,
): DeviceSessionBroadcastMessageInternal | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (typeof parsed.type === 'string') {
      return parsed as DeviceSessionBroadcastMessage;
    }

    if (key === BROADCAST_KEY && typeof parsed.action === 'string') {
      if (parsed.action === 'set' && typeof parsed.token === 'string') {
        return {
          type: 'token:set',
          sourceId: String(parsed.sourceId),
          userId: String(parsed.userId),
          token: parsed.token,
          timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now(),
        };
      }
      if (parsed.action === 'remove') {
        return {
          type: 'token:remove',
          sourceId: String(parsed.sourceId),
          userId: String(parsed.userId),
          timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now(),
        };
      }
    }

    if (key === REQUEST_KEY && typeof parsed.requestId === 'string') {
      return {
        type: 'token:request',
        sourceId: String(parsed.sourceId),
        requestId: parsed.requestId,
        userId: String(parsed.userId),
        timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now(),
        legacyKey: key,
      };
    }

    if (
      key === RESPONSE_KEY &&
      typeof parsed.requestId === 'string' &&
      typeof parsed.token === 'string'
    ) {
      return {
        type: 'token:response',
        sourceId: String(parsed.sourceId),
        requestId: parsed.requestId,
        userId: String(parsed.userId),
        token: parsed.token,
        timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now(),
        legacyKey: key,
      };
    }

    return null;
  } catch {
    return null;
  }
}
