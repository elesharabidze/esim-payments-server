import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Plan } from '../../catalog/entities/plan.entity';
import { Esim } from '../../esim/entities/esim.entity';
import { OrderStatus } from '../order-status.enum';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Plan, { eager: true })
  @JoinColumn()
  plan!: Plan;

  @Column()
  planId!: string;

  /** Indexed: the guest order lookup (`GET /api/orders?email=`) has no other way in. */
  @Index()
  @Column()
  customerEmail!: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status!: OrderStatus;

  @Column({ type: 'int' })
  amountMinorUnits!: number;

  @Column({ length: 3 })
  currency!: string;

  /**
   * The provider's checkout token. Indexed because both the webhook and the customer's
   * return page reach the order through this column rather than through the primary key.
   */
  @Index()
  @Column({ nullable: true })
  paymentToken?: string;

  @Column({ nullable: true })
  paymentUid?: string;

  @Column({ nullable: true, type: 'text' })
  paymentRedirectUrl?: string;

  @OneToOne(() => Esim, (esim) => esim.order, { eager: true, nullable: true })
  esim?: Esim;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
