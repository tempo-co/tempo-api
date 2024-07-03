import {ValidationPipe} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {NestFactory} from '@nestjs/core';
import {NestExpressApplication} from '@nestjs/platform-express';
import {DocumentBuilder, SwaggerDocumentOptions, SwaggerModule} from '@nestjs/swagger';
import session from 'express-session';
import helmet from 'helmet';
import ms from 'ms';
import passport from 'passport';

import {AppModule} from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();

  app.use(helmet());
  app.disable('x-powered-by');
  app.useGlobalPipes(new ValidationPipe());

  const config = app.get(ConfigService);
  const secret = config.get('SESSION_SECRET');
  const expiration = config.get('SESSION_EXPIRATION');
  const expirationMs = ms(expiration as string);
  app.use(
    session({
      name: 'session',
      secret: secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false,
        httpOnly: true,
        sameSite: 'strict',
        domain: 'localhost',
        maxAge: expirationMs,
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  const swaggerConfig = new DocumentBuilder().setTitle('Flair API').build();
  const swaggerOptions: SwaggerDocumentOptions = {
    operationIdFactory: (_controllerKey: string, methodKey: string) => methodKey,
  };
  const document = SwaggerModule.createDocument(app, swaggerConfig, swaggerOptions);

  SwaggerModule.setup('api', app, document);

  const port = config.get('PORT');
  await app.listen(port);
}
bootstrap();
