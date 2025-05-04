import {Expose} from 'class-transformer';
import {Column, Entity, PrimaryGeneratedColumn} from 'typeorm';

import {MimeType} from '@modules/file/file-parser/constants/mime-type.enum';

@Entity('files')
export class File {
	@PrimaryGeneratedColumn('uuid')
	@Expose()
	id: string;

	@Column({type: 'bytea', select: false})
	@Expose()
	buffer: Buffer;

	@Column({type: 'varchar', length: 255})
	@Expose()
	name: string;

	@Column({type: 'bigint'})
	@Expose()
	size: number;

	@Column({type: 'varchar', length: 255})
	@Expose()
	type: MimeType;
}
