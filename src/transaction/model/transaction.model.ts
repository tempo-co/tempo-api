import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { IsDate, IsNumber, IsString, Length, Max, Min } from 'class-validator';

@ObjectType()
export class Transaction {
  @Field(() => ID)
  id: string;

  @Field()
  @IsDate()
  startedDate: Date;

  @Field()
  @IsDate()
  completedDate: Date;

  @Field()
  @IsString()
  @Length(1, 255)
  description: string;

  @Field(() => Float)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  amount: number;

  @Field()
  @IsString()
  @Length(3, 3)
  currency: string;
}
