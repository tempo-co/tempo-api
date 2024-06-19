import {IsDate, IsNotEmpty, IsNumber, IsString, Length, Max, Min} from 'class-validator';
import {InputType} from '@nestjs/graphql';

@InputType()
export class InputTransactionCreate {
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
  @IsNumber({maxDecimalPlaces: 2})
  @Min(0)
  //tf?
  @Max(999999999999.99)
  amount: number;

  @IsNotEmpty()
  @IsString()
  @Length(3, 3)
  currency: string;
}
