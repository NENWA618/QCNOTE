export const LOCKED_MESSAGE =
  '当前设备未解锁（无法获取加密密钥）。请检查网络连接，或重新验证/注册当前设备后重试。';

/**
 * Thrown when notes can't be read or written. Mutations never fall back to
 * "assume there are no notes": doing so and then writing back would wipe the
 * user's data.
 */
export class NoteStorageError extends Error {
  constructor(
    message: string,
    readonly kind: 'locked' | 'read' | 'write',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'NoteStorageError';
  }
}
