import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import configuration from '../../config/configuration';
import { Order } from '../../orders/entities/order.entity';
import { PaymentProviderModule } from './payment-provider.module';
import { MockProvider } from './mock.provider';

it('resolves MockProvider (and its Order repository) from the real module graph', async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ load: [configuration] }), PaymentProviderModule],
  })
    .overrideProvider(getRepositoryToken(Order))
    .useValue({ findOne: jest.fn() })
    .compile();

  expect(moduleRef.get(MockProvider)).toBeInstanceOf(MockProvider);
});
