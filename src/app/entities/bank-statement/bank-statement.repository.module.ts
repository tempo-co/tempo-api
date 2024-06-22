import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';

import {BankStatement} from './bank-statement.entity';
import {BankStatementRepository} from './bank-statement.repository';

@Module({
  imports: [TypeOrmModule.forFeature([BankStatement])],
  providers: [BankStatementRepository],
  exports: [BankStatementRepository],
})
export class BankStatementRepositoryModule {}
