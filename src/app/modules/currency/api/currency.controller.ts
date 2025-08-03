import {Controller, Get} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from '@nestjs/swagger';

import {CURRENCIES} from '../currencies';

@ApiTags('Currencies')
@Controller('currencies')
export class CurrencyController {
	@Get()
	@ApiResponse({status: 200, description: 'An array of supported currencies.'})
	@ApiOperation({summary: 'Get the list of all supported currencies'})
	getCurrencies() {
		return CURRENCIES;
	}
}
