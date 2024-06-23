import {GenerativeModel} from '@google/generative-ai';
import {Injectable} from '@nestjs/common';

@Injectable()
export class GeminiService {
  constructor(private readonly model: GenerativeModel) {}

  async generateText(prompt: string): Promise<string> {
    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();
      return text;
    } catch (error) {
      console.error('Error generating text:', error);
      throw error;
    }
  }
}
