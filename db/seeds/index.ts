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

  // ── Employee profiles ─────────────────────────────────────
  // Gives the Employee Database page (/feature-a) something to render on a
  // fresh instance. No pin_code — PINs are hashed, so they are set through
  // the UI rather than seeded. Photos are enrolled via /feature-a/photos.
  const employeeProfiles = [
    { firstName: 'Ada', name: 'Ada Lovelace', email: 'ada@acme.com', tenantId: tenant1.id },
    { firstName: 'Grace', name: 'Grace Hopper', email: 'grace@acme.com', tenantId: tenant1.id },
    { firstName: 'Alan', name: 'Alan Turing', email: 'alan@acme.com', tenantId: tenant1.id },
    { firstName: 'Katherine', name: 'Katherine Johnson', email: 'katherine@globex.com', tenantId: tenant2.id },
  ];

  let createdProfiles = 0;
  for (const profile of employeeProfiles) {
    // EmployeeProfile has no unique key to upsert on, so guard on tenant + name.
    const existing = await prisma.employeeProfile.findFirst({
      where: { tenantId: profile.tenantId, name: profile.name },
      select: { id: true },
    });

    if (!existing) {
      await prisma.employeeProfile.create({ data: profile });
      createdProfiles += 1;
    }
  }

  console.log(
    `✓ Employee profiles: ${createdProfiles} created, ${employeeProfiles.length - createdProfiles} already present`,
  );
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
