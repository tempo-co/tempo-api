import {ValidationPipe} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {NestFactory} from '@nestjs/core';
import {altairExpress} from 'altair-express-middleware';
import {graphqlUploadExpress} from 'graphql-upload';
import helmet from 'helmet';

import {AppModule} from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      // Config to solve issues with CSP when using Apollo Sandbox
      contentSecurityPolicy: {
        directives: {
          imgSrc: [`'self'`, 'data:', 'apollo-server-landing-page.cdn.apollographql.com'],
          scriptSrc: [`'self'`, `https: 'unsafe-inline'`],
          manifestSrc: [`'self'`, 'apollo-server-landing-page.cdn.apollographql.com'],
          frameSrc: [`'self'`, 'sandbox.embed.apollographql.com'],
        },
      },
    }),
  );

  app.useGlobalPipes(new ValidationPipe());
  app.use(graphqlUploadExpress({maxFileSize: 100000000, maxFiles: 2}));

  // Uses Altair client to test file upload since Apollo Sandbox
  // sends all files as application/octet-stream MIME type
  app.use('/altair', altairExpress({endpointURL: '/graphql'}));

  const port = app.get(ConfigService).get('PORT');
  await app.listen(port);
}
bootstrap();
