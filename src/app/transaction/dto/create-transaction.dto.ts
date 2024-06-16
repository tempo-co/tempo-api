import { ArgsType } from '@nestjs/graphql';
import {
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsString,
  Length,
} from 'class-validator';

@ArgsType()
export class CreateTransactionDto {
  @IsNotEmpty()
  @IsDate()
  startedDate: Date;

  @IsNotEmpty()
  @IsDate()
  completedDate: Date;

  @IsNotEmpty()
  @IsString()
  @Length(1, 255)
  description: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsString()
  @Length(3, 3)
  currency: string;
}
