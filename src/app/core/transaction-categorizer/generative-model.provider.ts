import {
  FunctionDeclarationSchemaType,
  GenerationConfig,
  GenerativeModel,
  GoogleGenerativeAI,
} from '@google/generative-ai';
import {Provider} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';

import {Category} from './constants/category.enum';

export const GenerativeModelProvider: Provider = {
  provide: GenerativeModel,
  useFactory: async (configService: ConfigService): Promise<GenerativeModel> => {
    const apiKey = configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not found in environment variables.');
    }
    const genAI = new GoogleGenerativeAI(apiKey);

    return genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction,
      generationConfig,
    });
  },
  inject: [ConfigService],
};

const systemInstruction =
  `For each transaction in the provided array, add a 'category' field without ` +
  `altering any other data. Use only the following categories: ${Object.values(Category)}. ` +
  `Return the modified array with the added 'category' field for each transaction.`;

const generationConfig: GenerationConfig = {
  responseMimeType: 'application/json',
  responseSchema: {
    type: FunctionDeclarationSchemaType.ARRAY,
    description: 'Array of transactions with their categories',
    items: {
      type: FunctionDeclarationSchemaType.OBJECT,
      required: ['startedAt', 'completedAt', 'description', 'amount', 'currency', 'category'],
      properties: {
        startedAt: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Transaction start date',
        },
        completedAt: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Transaction completion date',
        },
        description: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Transaction description',
        },
        amount: {
          type: FunctionDeclarationSchemaType.NUMBER,
          description: 'Transaction amount',
        },
        currency: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Transaction currency',
          example: 'EUR',
        },
        category: {
          type: FunctionDeclarationSchemaType.STRING,
          description: 'Transaction category',
          format: 'enum',
          enum: Object.values(Category),
        },
      },
    },
  },
};
