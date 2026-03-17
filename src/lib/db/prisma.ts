import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@/generated/prisma/client';

// Models that have a deletedAt column — extend as you add soft-delete models
const SOFT_DELETE_MODELS = ['Tenant', 'User'] as const;
type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

function isSoftDeleteModel(model: string): model is SoftDeleteModel {
  return (SOFT_DELETE_MODELS as readonly string[]).includes(model);
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const base = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

  return base.$extends({
    query: {
      $allModels: {
        // Auto-filter soft-deleted records on reads
        async findMany({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },
        async findUnique({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = { ...args.where, deletedAt: null } as typeof args.where;
          }
          return query(args);
        },
        async count({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },
        // Convert delete → soft-delete
        async delete({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            const ctx = Prisma.getExtensionContext(this) as Record<
              string,
              { update: Function } | undefined
            >;
            const key = model.charAt(0).toLowerCase() + model.slice(1);
            return ctx[key]!.update({
              where: args.where,
              data: { deletedAt: new Date() },
            });
          }
          return query(args);
        },
        async deleteMany({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            const ctx = Prisma.getExtensionContext(this) as Record<
              string,
              { updateMany: Function } | undefined
            >;
            const key = model.charAt(0).toLowerCase() + model.slice(1);
            return ctx[key]!.updateMany({
              where: args.where,
              data: { deletedAt: new Date() },
            });
          }
          return query(args);
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
