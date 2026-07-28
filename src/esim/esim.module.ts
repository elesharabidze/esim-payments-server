import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Esim } from './entities/esim.entity';
import { EsimService } from './esim.service';

@Module({
  imports: [TypeOrmModule.forFeature([Esim])],
  providers: [EsimService],
  exports: [EsimService],
})
export class EsimModule {}
