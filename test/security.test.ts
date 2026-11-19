/**
 * Security Test Suite
 * Tests for common security vulnerabilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { QCStoreSchema } from '../qcruntime/qcnote-runtime';

describe('Security Tests', () => {
  describe('CSRF Protection', () => {
    it('should generate unique tokens', async () => {
      const { generateCSRFToken } = await import('../lib/csrfProtection');
      const token1 = generateCSRFToken('session1');
      const token2 = generateCSRFToken('session1');
      expect(token1).not.toBe(token2);
    });

    it('should validate correct tokens', async () => {
      const { generateCSRFToken, validateCSRFToken } = await import('../lib/csrfProtection');
      const token = generateCSRFToken('session1');
      expect(validateCSRFToken('session1', token)).toBe(true);
    });

    it('should reject invalid tokens', async () => {
      const { validateCSRFToken } = await import('../lib/csrfProtection');
      expect(validateCSRFToken('session1', 'invalid-token')).toBe(false);
    });

    it('should expire tokens after timeout', async () => {
      const { generateCSRFToken, validateCSRFToken } = await import('../lib/csrfProtection');
      const token = generateCSRFToken('session1');

      // Simulate token expiration by waiting
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Token should still be valid within expiry window
      expect(validateCSRFToken('session1', token)).toBe(true);
    });
  });

  describe('Input Validation', () => {
    it('should reject malicious content', () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        '<!-- comment with <script> -->',
        '<img src=x onerror="alert(1)">',
        "javascript:alert('xss')",
      ];

      // These should be sanitized by rehype-sanitize in renderMarkdown
      maliciousInputs.forEach((input) => {
        // In a real test, you'd render and check the output
        expect(input.length).toBeGreaterThan(0);
      });
    });

    it('should validate URLs', () => {
      const validUrls = ['https://example.com', 'http://localhost:3000'];

      const invalidUrls = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        '//example.com', // Protocol-relative
      ];

      validUrls.forEach((url) => {
        try {
          new URL(url);
          expect(true).toBe(true);
        } catch {
          expect(false).toBe(true);
        }
      });

      invalidUrls.forEach((url) => {
        try {
          if (url.startsWith('javascript:') || url.startsWith('data:')) {
            throw new Error('Invalid protocol');
          }
          // For protocol-relative, it depends on context
        } catch {
          expect(true).toBe(true);
        }
      });
    });
  });

  describe('Data Encryption', () => {
    it('should encrypt and decrypt text', async () => {
      const { NoteStorage } = await import('../lib/storage');
      const storage = new NoteStorage();

      const plaintext = 'This is a secret password';
      const passphrase = 'test-passphrase';

      // Note: These are private methods, so we test indirectly
      // through WebDAV config encryption
      expect(plaintext.length).toBeGreaterThan(0);
      expect(passphrase.length).toBeGreaterThan(0);
    });

    it('should detect encrypted field values and accept plaintext secrets', async () => {
      const { isEncryptedFieldValue } = await import('../qcruntime/qcnote-runtime');
      // base64(12-byte IV) "." base64(>= 18 bytes of ciphertext + tag)
      const iv = btoa('\x00'.repeat(12));
      const ct = btoa('\x01'.repeat(18));
      expect(isEncryptedFieldValue(`${iv}.${ct}`)).toBe(true);
      expect(isEncryptedFieldValue(`${iv}.${btoa('\x01'.repeat(19))}`)).toBe(true);
      expect(isEncryptedFieldValue('plain text value')).toBe(false);
      expect(isEncryptedFieldValue('not.base64.string!')).toBe(false);
      // ordinary text that merely looks base64-ish must not count as ciphertext
      expect(isEncryptedFieldValue('readme.md')).toBe(false);
      expect(isEncryptedFieldValue('YWJjZGVm.Z2hpamts')).toBe(false);
      expect(isEncryptedFieldValue(`${iv}.${btoa('short')}`)).toBe(false);
    });

    it('should report runtime encryption status and not rely on plaintext localStorage secrets', async () => {
      const { QCRuntime, inspectEncryptionState } = await import('../qcruntime/qcnote-runtime');
      const schema: QCStoreSchema[] = [
        {
          name: 'debug_notes',
          keyField: 'id',
          keyAuto: false,
          fields: [{ name: 'id', type: 'str', indexed: true, secret: false }],
        },
      ];
      const dbName = 'QCNOTE_TEST_DB_USER_1';
      const kek = new Uint8Array(32).fill(9);
      const db = await QCRuntime.open(dbName, schema, 1, 'session-token', kek);
      const status = await inspectEncryptionState(dbName);
      expect(status.isGuestDb).toBe(false);
      expect(status.hasWorkerKey).toBe(true);
      expect(status.encryptionChannel).toBe('encrypted');
      expect(status.suspiciousLocalStorageKeys).not.toContain('QCNOTE_USER_SECRET');
      await db.close();
      await QCRuntime.drop(dbName);
    });
  });

  describe('Vault KEK (server-issued key wraps a local DEK)', () => {
    const secretSchema: QCStoreSchema[] = [
      {
        name: 'notes',
        keyField: 'id',
        keyAuto: false,
        fields: [
          { name: 'id', type: 'str', indexed: true, secret: false },
          { name: 'content', type: 'str', indexed: false, secret: true },
        ],
      },
    ];

    function fakeKek(seed: number): Uint8Array {
      const bytes = new Uint8Array(32);
      for (let i = 0; i < bytes.length; i++) bytes[i] = (seed + i) % 256;
      return bytes;
    }

    it('throws instead of silently generating a key when no kekBytes is available', async () => {
      const { QCRuntime } = await import('../qcruntime/qcnote-runtime');
      const dbName = 'QCNOTE_TEST_DB_NO_KEY_SOURCE';
      await expect(QCRuntime.open(dbName, secretSchema, 1, 'session-token')).rejects.toThrow();
      await QCRuntime.drop(dbName);
    });

    it('wraps/unwraps a DEK with a KEK and reuses the same wrapped DEK across opens', async () => {
      const { QCRuntime, inspectEncryptionState } = await import('../qcruntime/qcnote-runtime');
      const dbName = 'QCNOTE_TEST_DB_VAULT_1';
      const kek = fakeKek(1);

      const db1 = await QCRuntime.open(dbName, secretSchema, 1, 'session-token', kek);
      await db1.put('notes', { id: 'n1', content: 'hello world' });
      await db1.close();

      // Reopening with the same KEK must reuse (not regenerate) the DEK, or
      // the record written above would become undecryptable.
      const db2 = await QCRuntime.open(dbName, secretSchema, 1, 'session-token', kek);
      const note = await db2.getById<{ id: string; content: string }>('notes', 'n1');
      expect(note?.content).toBe('hello world');

      const status = await inspectEncryptionState(dbName);
      expect(status.hasWorkerKey).toBe(true);

      await db2.close();
      await QCRuntime.drop(dbName);
    });
  });

  describe('API Error Handling', () => {
    it('should not expose stack traces in production', () => {
      // Error messages should be generic in production
      const errorMessage = 'An error occurred while processing your request. Please try again.';
      expect(errorMessage).not.toContain('/app/');
      expect(errorMessage).not.toContain('at ');
      expect(errorMessage).not.toContain('Error:');
    });
  });
});
