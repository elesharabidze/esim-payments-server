import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Plan)
    private readonly plans: Repository<Plan>,
  ) {}

  findAll(filters: { region?: string; countryCode?: string }): Promise<Plan[]> {
    const query = this.plans.createQueryBuilder('plan').orderBy('plan.priceMinorUnits', 'ASC');

    if (filters.region) {
      query.andWhere('plan.region = :region', { region: filters.region });
    }
    if (filters.countryCode) {
      query.andWhere('plan.countryCode = :countryCode', {
        countryCode: filters.countryCode.toUpperCase(),
      });
    }
    return query.getMany();
  }

  async findOne(id: string): Promise<Plan> {
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Plan ${id} not found`);
    }
    return plan;
  }

  async listRegions(): Promise<string[]> {
    const rows = await this.plans
      .createQueryBuilder('plan')
      .select('DISTINCT plan.region', 'region')
      .orderBy('plan.region', 'ASC')
      .getRawMany<{ region: string }>();
    return rows.map((r) => r.region);
  }
}
