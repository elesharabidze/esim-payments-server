import { AppDataSource } from './data-source';
import { Plan } from '../catalog/entities/plan.entity';
import { PLAN_SEED_DATA } from './plan-seed-data';

async function seed() {
  const dataSource = await AppDataSource.initialize();
  const repo = dataSource.getRepository(Plan);

  const existing = await repo.count();
  if (existing > 0) {
    // eslint-disable-next-line no-console
    console.log(`Plans table already has ${existing} rows, skipping seed.`);
  } else {
    await repo.save(repo.create(PLAN_SEED_DATA));
    // eslint-disable-next-line no-console
    console.log(`Seeded ${PLAN_SEED_DATA.length} plans.`);
  }

  await dataSource.destroy();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
