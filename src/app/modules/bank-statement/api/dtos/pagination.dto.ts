import {Transform} from 'class-transformer';
import {IsInt, IsOptional, Min} from 'class-validator';

export class PaginationDto {
	@IsOptional()
	@Transform(({value}) => (value ? parseInt(value, 10) : undefined))
	@IsInt()
	@Min(0)
	pageIndex: number = 0;

	@IsOptional()
	@Transform(({value}) => (value ? parseInt(value, 10) : undefined))
	@IsInt()
	@Min(1)
	pageSize: number = 10;
}
