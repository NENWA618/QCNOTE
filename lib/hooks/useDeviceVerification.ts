import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { NoteStorage } from '../storage';
import { DEVICE_SESSION_TOKEN_KEY } from '../storage/deviceSession';
import {
  CHANNEL_NAME,
  createRandomId,
  type DeviceSessionBroadcastMessage,
} from './deviceSessionMessages';

export type DeviceVerificationStatus = 'idle' | 'pending' | 'verified' | 'failed';

interface UseDeviceVerificationOptions {
  /** Signed-in user id, or null for guests. */
  userId: string | null;
  storageRef: MutableRefObject<NoteStorage | null>;
  loadNotes: () => Promise<void>;
  /** Called when the active user changes, so the page can drop the previous user's data. */
  onUserChange: () => void;
}

const getApiUrl = (path: string) => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
};

// /api/device/* 接口的通用响应结构
type DeviceApiResult = {
  success?: boolean;
  token?: string;
  error?: { message?: string };
};

async function validateDeviceSessionToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(getApiUrl('/api/device/session/validate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const result = (await response.json()) as DeviceApiResult | null;
    return response.ok && result?.success === true;
  } catch (error) {
    console.error('[Device Session] Validation error', error);
    return false;
  }
}

async function createDeviceSessionTokenOnServer(): Promise<{ token?: string; error?: string }> {
  try {
    const response = await fetch(getApiUrl('/api/device/session/create'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const result = (await response.json().catch(() => null)) as DeviceApiResult | null;
    if (response.status === 401) {
      // 账号在别处重新登录后，这个会话会被后端拒绝
      return { error: '登录已失效，该账号可能已在其他设备或浏览器登录，请重新登录。' };
    }
    if (!response.ok || !result?.success) {
      return {
        error: result?.error?.message || '设备会话令牌创建失败，请稍后重试。',
      };
    }
    return { token: result.token };
  } catch (error) {
    console.error('[Device Session] Create error', error);
    return { error: '设备会话令牌创建失败，请检查网络后重试。' };
  }
}

/**
 * Obtains the device session token for the signed-in user's current login
 * session (an account has exactly one active login session; signing in
 * elsewhere invalidates it), keeps that per-tab token in sync across browser
 * tabs, and switches NoteStorage to the user's namespace once verified.
 */
export function useDeviceVerification({
  userId,
  storageRef,
  loadNotes,
  onUserChange,
}: UseDeviceVerificationOptions) {
  const [deviceVerificationStatus, setDeviceVerificationStatus] =
    useState<DeviceVerificationStatus>('idle');
  const [deviceVerificationMessage, setDeviceVerificationMessage] = useState('');

  const tabIdRef = useRef<string>(createRandomId());
  const pendingDeviceSessionResponseRef = useRef<{
    requestId: string;
    userId: string;
    resolve: (granted: boolean) => void;
    timeoutId: number;
  } | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const loadNotesRef = useRef<(() => Promise<void>) | null>(null);

  const postDeviceSessionBroadcastMessage = useCallback(
    (message: DeviceSessionBroadcastMessage) => {
      broadcastChannelRef.current?.postMessage(message);
    },
    [],
  );

  const clearDeviceSessionToken = useCallback(
    (clearedUserId?: string, broadcast = true) => {
      if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
      sessionStorage.removeItem(DEVICE_SESSION_TOKEN_KEY);
      if (broadcast && clearedUserId) {
        postDeviceSessionBroadcastMessage({
          type: 'token:remove',
          sourceId: tabIdRef.current,
          userId: clearedUserId,
          timestamp: Date.now(),
        });
      }
    },
    [postDeviceSessionBroadcastMessage],
  );

  const setDeviceSessionToken = useCallback(
    (tokenUserId: string | null, token: string | null, broadcast = true) => {
      if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
      if (!tokenUserId || !token) {
        sessionStorage.removeItem(DEVICE_SESSION_TOKEN_KEY);
        return;
      }
      sessionStorage.setItem(
        DEVICE_SESSION_TOKEN_KEY,
        JSON.stringify({ userId: tokenUserId, token }),
      );
      if (broadcast) {
        postDeviceSessionBroadcastMessage({
          type: 'token:set',
          sourceId: tabIdRef.current,
          userId: tokenUserId,
          token,
          timestamp: Date.now(),
        });
      }
    },
    [postDeviceSessionBroadcastMessage],
  );

  const getDeviceSessionToken = useCallback((): string | null => {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(DEVICE_SESSION_TOKEN_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as { userId: string; token: string };
      if (!parsed?.userId || !parsed?.token || parsed.userId !== userId) {
        sessionStorage.removeItem(DEVICE_SESSION_TOKEN_KEY);
        return null;
      }
      return parsed.token;
    } catch {
      sessionStorage.removeItem(DEVICE_SESSION_TOKEN_KEY);
      return null;
    }
  }, [userId]);

  const handleDeviceSessionMessage = useCallback(
    async (message: DeviceSessionBroadcastMessage) => {
      if (message.sourceId === tabIdRef.current) return;

      if (message.type === 'token:set' || message.type === 'token:remove') {
        if (!userId || message.userId !== userId) return;
      }

      if (message.type === 'token:set') {
        setDeviceSessionToken(userId, message.token, false);
        if (
          pendingDeviceSessionResponseRef.current &&
          pendingDeviceSessionResponseRef.current.userId === userId
        ) {
          pendingDeviceSessionResponseRef.current.resolve(true);
          window.clearTimeout(pendingDeviceSessionResponseRef.current.timeoutId);
          pendingDeviceSessionResponseRef.current = null;
        }
        return;
      }

      if (message.type === 'token:remove') {
        clearDeviceSessionToken(undefined, false);
        if (deviceVerificationStatus === 'verified') {
          setDeviceVerificationStatus('failed');
          setDeviceVerificationMessage('当前登录会话已在其他标签页失效，请刷新页面后重试。');
          if (storageRef.current && loadNotesRef.current) {
            await storageRef.current.setCurrentUser(null);
            await loadNotesRef.current();
          }
        }
        return;
      }

      if (message.type === 'token:request') {
        if (!userId || message.userId !== userId) return;
        const token = getDeviceSessionToken();
        if (token) {
          postDeviceSessionBroadcastMessage({
            type: 'token:response',
            sourceId: tabIdRef.current,
            requestId: message.requestId,
            userId,
            token,
            timestamp: Date.now(),
          });
        }
        return;
      }

      if (message.type === 'token:response') {
        if (!pendingDeviceSessionResponseRef.current) return;
        if (message.requestId !== pendingDeviceSessionResponseRef.current.requestId) return;
        if (message.userId !== pendingDeviceSessionResponseRef.current.userId) return;
        setDeviceSessionToken(message.userId, message.token);
        pendingDeviceSessionResponseRef.current.resolve(true);
        window.clearTimeout(pendingDeviceSessionResponseRef.current.timeoutId);
        pendingDeviceSessionResponseRef.current = null;
      }
    },
    [
      userId,
      storageRef,
      setDeviceSessionToken,
      clearDeviceSessionToken,
      deviceVerificationStatus,
      getDeviceSessionToken,
      postDeviceSessionBroadcastMessage,
    ],
  );

  const requestDeviceSessionTokenFromOtherTabs = useCallback(
    (requestUserId: string): Promise<boolean> => {
      if (typeof window === 'undefined') {
        return Promise.resolve(false);
      }

      const existingToken = getDeviceSessionToken();
      if (existingToken) {
        return Promise.resolve(true);
      }

      return new Promise((resolve) => {
        const requestId = createRandomId();
        const timeoutId = window.setTimeout(() => {
          if (pendingDeviceSessionResponseRef.current?.requestId === requestId) {
            if (getDeviceSessionToken()) {
              pendingDeviceSessionResponseRef.current.resolve(true);
            } else {
              pendingDeviceSessionResponseRef.current.resolve(false);
            }
            pendingDeviceSessionResponseRef.current = null;
          }
        }, 400);

        pendingDeviceSessionResponseRef.current = {
          requestId,
          userId: requestUserId,
          resolve,
          timeoutId,
        };

        postDeviceSessionBroadcastMessage({
          type: 'token:request',
          sourceId: tabIdRef.current,
          requestId,
          userId: requestUserId,
          timestamp: Date.now(),
        });
      });
    },
    [getDeviceSessionToken, postDeviceSessionBroadcastMessage],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const channel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannelRef.current = channel;
    channel.onmessage = (event) => {
      handleDeviceSessionMessage(event.data as DeviceSessionBroadcastMessage);
    };

    return () => {
      channel.close();
      broadcastChannelRef.current = null;
    };
  }, [handleDeviceSessionMessage]);

  useEffect(() => {
    loadNotesRef.current = loadNotes;
  }, [loadNotes]);

  useEffect(() => {
    if (!storageRef.current) return;

    const updateUserStorage = async () => {
      if (!userId) {
        setDeviceVerificationStatus('idle');
        setDeviceVerificationMessage('');
        clearDeviceSessionToken();
        await storageRef.current?.setCurrentUser(null);
        await loadNotes();
        return;
      }

      setDeviceVerificationStatus('pending');
      setDeviceVerificationMessage('正在校验登录会话，加载个人笔记需要先完成验证。');
      await storageRef.current?.setCurrentUser(null);
      onUserChange();

      const synced = await requestDeviceSessionTokenFromOtherTabs(userId);
      if (synced) {
        const localToken = getDeviceSessionToken();
        if (localToken && (await validateDeviceSessionToken(localToken))) {
          await storageRef.current?.setCurrentUser(userId);
          await storageRef.current?.migrateGuestDataToUser();
          await loadNotes();
          setDeviceVerificationStatus('verified');
          setDeviceVerificationMessage('检测到其他标签页已通过验证，已同步登录状态。');
          return;
        }
        clearDeviceSessionToken(userId);
      }

      const result = await createDeviceSessionTokenOnServer();
      if (!result.token) {
        clearDeviceSessionToken(userId);
        setDeviceVerificationStatus('failed');
        setDeviceVerificationMessage(result.error || '登录会话校验失败，无法加载个人笔记。');
        return;
      }

      setDeviceSessionToken(userId, result.token);
      await storageRef.current?.setCurrentUser(userId);
      await storageRef.current?.migrateGuestDataToUser();
      await loadNotes();
      setDeviceVerificationStatus('verified');
      setDeviceVerificationMessage('登录会话已验证。');
    };

    updateUserStorage();
  }, [
    userId,
    storageRef,
    clearDeviceSessionToken,
    getDeviceSessionToken,
    loadNotes,
    onUserChange,
    requestDeviceSessionTokenFromOtherTabs,
    setDeviceSessionToken,
  ]);

  useEffect(() => {
    if (deviceVerificationStatus === 'verified' && deviceVerificationMessage) {
      const timer = window.setTimeout(() => {
        setDeviceVerificationMessage('');
        setDeviceVerificationStatus('idle');
      }, 7000);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [deviceVerificationStatus, deviceVerificationMessage]);

  return { deviceVerificationStatus, deviceVerificationMessage };
}
