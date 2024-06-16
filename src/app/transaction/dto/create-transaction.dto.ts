import { ArgsType } from '@nestjs/graphql';
import {
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsString,
  Length,
  Max,
  Min,
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
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  amount: number;

  @IsNotEmpty()
  @IsString()
  @Length(3, 3)
  currency: string;
}
