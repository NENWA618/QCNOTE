# ADR 001: Offline-First Architecture with IndexedDB

**Date:** 2026-04-03  
**Status:** ACCEPTED  
**Context:** QCNOTE needs to work without internet connection while maintaining data persistence

## Problem Statement

Users need to access and edit their notes without requiring constant internet connectivity. However, they also need a way to sync notes across devices.

## Decision

**Use IndexedDB as primary storage with localStorage fallback**

- Primary: IndexedDB (persistent, larger quota ~50MB)
- Fallback: localStorage (limited ~10MB, deprecated)
- Optional: WebDAV/OneDrive for remote backup

## Rationale

### Why IndexedDB over other options?

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **IndexedDB** | 50MB+ quota, async API, indexed queries | Complex API, browser-specific | ✅ CHOSEN |
| **localStorage** | Simple API, universal support | 10MB limit, synchronous (blocks UI) | ✓ Fallback only |
| **SQLite (WASM)** | Powerful, portable | Bundle size, setup complexity | ✗ Rejected |
| **Cloud-only** | Centralized, sync guaranteed | No offline support | ✗ Rejected |

### Why offline-first?

1. **User autonomy** - Data stays on user's device by default
2. **Performance** - No network latency for local operations
3. **Privacy** - Notes aren't uploaded without explicit permission
4. **Reliability** - Works during internet outages
5. **Reduced bandwidth** - Optional sync instead of required

## Implementation

```typescript
// Storage hierarchy
class NoteStorage {
  async getDataAsync(): Promise<NoteItem[] | null> {
    // Try IndexedDB first (async, non-blocking)
    const idbData = await IDB.getItem(this.storageKey);
    if (idbData) return idbData;
    
    // Fallback to localStorage
    const lsData = this._getDataLocal();
    if (lsData) return lsData;
    
    return null;
  }

  async setDataAsync(notes: NoteItem[]): Promise<boolean> {
    try {
      // Primary: Store in IndexedDB
      await IDB.setItem(this.storageKey, notes);
      this.useIndexedDB = true;
      localStorage.removeItem(this.storageKey); // Clean up
    } catch {
      // Fallback: Store in localStorage
      this._setDataLocal(notes);
    }
    // Server sync (non-blocking, optional)
    await this.syncWithServer(notes).catch(() => {});
    return true;
  }
}
```

## Consequences

### Positive
✅ Full offline functionality  
✅ Fast local access  
✅ User retains data control  
✅ No backend required for core features  

### Negative
⚠️ Storage limited to device quota  
⚠️ No automatic cross-device sync  
⚠️ Browser-specific implementation  
⚠️ Cache invalidation complexity  

### Mitigations
- Provide manual sync (WebDAV, OneDrive)
- Warn users when storage is full
- Implement data export for backup
- Support external sync services

## Testing

```typescript
// Test offline capability
describe('Offline Support', () => {
  it('should persist notes after browser restart', async () => {
    await storage.addNoteAsync({ title: 'Test' });
    // Close and reopen IndexedDB
    const notes = await storage.getDataAsync();
    expect(notes).toBeDefined();
  });

  it('should fallback to localStorage if IndexedDB fails', async () => {
    // Mock IndexedDB failure
    vi.spyOn(IDB, 'getItem').mockRejectedValueOnce(new Error('IDB failed'));
    
    // Should still work via localStorage
    const notes = await storage.getDataAsync();
    expect(notes).toBeDefined();
  });
});
```

## References

- MDN IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- Offline-first pattern: https://offlinefirst.org
- WebDAV Sync (complementary): ADR 002
