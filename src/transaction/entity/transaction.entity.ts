import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  startedDate: Date;

  @Column({ type: 'date' })
  completedDate: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  startBalance: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  endBalance: number;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;
}
