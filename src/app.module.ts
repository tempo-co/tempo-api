import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FileParserModule } from './file-parsers/file-parser.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'flair',
      entities: [],
      synchronize: true,
    }),
    FileParserModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
