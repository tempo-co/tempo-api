import {GenerationConfig, GenerativeModel, GoogleGenerativeAI, SchemaType} from '@google/generative-ai';
import {Provider} from '@nestjs/common';

import {ConfigurationService} from '@core/config/config.service';

import {Category} from '../constants/category.enum';

export const GenerativeModelProvider: Provider = {
	provide: GenerativeModel,
	inject: [ConfigurationService],
	useFactory: async (configService: ConfigurationService) => {
		const apiKey = configService.get('GEMINI_API_KEY');

		return new GoogleGenerativeAI(apiKey).getGenerativeModel({
			model: 'gemini-1.5-flash',
			systemInstruction,
			generationConfig,
		});
	},
};

const systemInstruction =
	`For each transaction in the provided array, categorize it based on its description, amount and currency. ` +
	`Return a JSON array of objects, where each object contains the "correlationId" of the transaction and its corresponding "category". ` +
	`Use only the following categories: ${Object.values(Category)}. ` +
	`If present, use merchant names hidden within the description to determine the category. ` +
	`Descriptions may be in different languages; consider translations and common patterns. ` +
	`If a category cannot be determined, provide your best guess, and avoid returning 'OTHER' unless absolutely necessary.`;

const generationConfig: GenerationConfig = {
	responseMimeType: 'application/json',
	responseSchema: {
		type: SchemaType.ARRAY,
		description: 'Array of categorized transactions',
		items: {
			type: SchemaType.OBJECT,
			properties: {
				correlationId: {
					type: SchemaType.STRING,
					description: 'The unique identifier for the transaction.',
				},
				category: {
					type: SchemaType.STRING,
					enum: Object.values(Category),
					description: 'The category of the transaction.',
					format: 'enum',
				},
			},
			required: ['correlationId', 'category'],
		},
	},
};
