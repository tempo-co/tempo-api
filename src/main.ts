import {ValidationPipe} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {NestFactory} from '@nestjs/core';
import {NestExpressApplication} from '@nestjs/platform-express';
import {DocumentBuilder, SwaggerDocumentOptions, SwaggerModule} from '@nestjs/swagger';
import helmet from 'helmet';
import {setupGracefulShutdown} from 'nestjs-graceful-shutdown';

import {AppModule} from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  setupGracefulShutdown({app});

  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
  });
  app.use(helmet());
  app.disable('x-powered-by');
  app.useGlobalPipes(new ValidationPipe());

  const config = new DocumentBuilder().setTitle('Flair API').build();
  const options: SwaggerDocumentOptions = {
    operationIdFactory: (_controllerKey: string, methodKey: string) => methodKey,
  };
  const document = SwaggerModule.createDocument(app, config, options);

  SwaggerModule.setup('api', app, document);

  const port = app.get(ConfigService).get('PORT');
  await app.listen(port);
}
bootstrap();
