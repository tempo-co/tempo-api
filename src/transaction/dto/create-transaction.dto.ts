import { IsDate, IsNumber, IsString, Length, Max, Min } from 'class-validator';

export class CreateTransactionDto {
  @IsDate()
  startedDate: Date;

  @IsDate()
  completedDate: Date;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  startBalance: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  endBalance: number;

  @IsString()
  @Length(1, 255)
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  amount: number;

  @IsString()
  @Length(3, 3)
  currency: string;
}
