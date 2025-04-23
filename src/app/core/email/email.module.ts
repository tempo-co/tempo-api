import {MailerModule} from '@nestjs-modules/mailer';
import {HandlebarsAdapter} from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import {Module} from '@nestjs/common';
import {join} from 'path';

import {ConfigurationService} from '@core/config/config.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      inject: [ConfigurationService],
      useFactory: (config: ConfigurationService) => ({
        transport: {
          host: config.get('EMAIL_HOST'),
          port: config.get('EMAIL_PORT'),
          secure: config.get('NODE_ENV') === 'production',
        },
        defaults: {from: '"Flair" <no-reply@flair.com>'},
        preview: config.get('NODE_ENV') === 'development',
        template: {
          dir: join(__dirname, 'templates'),
          adapter: new HandlebarsAdapter(),
          options: {strict: true},
        },
      }),
    }),
  ],
})
export class EmailModule {}
