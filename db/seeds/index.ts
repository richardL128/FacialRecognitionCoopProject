/**
 * Seed data: 2 tenants, 1 user per role
 *
 * Run: npm run db:seed
 *
 * Note: This uses Prisma Client directly (not the extended client with soft
 * delete middleware) to avoid any interference with seeding.
 * Requires DATABASE_URL to be set.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // ── Tenants ───────────────────────────────────────────────
  const tenant1 = await prisma.tenant.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corp',
      slug: 'acme-corp',
    },
  });

  const tenant2 = await prisma.tenant.upsert({
    where: { slug: 'globex-inc' },
    update: {},
    create: {
      name: 'Globex Inc',
      slug: 'globex-inc',
    },
  });

  console.log(`✓ Tenants: ${tenant1.name}, ${tenant2.name}`);

  // ── Users ─────────────────────────────────────────────────
  const users = [
    { externalId: 'ext_platform_admin_001', email: 'platform@example.com', role: 'PLATFORM_ADMIN' as const, tenantId: tenant1.id },
    { externalId: 'ext_admin_001', email: 'admin@acme.com', role: 'ADMIN' as const, tenantId: tenant1.id },
    { externalId: 'ext_manager_001', email: 'manager@acme.com', role: 'MANAGER' as const, tenantId: tenant1.id },
    { externalId: 'ext_user_001', email: 'user@acme.com', role: 'USER' as const, tenantId: tenant1.id },
    { externalId: 'ext_viewer_001', email: 'viewer@acme.com', role: 'VIEWER' as const, tenantId: tenant1.id },
    { externalId: 'ext_admin_002', email: 'admin@globex.com', role: 'ADMIN' as const, tenantId: tenant2.id },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { externalId: user.externalId },
      update: {},
      create: {
        externalId: user.externalId,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        firstName: user.email.split('@')[0],
      },
    });
  }

  console.log(`✓ Users: ${users.length} users seeded`);
  console.log('\nSeed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
