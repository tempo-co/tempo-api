import {Account} from '../account/account.entity';
import {Entity, Column, PrimaryGeneratedColumn, OneToMany} from 'typeorm';

//TODO: Use class validator
@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({type: 'varchar', length: 255})
  name: string;

  @Column({type: 'varchar', length: 255, unique: true})
  email: string;

  @Column({type: 'varchar', length: 255})
  password: string;

  @Column({type: 'boolean', default: true})
  isActive: boolean;

  @Column({type: 'date', default: () => 'CURRENT_DATE'})
  createdDate: Date;

  @OneToMany(() => Account, (account) => account.user)
  // Why is this an array?
  accounts?: Account[];
}
