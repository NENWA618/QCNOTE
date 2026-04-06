/**
 * XSS Protection Utilities
 * Provides input validation and output escaping to prevent XSS attacks
 */

/**
 * Escape HTML special characters
 * Prevents XSS by converting special characters to HTML entities
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Validate URL to prevent javascript: and data: protocols
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.href);
    // Only allow http and https protocols
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Sanitize user-provided class names
 * Only allows alphanumeric, hyphens, and underscores
 */
export function sanitizeClassName(className: string): string {
  return className.replace(/[^a-zA-Z0-9\-_]/g, '');
}

/**
 * Validate and sanitize email addresses
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length < 254;
}

/**
 * Remove potentially dangerous HTML attributes
 */
export function removeHtmlAttributes(html: string): string {
  // Remove event handlers (onclick, onload, etc.)
  let cleaned = html.replace(/\s*on\w+\s*=\s*['"][^'"]*['"]/gi, '');
  // Remove script tags
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove iframe tags
  cleaned = cleaned.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  return cleaned;
}

/**
 * Validate JSON string before parsing
 */
export function safeJsonParse<T = any>(jsonString: string, fallback?: T): T | undefined {
  try {
    // Basic validation - must be valid JSON
    const result = JSON.parse(jsonString);
    // Ensure it's an object or array, not a primitive that could be malicious
    if (typeof result === 'object' && result !== null) {
      return result as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Validate note content to prevent XSS
 * Used before storing or displaying user-generated markdown/HTML content
 */
export function validateNoteContent(content: string): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (!content || typeof content !== 'string') {
    return { isValid: false, warnings: ['Content must be a non-empty string'] };
  }

  if (content.length > 1000000) {
    warnings.push('Content exceeds 1MB (may cause performance issues)');
  }

  // Check for suspicious patterns
  if (/<script/i.test(content)) {
    warnings.push('Content contains <script> tags');
  }

  if (/javascript:/i.test(content)) {
    warnings.push('Content contains javascript: protocol');
  }

  if (/on\w+\s*=/i.test(content)) {
    warnings.push('Content contains event handlers (onclick, etc.)');
  }

  // Markdown links are OK, but watch for data: URIs
  if (/\[.*?\]\(data:/i.test(content)) {
    warnings.push('Content contains data: URI in markdown link');
  }

  return {
    isValid: warnings.length === 0,
    warnings,
  };
}

/**
 * Sanitize user input for URL parameters
 */
export function encodeUrlParam(param: string): string {
  return encodeURIComponent(param).replace(/%20/g, '+');
}

/**
 * Decode URL parameter safely
 */
export function decodeUrlParam(param: string): string {
  try {
    return decodeURIComponent(param.replace(/\+/g, '%20'));
  } catch {
    return '';
  }
}

/**
 * Create Content Security Policy compliant element attributes
 */
export function createSafeAttrs(attrs: Record<string, string>) {
  const safe: Record<string, string> = {};

  for (const [key, value] of Object.entries(attrs)) {
    // Prevent event handler attributes
    if (key.startsWith('on')) {
      continue;
    }

    // Sanitize URLs in href and src
    if (key === 'href' || key === 'src') {
      if (isValidUrl(value)) {
        safe[key] = value;
      }
      continue;
    }

    // Allow regular attributes
    if (typeof value === 'string' && value.length < 1000) {
      safe[key] = escapeHtml(value);
    }
  }

  return safe;
}

/**
 * Rate limit input validation
 * Prevents abuse by enforcing minimum time between submissions
 */
export function createRateLimiter(delayMs: number = 1000) {
  let lastSubmissionTime = 0;

  return {
    canSubmit(): boolean {
      const now = Date.now();
      if (now - lastSubmissionTime >= delayMs) {
        lastSubmissionTime = now;
        return true;
      }
      return false;
    },
    getRemainingTime(): number {
      const now = Date.now();
      const remaining = delayMs - (now - lastSubmissionTime);
      return Math.max(0, remaining);
    },
  };
}
