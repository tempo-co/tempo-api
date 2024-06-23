import {GenerativeModel, GoogleGenerativeAI} from '@google/generative-ai';
import {Provider} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';

export const GenerativeModelProvider: Provider = {
  provide: GenerativeModel,
  useFactory: async (configService: ConfigService): Promise<GenerativeModel> => {
    const apiKey = configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not found in environment variables.');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({model: 'gemini-1.5-flash'});
  },
  inject: [ConfigService],
};
