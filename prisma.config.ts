import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'db/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
