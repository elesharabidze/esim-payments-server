import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from '../../orders/entities/order.entity';

@Entity('esims')
export class Esim {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => Order, (order) => order.esim)
  @JoinColumn()
  order!: Order;

  @Column()
  orderId!: string;

  @Column()
  iccid!: string;

  /** LPA activation string, e.g. LPA:1$smdp.example.com$MATCHING-ID - what the QR code encodes. */
  @Column()
  activationCode!: string;

  /** data: URL containing a PNG QR code that encodes the activation code, ready to render in an <img>. */
  @Column({ type: 'text' })
  qrCodeDataUrl!: string;

  @CreateDateColumn()
  issuedAt!: Date;
}
