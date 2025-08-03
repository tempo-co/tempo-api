import {Module} from '@nestjs/common';

import {CurrencyController} from './api/currency.controller';

@Module({controllers: [CurrencyController]})
export class CurrencyModule {}
