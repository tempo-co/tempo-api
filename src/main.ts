import {ValidationPipe} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {NestExpressApplication} from '@nestjs/platform-express';
import {DocumentBuilder, SwaggerDocumentOptions, SwaggerModule} from '@nestjs/swagger';
import helmet from 'helmet';

import {ConfigurationService} from '@core/config/config.service';

import {AppModule} from './app.module';

async function bootstrap() {
	const app = await NestFactory.create<NestExpressApplication>(AppModule, {forceCloseConnections: true});
	const config = app.get(ConfigurationService);

	app.enableShutdownHooks();
	app.enableCors({origin: config.get('WEB_BASE_URL'), credentials: true});
	app.use(helmet());
	app.disable('x-powered-by');
	app.useGlobalPipes(new ValidationPipe({whitelist: true, transform: true}));

	if (config.get('NODE_ENV') == 'development') {
		setupSwagger(app);
	}
	await app.listen(config.get('PORT'));
}
bootstrap();

function setupSwagger(app: NestExpressApplication) {
	const config = new DocumentBuilder().setTitle('Flair API').build();
	const options: SwaggerDocumentOptions = {
		operationIdFactory: (_controllerKey: string, methodKey: string) => methodKey,
	};
	const document = SwaggerModule.createDocument(app, config, options);

	SwaggerModule.setup('docs', app, document);
}
