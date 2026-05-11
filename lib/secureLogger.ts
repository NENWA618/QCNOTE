/**
 * Secure Logging Utility
 * Masks sensitive information (API keys, tokens, passwords) from logs
 */

interface SensitivePatterns {
  pattern: RegExp;
  replacement: string;
  description: string;
}

const SENSITIVE_PATTERNS: SensitivePatterns[] = [
  {
    pattern: /Bearer\s+[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/gi,
    replacement: 'Bearer ***JWT_REDACTED***',
    description: 'JWT Token',
  },
  {
    pattern: /Authorization:\s*[^\s]+/gi,
    replacement: 'Authorization: ***REDACTED***',
    description: 'Authorization Header',
  },
  {
    pattern: /(?:password|pwd|passwd)[\s:="']+[^\s,}]+/gi,
    replacement: 'password: ***REDACTED***',
    description: 'Password',
  },
  {
    pattern: /(?:api[_-]?key|apikey)[\s:="']+[^\s,}]+/gi,
    replacement: 'api_key: ***REDACTED***',
    description: 'API Key',
  },
  {
    pattern: /(?:access[_-]?token|token)[\s:="']+[^\s,}]+/gi,
    replacement: 'access_token: ***REDACTED***',
    description: 'Access Token',
  },
  {
    pattern: /client[_-]?secret[\s:="']+[^\s,}]+/gi,
    replacement: 'client_secret: ***REDACTED***',
    description: 'Client Secret',
  },
  {
    pattern: /\/\/\s*.*?(password|pwd|key|token|secret|api|credential)\s*=.*$/gim,
    replacement: '// ***REDACTED***',
    description: 'Comments with credentials',
  },
];

/**
 * Redact sensitive information from a message
 */
export function redactSensitiveData(message: string): string {
  let redacted = message;

  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }

  return redacted;
}

/**
 * Redact sensitive data from an error
 */
export function redactError(error: unknown): unknown {
  if (error instanceof Error) {
    const redactedMessage = redactSensitiveData(error.message);
    const redactedStack = error.stack ? redactSensitiveData(error.stack) : undefined;

    const cleanError = new Error(redactedMessage);
    cleanError.stack = redactedStack;
    return cleanError;
  }

  if (typeof error === 'string') {
    return redactSensitiveData(error);
  }

  if (typeof error === 'object' && error !== null) {
    const redactedObject: Record<string, any> = {};
    for (const [key, value] of Object.entries(error)) {
      if (key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('key')) {
        redactedObject[key] = '***REDACTED***';
      } else if (typeof value === 'string') {
        redactedObject[key] = redactSensitiveData(value);
      } else {
        redactedObject[key] = value;
      }
    }
    return redactedObject;
  }

  return error;
}

/**
 * Create a secure logger wrapper
 */
export function createSecureLogger(logger: any) {
  return {
    log: (...args: any[]) => {
      const redacted = args.map(arg => redactSensitiveData(String(arg)));
      logger.log(...redacted);
    },
    info: (...args: any[]) => {
      const redacted = args.map(arg => redactSensitiveData(String(arg)));
      logger.info?.(...redacted) || logger.log?.(...redacted);
    },
    warn: (...args: any[]) => {
      const redacted = args.map(arg => {
        if (arg instanceof Error) {
          return redactError(arg);
        }
        return redactSensitiveData(String(arg));
      });
      logger.warn?.(...redacted) || logger.log?.(...redacted);
    },
    error: (...args: any[]) => {
      const redacted = args.map(arg => {
        if (arg instanceof Error) {
          return redactError(arg);
        }
        return redactSensitiveData(String(arg));
      });
      logger.error?.(...redacted) || logger.log?.(...redacted);
    },
  };
}

/**
 * Audit log entry (for important events, with redaction)
 */
export interface AuditLogEntry {
  timestamp: string;
  level: 'INFO' | 'WARNING' | 'ERROR';
  action: string;
  userId?: string;
  ipAddress?: string;
  result: 'SUCCESS' | 'FAILURE';
  details?: string;
}

export function createAuditLog(entry: AuditLogEntry): AuditLogEntry {
  return {
    ...entry,
    timestamp: new Date().toISOString(),
    details: entry.details ? redactSensitiveData(entry.details) : undefined,
  };
}
