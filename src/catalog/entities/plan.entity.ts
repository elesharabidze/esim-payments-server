import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  countryCode!: string;

  @Column()
  countryName!: string;

  @Column()
  region!: string;

  @Column({ type: 'int' })
  dataAmountGb!: number;

  @Column({ default: false })
  unlimitedData!: boolean;

  @Column({ type: 'int' })
  validityDays!: number;

  @Column({ type: 'int' })
  priceMinorUnits!: number;

  @Column({ length: 3 })
  currency!: string;

  @Column({ default: false })
  isPopular!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
