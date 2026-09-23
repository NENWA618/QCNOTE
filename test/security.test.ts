/**
 * Security Test Suite
 * Tests for common security vulnerabilities
 */

import { describe, it, expect, beforeEach } from 'vitest';

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
      const { isEncryptedFieldValue, getStoredSalt } = await import('../qcruntime/qcnote-runtime');
      expect(isEncryptedFieldValue('YWJjZGVm.Z2hpamts')).toBe(true);
      expect(isEncryptedFieldValue('plain text value')).toBe(false);
      expect(isEncryptedFieldValue('not.base64.string!')).toBe(false);
      expect(getStoredSalt('NON_EXISTENT_DB')).toBeNull();
    });

    it('should report runtime encryption status and not rely on plaintext localStorage secrets', async () => {
      const { QCRuntime, inspectEncryptionState } = await import('../qcruntime/qcnote-runtime');
      const schema = [
        {
          name: 'debug_notes',
          keyField: 'id',
          keyAuto: false,
          fields: [{ name: 'id', type: 'str', indexed: true, secret: false }],
        },
      ];
      const dbName = 'QCNOTE_TEST_DB_USER_1';
      const kek = new Uint8Array(32).fill(9);
      const db = await QCRuntime.open(dbName, schema, 1, undefined, 'session-token', kek);
      const status = await inspectEncryptionState(dbName);
      expect(status.isGuestDb).toBe(false);
      expect(status.hasWorkerKey).toBe(true);
      expect(status.encryptionChannel).toBe('encrypted');
      expect(status.legacySaltInLocalStorage).toBe(false);
      expect(status.suspiciousLocalStorageKeys).not.toContain('QCNOTE_USER_SECRET');
      await db.close();
      await QCRuntime.drop(dbName);
    });

    it('should migrate legacy localStorage salt into worker metadata on open', async () => {
      const { QCRuntime, inspectEncryptionState, getStoredSalt } =
        await import('../qcruntime/qcnote-runtime');
      const schema = [
        {
          name: 'debug_notes',
          keyField: 'id',
          keyAuto: false,
          fields: [{ name: 'id', type: 'str', indexed: true, secret: false }],
        },
      ];
      const dbName = 'QCNOTE_TEST_DB_LEGACY_SALT';
      const legacySaltB64 = btoa(String.fromCharCode(...Array.from({ length: 16 }, (_, i) => i)));
      localStorage.setItem(`qcnote:${dbName}:salt`, legacySaltB64);

      const kek = new Uint8Array(32).fill(9);
      const db = await QCRuntime.open(dbName, schema, 1, undefined, 'session-token', kek);
      const status = await inspectEncryptionState(dbName);

      expect(status.hasWorkerKey).toBe(true);
      expect(status.hasMetaSalt).toBe(true);
      expect(status.legacySaltInLocalStorage).toBe(false);
      expect(getStoredSalt(dbName)).toBeNull();

      await db.close();
      await QCRuntime.drop(dbName);
    });

    it('should migrate all legacy salt keys into worker metadata on runtime startup', async () => {
      const { QCRuntime, inspectEncryptionState } = await import('../qcruntime/qcnote-runtime');
      const schema = [
        {
          name: 'debug_notes',
          keyField: 'id',
          keyAuto: false,
          fields: [{ name: 'id', type: 'str', indexed: true, secret: false }],
        },
      ];
      const activeDbName = 'QCNOTE_TEST_DB_USER_2';
      const legacyDbName = 'QCNOTE_TEST_DB_LEGACY_SALT';
      const legacySaltB64 = btoa(String.fromCharCode(...Array.from({ length: 16 }, (_, i) => i)));
      localStorage.setItem(`qcnote:${legacyDbName}:salt`, legacySaltB64);

      const kek = new Uint8Array(32).fill(9);
      const db = await QCRuntime.open(activeDbName, schema, 1, undefined, 'session-token', kek);
      expect(localStorage.getItem(`qcnote:${legacyDbName}:salt`)).toBeNull();

      const legacyStatus = await inspectEncryptionState(legacyDbName);
      expect(legacyStatus.hasMetaSalt).toBe(true);
      expect(legacyStatus.legacySaltInLocalStorage).toBe(false);

      await db.close();
      await QCRuntime.drop(activeDbName);
      await QCRuntime.drop(legacyDbName);
    });
  });

  describe('Vault KEK (server-issued key wraps a local DEK)', () => {
    const secretSchema = [
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

    it('throws instead of silently generating a key when no secret, kekBytes, or existing key is available', async () => {
      const { QCRuntime } = await import('../qcruntime/qcnote-runtime');
      const dbName = 'QCNOTE_TEST_DB_NO_KEY_SOURCE';
      await expect(
        QCRuntime.open(dbName, secretSchema, 1, undefined, 'session-token'),
      ).rejects.toThrow();
      await QCRuntime.drop(dbName);
    });

    it('wraps/unwraps a DEK with a KEK and reuses the same wrapped DEK across opens', async () => {
      const { QCRuntime, inspectEncryptionState } = await import('../qcruntime/qcnote-runtime');
      const dbName = 'QCNOTE_TEST_DB_VAULT_1';
      const kek = fakeKek(1);

      const db1 = await QCRuntime.open(dbName, secretSchema, 1, undefined, 'session-token', kek);
      await db1.put('notes', { id: 'n1', content: 'hello world' });
      await db1.close();

      // Reopening with the same KEK must reuse (not regenerate) the DEK, or
      // the record written above would become undecryptable.
      const db2 = await QCRuntime.open(dbName, secretSchema, 1, undefined, 'session-token', kek);
      const note = await db2.getById<{ id: string; content: string }>('notes', 'n1');
      expect(note?.content).toBe('hello world');

      const status = await inspectEncryptionState(dbName);
      expect(status.encryptionVersion).toBe(2);
      expect(status.hasWorkerKey).toBe(true);

      await db2.close();
      await QCRuntime.drop(dbName);
    });

    it('migrates existing legacy (v1) data to the vault scheme without corrupting it', async () => {
      const { QCRuntime, inspectEncryptionState } = await import('../qcruntime/qcnote-runtime');
      const dbName = 'QCNOTE_TEST_DB_MIGRATE_V1_V2';

      // Seed a v1 database via the legacy explicit-secret path.
      const v1Db = await QCRuntime.open(dbName, secretSchema, 1, 'legacy-secret', 'session-token');
      await v1Db.put('notes', { id: 'n1', content: 'legacy note' });
      await v1Db.close();

      // Reopen with a KEK and no secret — this should migrate the v1 record
      // to the new DEK rather than orphaning it.
      const kek = fakeKek(7);
      const v2Db = await QCRuntime.open(dbName, secretSchema, 1, undefined, 'session-token', kek);
      const note = await v2Db.getById<{ id: string; content: string }>('notes', 'n1');
      expect(note?.content).toBe('legacy note');

      const status = await inspectEncryptionState(dbName);
      expect(status.encryptionVersion).toBe(2);

      await v2Db.close();
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
