import {Controller, Get} from '@nestjs/common';
import {ApiOperation, ApiTags} from '@nestjs/swagger';
import {HealthCheck, HealthCheckService, TypeOrmHealthIndicator} from '@nestjs/terminus';
import {Throttle, seconds} from '@nestjs/throttler';

import {Public} from '@modules/auth/decorators/public.decorator';

@ApiTags('Health check')
@Controller('health')
export class HealthController {
	constructor(
		private health: HealthCheckService,
		private db: TypeOrmHealthIndicator,
	) {}

	@Get()
	@Public()
	@HealthCheck()
	@Throttle({default: {limit: 2, ttl: seconds(30)}})
	@ApiOperation({summary: 'Health check.'})
	async check() {
		return await this.health.check([async () => ({api: {status: 'up'}}), () => this.db.pingCheck('database')]);
	}
}
