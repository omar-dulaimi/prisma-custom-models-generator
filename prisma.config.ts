import { defineConfig } from 'prisma/config';

// Prisma 7 no longer accepts `url` inside the schema's datasource block.
// The connection URL lives here instead.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  },
});
