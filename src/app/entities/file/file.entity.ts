import {Expose} from 'class-transformer';
import {Column, CreateDateColumn, Entity, PrimaryGeneratedColumn} from 'typeorm';

@Entity()
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
  mimeType: string;

  @CreateDateColumn({type: 'timestamp'})
  @Expose()
  uploadedAt: Date;
}
