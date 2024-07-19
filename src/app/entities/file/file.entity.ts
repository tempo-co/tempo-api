import {Column, CreateDateColumn, Entity, PrimaryGeneratedColumn} from 'typeorm';

@Entity()
export class File {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({type: 'bytea'})
  buffer: Buffer;

  @Column({type: 'varchar', length: 255})
  name: string;

  @Column({type: 'bigint'})
  size: number;

  @Column({type: 'varchar', length: 255})
  mimeType: string;

  @CreateDateColumn({type: 'timestamp'})
  uploadedAt: Date;
}
