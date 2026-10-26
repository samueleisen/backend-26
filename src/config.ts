import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('8080').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
  DATABASE_POOL_MAX: z.string().default('20').transform((val) => parseInt(val, 10)),
  DATABASE_IDLE_TIMEOUT_MS: z.string().default('30000').transform((val) => parseInt(val, 10)),
  DATABASE_CONN_TIMEOUT_MS: z.string().default('5000').transform((val) => parseInt(val, 10)),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
  JWT_EXPIRES_IN: z.string().default('24h'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
