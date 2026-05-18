/**
 * Unified Error Handler
 * Centralizes error handling across the application
 */
import logger from './logger';

export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    public message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', 400, message, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super('NOT_FOUND', 404, message);
    this.name = 'NotFoundError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super('AUTHENTICATION_ERROR', 401, message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super('AUTHORIZATION_ERROR', 403, message);
    this.name = 'AuthorizationError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super('CONFLICT', 409, message);
    this.name = 'ConflictError';
  }
}

/**
 * Safely execute an async function with fallback
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  fallback: T,
  errorMessage?: string,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = errorMessage || 'Operation failed';
    logger.error(message, { error });
    return fallback;
  }
}

/**
 * Safely execute a sync function with fallback
 */
export function safeSync<T>(fn: () => T, fallback: T, errorMessage?: string): T {
  try {
    return fn();
  } catch (error) {
    const message = errorMessage || 'Operation failed';
    logger.error(message, { error });
    return fallback;
  }
}

/**
 * Retry logic for async operations
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  exponentialBackoff: boolean = true,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries - 1) {
        const delay = exponentialBackoff ? delayMs * Math.pow(2, attempt) : delayMs;
        logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
          error: lastError.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Handle unhandled promise rejections
 */
export function setupGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') {
    // Server-side error handling
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection:', {
        reason,
        promise,
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', { error });
      // In production, you might want to exit the process
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
    });
  } else {
    // Client-side error handling
    window.addEventListener('error', (event) => {
      logger.error('Uncaught error:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      logger.error('Unhandled promise rejection:', {
        reason: event.reason,
      });
      // Prevent the default handling (which would log to console)
      event.preventDefault();
    });
  }
}

/**
 * Format error response for API
 */
export function formatErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        ...(process.env.NODE_ENV === 'development' && { details: error.details }),
      },
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
      statusCode: 500,
    },
  };
}

const errorHandlerExports = {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  safeAsync,
  safeSync,
  retryAsync,
  setupGlobalErrorHandlers,
  formatErrorResponse,
};

export default errorHandlerExports;
