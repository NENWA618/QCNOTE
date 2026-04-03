import OpenAI from 'openai';

class AIService {
  private client: OpenAI | null = null;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (key) {
      this.client = new OpenAI({
        apiKey: key
      });
    }
  }

  setApiKey(apiKey: string) {
    this.client = new OpenAI({
      apiKey
    });
  }

  async generateTags(content: string): Promise<string[]> {
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
      console.error('Error generating tags:', error);
      throw error;
    }
  }

  async generateSummary(content: string): Promise<string> {
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
      console.error('Error generating summary:', error);
      throw error;
    }
  }

  async categorizeNote(content: string): Promise<string> {
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
            content: `Categorize this note:\n\n${content.substring(0, 1000)}`
          }
        ],
        max_tokens: 20,
        temperature: 0.3
      });

      return response.choices[0]?.message?.content?.trim() || '其他';
    } catch (error) {
      console.error('Error categorizing note:', error);
      throw error;
    }
  }
}

export default AIService;
