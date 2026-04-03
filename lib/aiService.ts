import OpenAI from 'openai';

class AIService {
  private client: OpenAI | null = null;
  private backendUrl: string;
  private useBackend: boolean = true; // Always use backend by default

  constructor(apiKey?: string, backendUrl?: string) {
    this.backendUrl = backendUrl || (typeof window !== 'undefined' 
      ? `${window.location.origin}/api/ai` 
      : '/api/ai');
    
    // Keep client for fallback only (if backend is down)
    if (apiKey && !this.useBackend) {
      this.client = new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true
      });
    }
  }

  setApiKey(apiKey: string) {
    if (!this.useBackend && apiKey) {
      this.client = new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true
      });
    }
  }

  /**
   * Generate tags via backend proxy (secure method)
   * Falls back to client-side OpenAI if backend fails
   */
  async generateTags(content: string): Promise<string[]> {
    try {
      // Try backend first (secure)
      const response = await fetch(`${this.backendUrl}/generateTags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.tags || [];
    } catch (error) {
      console.warn('Backend generateTags failed, falling back to client-side:', error);
      
      // Fallback to client-side
      if (this.client) {
        return await this.generateTagsClientSide(content);
      }
      
      return [];
    }
  }

  /**
   * Generate summary via backend proxy (secure method)
   */
  async generateSummary(content: string): Promise<string> {
    try {
      // Try backend first (secure)
      const response = await fetch(`${this.backendUrl}/generateSummary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.summary || 'Unable to generate summary';
    } catch (error) {
      console.warn('Backend generateSummary failed, falling back to client-side:', error);

      // Fallback to client-side
      if (this.client) {
        return await this.generateSummaryClientSide(content);
      }

      return 'Summary generation failed';
    }
  }

  /**
   * Categorize note via backend proxy (secure method)
   */
  async categorizeNote(title: string, content: string): Promise<string> {
    try {
      // Try backend first (secure)
      const response = await fetch(`${this.backendUrl}/categorizeNote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.category || '其他';
    } catch (error) {
      console.warn('Backend categorizeNote failed, falling back to client-side:', error);

      // Fallback to client-side
      if (this.client) {
        return await this.categorizeNoteClientSide(title, content);
      }

      return '其他';
    }
  }

  /**
   * Suggest related notes via backend proxy (secure method)
   */
  async suggestRelatedNotes(currentNote: string, allNotes: Array<{ title: string; content: string }>): Promise<Array<{ title: string; similarity: number }>> {
    try {
      // Try backend first (secure)
      const response = await fetch(`${this.backendUrl}/suggestRelatedNotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentNote, allNotes })
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.suggestions || [];
    } catch (error) {
      console.warn('Backend suggestRelatedNotes failed, falling back to client-side:', error);

      // Fallback to client-side
      if (this.client) {
        return await this.suggestRelatedNotesClientSide(currentNote, allNotes);
      }

      return [];
    }
  }

  // Private fallback methods (client-side OpenAI calls - DEPRECATED)
  private async generateTagsClientSide(content: string): Promise<string[]> {
    if (!this.client) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that generates relevant tags for notes. Generate 3-5 concise, relevant tags for the given content. Return only the tags separated by commas, no other text.'
          },
          {
            role: 'user',
            content: `Generate tags for this note content:\n\n${content.substring(0, 1000)}`
          }
        ],
        max_tokens: 100,
        temperature: 0.3
      });

      const tagsText = response.choices[0]?.message?.content?.trim() || '';
      return tagsText.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    } catch (error) {
      console.error('Error generating tags (client-side fallback):', error);
      return [];
    }
  }

  private async generateSummaryClientSide(content: string): Promise<string> {
    if (!this.client) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates concise summaries of notes. Create a brief 1-2 sentence summary that captures the main points.'
          },
          {
            role: 'user',
            content: `Summarize this note content:\n\n${content.substring(0, 2000)}`
          }
        ],
        max_tokens: 150,
        temperature: 0.3
      });

      return response.choices[0]?.message?.content?.trim() || 'Unable to generate summary';
    } catch (error) {
      console.error('Error generating summary (client-side fallback):', error);
      return 'Summary generation failed';
    }
  }

  private async categorizeNoteClientSide(title: string, content: string): Promise<string> {
    if (!this.client) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that categorizes notes. Return one of: 生活, 工作, 学习, 灵感, 其他'
          },
          {
            role: 'user',
            content: `Categorize this note:\nTitle: ${title}\nContent: ${content.substring(0, 1000)}`
          }
        ],
        max_tokens: 20,
        temperature: 0.3
      });

      return response.choices[0]?.message?.content?.trim() || '其他';
    } catch (error) {
      console.error('Error categorizing note (client-side fallback):', error);
      return '其他';
    }
  }

  private async suggestRelatedNotesClientSide(currentNote: string, allNotes: Array<{ title: string; content: string }>): Promise<Array<{ title: string; similarity: number }>> {
    if (!this.client) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const notesText = allNotes.map(note =>
        `Title: ${note.title}\nContent: ${note.content.substring(0, 200)}\n---`
      ).join('\n');

      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that finds related notes. Analyze the current note and find the 3 most related notes from the list. Return the titles of related notes separated by newlines, ranked by relevance.'
          },
          {
            role: 'user',
            content: `Current note: ${currentNote.substring(0, 500)}\n\nAll notes:\n${notesText}`
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      });

      const suggestions = response.choices[0]?.message?.content?.split('\n')
        .filter(title => title.trim().length > 0)
        .slice(0, 3)
        .map(title => ({ title: title.trim(), similarity: 0.8 })) || [];

      return suggestions;
    } catch (error) {
      console.error('Error suggesting related notes (client-side fallback):', error);
      return [];
    }
  }
}

export default AIService;