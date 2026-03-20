import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/framework-drivers/database/schema.ts',
  out: './src/main/framework-drivers/database/migrations'
})
