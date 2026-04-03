# ADR 003: Backend Proxy for AI Services

**Date:** 2026-04-03  
**Status:** ACCEPTED  
**Context:** Application needs to use OpenAI API for AI-powered features (tag generation, summarization). Direct browser access to OpenAI keys is a security risk.

## Problem Statement

**Initial approach:** Store OpenAI API key in browser local storage, call OpenAI directly from frontend
```typescript
// ❌ UNSAFE - Key exposed in browser
this.client = new OpenAI({ 
  apiKey: userKey,
  dangerouslyAllowBrowser: true 
});
```

**Risks:**
- API keys visible in network requests
- Keys stored in browser storage (XSS vulnerability)
- No rate limiting, abuse is easy
- API usage not auditable

## Decision

**Route all AI requests through backend proxy**

Frontend makes request to `POST /api/ai/generateTags`  
↓  
Backend validates request  
↓  
Backend calls OpenAI with secret API key  
↓  
Backend returns safe result to frontend

## Rationale

### Security Comparison

| Aspect | Direct from Browser | Backend Proxy |
|--------|--------------------|--------------------|
| **Key exposure** | ❌ Visible in network | ✅ Server-side only |
| **Rate limiting** | ❌ None | ✅ Per-user on backend |
| **Audit trail** | ❌ No logs | ✅ Full request logs |
| **Cost control** | ❌ Uncontrolled | ✅ Backend can limit |
| **Error messages** | ❌ Exposes details | ✅ Safe responses |
| **Latency** | ✅ Direct (fast) | ⚠️ Extra hop (slower) |
| **Offline support** | ✅ Works offline | ❌ Requires backend |

### Implementation Pattern

```
┌─────────────┐
│   Browser   │
│  Frontend   │
└──────┬──────┘
       │
       │ POST /api/ai/generateTags
       │ { content: "..." }
       │
       ↓
┌──────────────────────┐
│  Node.js Backend     │
│  (Fastify)           │
│                      │
│  1. Validate request │
│  2. Check auth       │
│  3. Rate limit       │
│  4. Call OpenAI      │
│  5. Log request      │
│  6. Return result    │
└──────┬───────────────┘
       │
       │ OpenAI API
       │
       ↓
   [OpenAI Servers]
```

## Implementation

### Backend (server/index.ts)

```typescript
import AIService from './aiService';

const aiService = new AIService(process.env.OPENAI_API_KEY);

app.post('/api/ai/generateTags', async (request, reply) => {
  try {
    const { content } = request.body;
    
    if (!content) {
      return reply.status(400).send({ error: 'content required' });
    }
    
    // Respect rate limits
    if (!await checkRateLimit(request.ip)) {
      return reply.status(429).send({ error: 'Too many requests' });
    }
    
    // Generate tags
    const tags = await aiService.generateTags(content);
    
    // Log for audit
    logger.info('Generated tags', { 
      contentLength: content.length,
      tagCount: tags.length,
      timestamp: new Date().toISOString()
    });
    
    return { success: true, tags };
  } catch (error) {
    logger.error('Tag generation failed', error);
    return reply.status(500).send({ error: 'Generation failed' });
  }
});
```

### Frontend (lib/aiService.ts)

```typescript
class AIService {
  private backendUrl = '/api/ai';

  async generateTags(content: string): Promise<string[]> {
    try {
      // Call backend proxy (SECURE)
      const response = await fetch(`${this.backendUrl}/generateTags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      if (!response.ok) throw new Error('Backend error');
      
      const data = await response.json();
      return data.tags || [];
    } catch (error) {
      // Graceful fallback if backend is down
      logger.warn('Backend failed, using client-side fallback', error);
      return await this.fallbackGenerateTags(content);
    }
  }

  // Fallback: Client-side call (only if backend is unavailable)
  private async fallbackGenerateTags(content: string): Promise<string[]> {
    if (!this.client) return [];
    try {
      const response = await this.client.chat.completions.create({ ... });
      return parseTagsFromResponse(response);
    } catch {
      return [];
    }
  }
}
```

## Environment Configuration

### Backend (.env.local)
```bash
OPENAI_API_KEY=sk-...          # Never exposed
BACKEND_PORT=3001
NODE_ENV=production
RATE_LIMIT_REQUESTS=100        # Per hour per user
RATE_LIMIT_WINDOW=3600000      # 1 hour
```

### Frontend (pages/_app.tsx)
```typescript
// No OpenAI key needed!
const aiService = new AIService(); // Uses backend proxy
```

## Deployment Checklist

- [ ] Generate OpenAI API key
- [ ] Add to backend `.env.local` (never commit!)
- [ ] Configure rate limiting on backend
- [ ] Add request logging for audit
- [ ] Test fallback mechanism
- [ ] Monitor API costs/usage
- [ ] Document rate limits for users
- [ ] Add per-user quota limits if needed

## Consequences

### Positive
✅ **Secure** - API keys never leave backend  
✅ **Auditable** - All requests logged  
✅ **Cost-controllable** - Rate limiting prevents abuse  
✅ **User-isolated** - Per-user quotas possible  
✅ **Evolve safely** - Can change OpenAI without frontend changes  

### Negative
⚠️ **Requires backend** - Can't use offline  
⚠️ **Slight latency** - Extra network hop (~100-200ms)  
⚠️ **Backend dependency** - Backend downtime = no AI  
⚠️ **Infrastructure cost** - Need to host backend  

### Mitigations
- Implement graceful fallback to client-side (if NECESSARY)
- Cache AI results in browser (tag generation is idempotent)
- Set reasonable rate limits
- Monitor backend health

## Testing

```typescript
describe('AI Backend Proxy', () => {
  it('should call backend endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tags: ['ai', 'generated'] })
    });
    global.fetch = mockFetch;

    const service = new AIService();
    const tags = await service.generateTags('content');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/ai/generateTags',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('content')
      })
    );
    expect(tags).toEqual(['ai', 'generated']);
  });

  it('should fallback if backend fails', async () => {
    const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
    global.fetch = mockFetch;

    const service = new AIService('sk-test-key');
    const tags = await service.generateTags('content');

    // Should attempt client-side call
    expect(tags).toBeDefined();
  });
});
```

## Related ADRs

- ADR-001: Offline-First Architecture
- ADR-004: Error Handling & Graceful Degradation

## Future Enhancements

1. **Caching** - Cache tag/summary results to reduce API calls
2. **Batching** - Batch requests to OpenAI for efficiency
3. **Custom models** - Allow users to bring their own API keys
4. **Rate limiting** - Implement per-user and global limits
5. **Cost tracking** - Show users their AI usage and costs
6. **Alternative AI** - Support Claude, Gemini, local models
7. **Webhook notifications** - Async task completion notifications
