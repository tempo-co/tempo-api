import {Exclude, Expose} from 'class-transformer';
import {Column, Entity, OneToOne, PrimaryGeneratedColumn} from 'typeorm';

import {BankStatement} from '@modules/bank-statement/bank-statement.entity';
import {MimeType} from '@modules/file/file-parser/constants/mime-type.enum';

@Entity('files')
export class File {
	@PrimaryGeneratedColumn('uuid')
	@Expose()
	id: string;

	@Column({type: 'varchar', length: 255})
	@Expose()
	name: string;

	@Column({type: 'bigint'})
	@Expose()
	size: number;

	@Column({type: 'varchar', length: 255})
	@Expose()
	mimeType: MimeType;

	@Column({type: 'varchar', length: 512})
	@Exclude()
	key: string;

	@OneToOne(() => BankStatement, (bankStatement) => bankStatement.file)
	bankStatement: BankStatement;
}
