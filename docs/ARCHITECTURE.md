# NOTE Application - Architecture Overview

## System Architecture

NOTE 是一个**离线优先、隐私第一**的个人笔记管理系统。采用分层架构设计，支持本地存储、云同步和 AI 增强。

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Root (_app.tsx)                               │
│              ┌───────────────────────────────────────┐               │
│              │     Global Error Boundary             │               │
│              │  (Catch + fallback UI rendering)     │               │
│              └───────────────────────────────────────┘               │
│                               ↓                                      │
│                      User Interface Layer                             │
├─────────────────────────────────────────────────────────────────────┤
│  Pages: dashboard.tsx, index.tsx, contact.tsx                         │
│  Components: NoteEditor, NoteList, Calendar, KnowledgeGraph, etc.     │
│  State Management: React Context (NoteEditorContext)                  │
│  Styling: Tailwind CSS + Custom Design System                         │
└─────────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────────┐
│                  Business Logic Layer (lib/)                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌──────────────────────┐                 │
│  │  NoteStorage         │  │  Search Service      │                 │
│  │  - CRUD operations   │  │  - Lunr full-text    │                 │
│  │  - Link graph sync   │  │  - Vector search     │                 │
│  │  - Version history   │  │  - Caching (dirty)   │                 │
│  └──────────────────────┘  └──────────────────────┘                 │
│         ↓                           ↓                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐                 │
│  │  Sync Managers       │  │  AI Service          │                 │
│  │  - WebDAV            │  │  - Backend proxy     │                 │
│  │  - OneDrive          │  │  - Tag generation    │                 │
│  │  - Conflict resolve  │  │  - Summarization     │                 │
│  └──────────────────────┘  └──────────────────────┘                 │
│                                  ↓                                    │
│  ┌──────────────────────────────────────────────────┐                │
│  │  Graph Optimization (lib/graphOptimization.ts)   │                │
│  │  - Node clustering & LOD filtering               │                │
│  │  - Viewport virtualization                       │                │
│  │  - Layout caching & performance monitoring       │                │
│  └──────────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────────┐
│                  Data Persistence Layer                              │
├─────────────────────────────────────────────────────────────────────┤
│  IndexedDB (Primary) ← → localStorage (Fallback)                      │
└─────────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   API & Backend Layer                                │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────┐                  │
│  │    Request Handling (pages/api/*, server/)    │                  │
│  │     ↓                                          │                  │
│  │  ┌─────────────────────────────────────────┐   │                  │
│  │  │  Security Middleware                    │   │                  │
│  │  │  - Rate Limiting (30 req/min per IP)    │   │                  │
│  │  │  - Optional API Key validation          │   │                  │
│  │  │  - CORS configuration                   │   │                  │
│  │  └─────────────────────────────────────────┘   │                  │
│  │     ↓                                          │                  │
│  │  ┌─────────────────────────────────────────┐   │                  │
│  │  │  Route Handlers (server/index.ts)       │   │                  │
│  │  │  - AI endpoints (/api/ai/*)             │   │                  │
│  │  │  - Note sync (/syncNote)                │   │                  │
│  │  │  - Character reply (/reply)             │   │                  │
│  │  └─────────────────────────────────────────┘   │                  │
│  └────────────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
                                 ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     External Services                                │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   OpenAI     │  │   OneDrive   │  │   WebDAV     │               │
│  │  (via proxy) │  │  (OAuth 2.0) │  │  (encrypted) │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Components

### Data Layer (`lib/storage.ts`)

**Responsibility:** Central data management with multiple backend support

**Key Classes:**
- `NoteStorage` - Main CRUD interface with async/await support
- Data models: `NoteItem`, `NoteVersion`, `NoteConflict`, `WebDAVConfig`

**Features:**
- ✅ Dual storage: IndexedDB (primary) + localStorage (fallback)
- ✅ Wiki-style backlink resolution (`[[Note Title]]`)
- ✅ Version history with up to 20 past versions per note
- ✅ Soft delete & restore with trash management
- ✅ WebDAV sync with optional AES-256 encryption
- ✅ OneDrive integration via Microsoft Graph API
- ✅ Conflict detection and resolution strategies

**API Methods:**
```typescript
// CRUD
async addNoteAsync(note: Partial<NoteItem>): Promise<NoteItem>
async updateNoteAsync(id: string, updates: Partial<NoteItem>): Promise<NoteItem | null>
async deleteNoteAsync(id: string): Promise<boolean>
async getDataAsync(): Promise<NoteItem[] | null>
async setDataAsync(notes: NoteItem[]): Promise<boolean>

// Sync
async pushToWebDAVAsync(config: WebDAVConfig, encrypt?: boolean): Promise<boolean>
async pullFromWebDAVAsync(config: WebDAVConfig, decrypt?: boolean): Promise<boolean>

// Conflict management
async getConflictsAsync(): Promise<NoteConflict[]>
async resolveConflictAsync(id: string, resolvedNote: NoteItem): Promise<boolean>
```

### Search Service (`lib/indexer.ts`)

**Responsibility:** Dual-mode search with performance optimization

**Architecture:**
- **Full-text search:** Lunr.js (inverted index)
- **Semantic search:** Custom TF-based vectorization + cosine similarity
- **Caching:** In-memory cache + IndexedDB with dirty flag detection

**Performance Optimization:**
```
// Before: O(n) every search
searchNotes('query') → buildIndex() → search

// After: O(1) if clean, O(n) only if dirty
searchNotes('query') → check hash → use cache OR rebuild
```

**Cache Invalidation:**
- Triggered by: `addNoteAsync`, `updateNoteAsync`, `deleteNoteAsync`
- Method: Call `Indexer.invalidateIndex()` when notes change
- Recovery: `preloadCache()` loads from IndexedDB on startup

### State Management (`lib/noteContext.ts`)

**Pattern:** React Context API (no external state library needed)

**Exported:**
- `NoteEditorProvider` - Wraps app, provides editor state
- `useNoteEditor()` - Hook to access editor state and callbacks

**Benefits:**
- ✅ Eliminates prop drilling for 30+ editor props
- ✅ Centralized editor state management
- ✅ Easy to extend with new editor features
- ✅ Optional: Can split context if performance becomes an issue

### Error Boundary (`components/ErrorBoundary.tsx`)

**Responsibility:** Application-level fault tolerance

**Features:**
- Catches React component rendering errors
- Prevents entire app from crashing
- Shows user-friendly error page with recovery button
- Displays detailed error info in development mode
- Logs errors for monitoring

**Usage:**
```typescript
// Wrapped at root level (_app.tsx)
<ErrorBoundary>
  <main>
    <Component {...pageProps} />
  </main>
</ErrorBoundary>
```

**Error Handling Flow:**
```
Component Error → componentDidCatch() → Update UI state
                                      → Show error page
                                      → Offer reload option
```

### Security Middleware (`server/middleware.ts`)

**Responsibility:** Backend request protection and rate limiting

**Components:**

1. **Rate Limiting Middleware**
   - Limit: 30 requests/minute per IP
   - Applies to: `/api/ai/*` endpoints
   - Response headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
   - Over limit response: 429 Too Many Requests
   - Auto-cleanup of old entries

2. **API Key Validation (Optional)**
   - Enable with: `REQUIRE_API_KEY=true` + `API_KEY=...`
   - Check header: `X-API-Key`
   - Response on missing/invalid: 401 Unauthorized
   - Configurable per environment

**Integration:**
```typescript
// In server/index.ts
rateLimitMiddleware(fastify);  // Applied first
apiKeyMiddleware(fastify);     // Applied second
registerRoutes(fastify);       // Route handlers
```

**Benefits:**
- ✅ Prevents service abuse and DDoS attacks
- ✅ Protects OpenAI API quota
- ✅ Audit trail via response headers
- ✅ Production-ready security posture

### Graph Optimization (`lib/graphOptimization.ts`)

**Responsibility:** High-performance knowledge graph rendering for 1000+ notes

**Optimization Techniques:**

1. **Node Clustering** - Group nodes by category or density
2. **Level of Detail (LOD)** - Show fewer nodes when zoomed out
3. **Viewport Virtualization** - Render only visible nodes
4. **Layout Caching** - Reuse computed positions if graph unchanged
5. **Simplified Simulation** - Fewer iterations for faster convergence
6. **Performance Monitoring** - Track render and simulation times

**Performance Gains:**
- 100-500 nodes: 50-70% faster
- 500-1000 nodes: 60-80% faster
- 1000+ nodes: Now usable (with all optimizations)

See [GRAPH_OPTIMIZATION.md](./GRAPH_OPTIMIZATION.md) for implementation details.

### AI Service (`lib/aiService.ts`)

**Architecture:** Backend proxy pattern for security

**Workflow:**
```
Browser → /api/ai/generateTags (backend) → OpenAI
         ↓ (fallback if backend down)
         → Direct OpenAI call (client-side, deprecated)
```

**Endpoints:**
- `POST /api/ai/generateTags` - AI tag generation
- `POST /api/ai/generateSummary` - Semantic summarization
- `POST /api/ai/categorizeNote` - Auto categorization

**Security:**
- API key stored in `.env.local` (backend only)
- Frontend never exposes credentials
- Rate limiting recommended on backend

## Data Models

### NoteItem (Core)
```typescript
interface NoteItem {
  id: string;                          // note_${timestamp}
  title: string;                       // User-visible name
  content: string;                     // Markdown format
  category: '生活'|'工作'|'学习'|'灵感'|'其他';
  tags: string[];                      // Multi-dimensional tagging
  color: string;                       // Hex color (#dc96b4)
  isFavorite: boolean;                 // Star system
  isArchived: boolean;                 // Hidden from main view
  createdAt: number;                   // Timestamp (ms)
  updatedAt: number;                   // Last modified timestamp
  links?: string[];                    // Forward links (parsed from content)
  backlinks?: string[];                // Reverse references
  versions?: NoteVersion[];            // Version history (max 20)
  isDeleted?: boolean;                 // Soft delete
  deletedAt?: number;                  // Soft delete timestamp
}
```

### NoteVersion (History)
```typescript
interface NoteVersion {
  versionId: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  color: string;
  isFavorite: boolean;
  isArchived: boolean;
  updatedAt: number;
}
```

### WebDAVConfig (Remote Sync)
```typescript
interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  remotePath: string;
  encryptionKey?: string;                     // Optional AES-256
  autoSyncEnabled?: boolean;
  syncInterval?: number;                      // Default: 5 minutes
  conflictStrategy?: 'prefer-local' | 'prefer-remote' | 'manual';
}
```

## Request Flow

### Add Note
```
User types title + content
  ↓
NoteEditor component calls useNoteEditor().updateNote()
  ↓
Context updates editingNote
  ↓
User clicks Save
  ↓
useNoteEditor().saveNote() calls onSave handler
  ↓
Dashboard calls storage.addNoteAsync(note)
  ↓
NoteStorage.addNoteAsync():
  1. Create new NoteItem with timestamp ID
  2. Parse wiki-links [[...]]
  3. Update link graph (forward + backlinks)
  4. Save to IndexedDB/localStorage
  5. Call Indexer.invalidateIndex() ← Cache busted
  6. Attempt server sync (async, non-blocking)
  ↓
Return new NoteItem to UI
  ↓
NoteList re-renders with new note
```

### Search Notes
```
User types search query
  ↓
SearchComponent calls storage.searchNotesAsync(query)
  ↓
searchNotesAsync() delegates to Indexer.searchNotes()
  ↓
Indexer.searchNotes():
  1. Compute hash of current notes
  2. If hash matches cached hash → use cached index
  3. If different → rebuild index (Lunr + vectors)
     a. buildIndex() creates Lunr inverted index
     b. computeVector() for each note (TF-based)
     c. Cache in IndexedDB + memory
  4. Perform full-text search on Lunr index
  5. Perform semantic search via cosine similarity
  6. Merge results, dedupe, sort by similarity
  ↓
Return sorted note IDs
  ↓
Dashboard fetches full NoteItem objects
  ↓
NoteList re-renders results
```

### Sync to WebDAV
```
User enables WebDAV sync
  ↓
WebDAVSyncManager.start():
  1. Initialize with config (url, credentials)
  2. Schedule periodic sync (every 5 minutes)
  3. On interval trigger:
     a. Get all notes from storage
     b. Optionally encrypt via AES-256
     c. PUT to WebDAV server
     d. Emit success/failure callback
  ↓
If conflict detected:
  1. Fetch remote notes
  2. Compare updatedAt timestamps
  3. Apply strategy (prefer-local/remote/manual)
  4. Merge and update local storage
  ↓
UI shows sync status + any conflicts
```

## Error Handling Strategy

### Graceful Degradation
```
Try → Catch → Fallback → Silent Fail

Example: AI tag generation
  try openai.generateTags()
    ↓ catch
  try backend /api/ai/generateTags
    ↓ catch
  return [] (empty array, no tags)
  // User sees: "Could not generate tags", but app continues
```

### Service Failures
- **IndexedDB fails** → Fallback to localStorage
- **Backend sync fails** → Queue for retry, proceed locally
- **OpenAI fails** → Return empty results, app functional
- **WebDAV fails** → User sees error, can manual sync later

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Add note | O(n) | Link graph sync |
| Update note | O(n) | Link graph re-sync |
| Delete note | O(1) | Soft delete |
| Search (cached) | O(1) | Memory lookup |
| Search (dirty) | O(n × vocab_size) | Rebuild + search |
| Full-text match | O(k) | k = result count |
| Semantic match | O(n × vocab_size) | Vector similarity |
| IndexedDB load | O(n) | IDB transaction |

**Optimization Tips:**
- ✅ Search caching drastically reduces repeated searches
- ✅ Virtual scrolling for 1000+ notes
- ✅ Lazy load related notes on demand
- ✅ Batch updates before syncing

## Testing Strategy

**Test Coverage:**
```
Unit Tests (lib/):
  ✅ indexer.test.ts - Search + caching
  ✅ storage.test.ts - CRUD + conflict resolution  
  ✅ vector.test.ts - Cosine similarity
  ✅ utils.test.ts - Parsing + formatting

Component Tests (test/):
  ✅ NoteEditor.test.tsx - Editor interactions
  ⚠️ TODO: NoteList, Calendar, KnowledgeGraph

E2E Tests:
  ⚠️ TODO: Full user workflows (Cypress/Playwright)
```

## Deployment

**Frontend:**
- Deployed to Vercel/Render as Next.js app
- Environment: `NEXT_PUBLIC_BACKEND_URL` for API endpoint
- Build: `npm run build` → Static + SSG

**Backend:**
- Deployed to Render as Node.js/Fastify service
- Environment: `OPENAI_API_KEY`, `PORT`
- Startup: `npm start` or `npm run start-server`

**Database:**
- Client-side: IndexedDB (built-in browser storage)
- Server-side: Optional Redis for BullMQ job queue
- Remote: WebDAV server or OneDrive (user-provided)

## Security Considerations

| Risk | Mitigation |
|------|-----------|
| API key exposure | Backend proxy, never in browser |
| Data loss | Version history, trash recovery |
| Sync conflicts | Detection + resolution strategies |
| Encryption in transit | HTTPS only, OAuth 2.0 for OneDrive |
| Encryption at rest | Optional AES-256 for WebDAV |
| XSS in markdown | React markdown + sanitization |

## Future Enhancements

1. **Collaborative editing** - WebSocket real-time sync
2. **Plugin system** - Custom AI models, export formats
3. **Mobile app** - React Native version
4. **Full-text search index** - Server-side Elasticsearch
5. **Analytics** - Usage patterns, productivity insights
6. **PWA** - Offline-first Progressive Web App
7. **Team workspaces** - Multi-user shared notebooks
