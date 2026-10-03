import { defineConfig } from 'drizzle-kit';
// Generation is offline; applying migrations is exclusively scripts/migrate.ts.
export default defineConfig({ dialect: 'postgresql', schema: './src/server/db/schema/index.ts', out: './drizzle', schemaFilter: ['clinic_app'], strict: true, verbose: false });
