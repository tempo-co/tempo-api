import { ArgsType, Field } from '@nestjs/graphql';
import { FileUpload, GraphQLUpload } from 'graphql-upload';

@ArgsType()
export class UploadStatementArgs {
  @Field(() => GraphQLUpload)
  file: FileUpload;

  @Field()
  accountId: string;
}
