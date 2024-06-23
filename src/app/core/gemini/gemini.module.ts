import {Module} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';

import {GeminiQueriesResolver} from './gemini.queries.resolver';
import {GeminiService} from './gemini.service';
import {GenerativeModelProvider} from './generative-model.provider';

@Module({
  imports: [ConfigModule],
  providers: [GeminiService, GeminiQueriesResolver, GenerativeModelProvider],
})
export class GeminiModule {}
