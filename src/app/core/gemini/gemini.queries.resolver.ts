import {Args, Query, Resolver} from '@nestjs/graphql';

import {Public} from '@core/auth/decorators/public.decorator';

import {GeminiService} from './gemini.service';

@Resolver()
export class GeminiQueriesResolver {
  constructor(private readonly geminiService: GeminiService) {}

  @Public()
  @Query(() => String)
  async generateText(@Args('prompt') prompt: string): Promise<string> {
    try {
      const generatedText = await this.geminiService.generateText(prompt);
      return generatedText;
    } catch (error) {
      console.error('Error generating text:', error);
      throw error;
    }
  }
}
