import {Controller, Get} from '@nestjs/common';
import {ApiOperation, ApiTags} from '@nestjs/swagger';
import {HealthCheck, HealthCheckService, TypeOrmHealthIndicator} from '@nestjs/terminus';

@ApiTags('Health check')
@Controller('health')
export class HealthController {
	constructor(
		private health: HealthCheckService,
		private db: TypeOrmHealthIndicator,
	) {}

	@Get()
	@HealthCheck()
	@ApiOperation({summary: 'Health check.'})
	check() {
		return this.health.check([async () => ({api: {status: 'up'}}), () => this.db.pingCheck('database')]);
	}
}
