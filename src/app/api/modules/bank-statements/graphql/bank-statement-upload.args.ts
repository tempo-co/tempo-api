import {ArgsType, Field} from '@nestjs/graphql';
import {IsNotEmpty, IsUUID} from 'class-validator';
import {FileUpload, GraphQLUpload} from 'graphql-upload';

import {TypeAccount} from '@modules/accounts/graphql/account.type';

@ArgsType()
export class ArgsBankStatementUpload {
  @Field(() => GraphQLUpload)
  @IsNotEmpty()
  file: Promise<FileUpload>;

  @Field(() => String)
  @IsNotEmpty()
  @IsUUID('4')
  accountId: TypeAccount['id'];
}
