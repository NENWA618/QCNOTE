import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { NoteStorage } from '../storage';
import { DEVICE_SESSION_TOKEN_KEY, getDeviceFingerprint } from '../storage/deviceSession';
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
  firstTime?: boolean;
  error?: { message?: string };
};

async function validateDeviceSessionToken(token: string, fingerprint: string): Promise<boolean> {
  try {
    const response = await fetch(getApiUrl('/api/device/session/validate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, fingerprint }),
    });
    const result = (await response.json()) as DeviceApiResult | null;
    return response.ok && result?.success === true;
  } catch (error) {
    console.error('[Device Session] Validation error', error);
    return false;
  }
}

async function createDeviceSessionTokenOnServer(
  fingerprint: string,
): Promise<{ token?: string; firstTime?: boolean; error?: string }> {
  try {
    const response = await fetch(getApiUrl('/api/device/session/create'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint }),
    });
    const result = (await response.json()) as DeviceApiResult | null;
    if (!response.ok || !result?.success) {
      return {
        error:
          result?.error?.message ||
          'Failed to create device session token. Please retry or verify your device again.',
      };
    }
    return { token: result.token, firstTime: result.firstTime };
  } catch (error) {
    console.error('[Device Session] Create error', error);
    return { error: '设备会话令牌创建失败，请检查网络后重试。' };
  }
}

/**
 * Verifies the current device for a signed-in user, keeps the per-tab device
 * session token in sync across browser tabs, and switches NoteStorage to the
 * user's namespace once verified.
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
          setDeviceVerificationMessage('当前设备会话已在其他标签页失效，请重新验证。');
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

  const verifyDeviceFingerprint = useCallback(async () => {
    if (!userId) {
      return { allowed: true, firstTime: false };
    }

    const fingerprint = await getDeviceFingerprint();
    if (!fingerprint) {
      return { allowed: false, message: '无法计算设备指纹，无法继续加载笔记。' };
    }

    try {
      const response = await fetch('/api/device/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint }),
      });
      const result = (await response.json()) as DeviceApiResult | null;
      if (!response.ok || !result?.success) {
        return {
          allowed: false,
          message:
            result?.error?.message || '设备未通过验证。请使用已登记设备登录，或点击下方重置指纹。',
        };
      }
      return {
        allowed: true,
        firstTime: result.firstTime === true,
      };
    } catch (error) {
      console.error('[Device Verification] Error verifying device fingerprint', error);
      return {
        allowed: false,
        message: '设备验证遇到网络错误，请检查网络后重试。',
      };
    }
  }, [userId]);

  const resetDeviceFingerprint = useCallback(async () => {
    if (!userId) return;

    setDeviceVerificationStatus('pending');
    setDeviceVerificationMessage('正在重置当前设备指纹，请稍候...');

    try {
      const response = await fetch('/api/device/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = (await response.json()) as DeviceApiResult | null;
      if (!response.ok || !result?.success) {
        throw new Error(result?.error?.message || '设备指纹重置失败');
      }

      const verification = await verifyDeviceFingerprint();
      if (!verification.allowed) {
        clearDeviceSessionToken();
        setDeviceVerificationStatus('failed');
        setDeviceVerificationMessage(
          verification.message || '设备指纹重置后仍未通过验证，请使用已登记设备。',
        );
        return;
      }

      const fingerprint = await getDeviceFingerprint();
      if (!fingerprint) {
        clearDeviceSessionToken();
        setDeviceVerificationStatus('failed');
        setDeviceVerificationMessage('无法计算设备指纹，无法继续加载笔记。');
        return;
      }

      const tokenResult = await createDeviceSessionTokenOnServer(fingerprint);
      if (!tokenResult.token) {
        clearDeviceSessionToken();
        setDeviceVerificationStatus('failed');
        setDeviceVerificationMessage(tokenResult.error || '设备会话令牌创建失败，请稍后重试。');
        return;
      }

      setDeviceSessionToken(userId, tokenResult.token);
      await storageRef.current?.setCurrentUser(userId);
      await storageRef.current?.migrateGuestDataToUser();
      await loadNotes();
      setDeviceVerificationStatus('verified');
      setDeviceVerificationMessage(
        verification.firstTime
          ? '已完成设备指纹重置，当前设备已登记为新设备。'
          : '当前设备已完成验证。',
      );
    } catch (error) {
      console.error('[Device Reset] Error resetting device fingerprint', error);
      setDeviceVerificationStatus('failed');
      setDeviceVerificationMessage(
        error instanceof Error ? error.message : '设备指纹重置失败，请稍后重试。',
      );
    }
  }, [
    userId,
    storageRef,
    verifyDeviceFingerprint,
    clearDeviceSessionToken,
    loadNotes,
    setDeviceSessionToken,
  ]);

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
      setDeviceVerificationMessage('正在校验当前设备，加载个人笔记需要先完成验证。');
      await storageRef.current?.setCurrentUser(null);
      onUserChange();

      const fingerprint = await getDeviceFingerprint();
      if (!fingerprint) {
        clearDeviceSessionToken(userId);
        setDeviceVerificationStatus('failed');
        setDeviceVerificationMessage('无法计算设备指纹，无法继续加载笔记。');
        return;
      }

      const synced = await requestDeviceSessionTokenFromOtherTabs(userId);
      if (synced) {
        const localToken = getDeviceSessionToken();
        if (localToken && (await validateDeviceSessionToken(localToken, fingerprint))) {
          await storageRef.current?.setCurrentUser(userId);
          await storageRef.current?.migrateGuestDataToUser();
          await loadNotes();
          setDeviceVerificationStatus('verified');
          setDeviceVerificationMessage('检测到当前设备在其他标签页已通过验证，已同步登录状态。');
          return;
        }
        clearDeviceSessionToken(userId);
      }

      const result = await createDeviceSessionTokenOnServer(fingerprint);
      if (!result.token) {
        clearDeviceSessionToken(userId);
        setDeviceVerificationStatus('failed');
        setDeviceVerificationMessage(result.error || '当前设备未通过验证，无法加载个人笔记。');
        return;
      }

      setDeviceSessionToken(userId, result.token);
      await storageRef.current?.setCurrentUser(userId);
      await storageRef.current?.migrateGuestDataToUser();
      await loadNotes();
      setDeviceVerificationStatus('verified');
      setDeviceVerificationMessage(
        result.firstTime ? '首次在此设备登录，已完成设备指纹登记。' : '当前设备已完成验证。',
      );
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

  return { deviceVerificationStatus, deviceVerificationMessage, resetDeviceFingerprint };
}
