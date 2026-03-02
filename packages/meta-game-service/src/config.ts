import { z } from 'zod';
import path from 'node:path';

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRY: z.string().default('7d'),
  DATA_DIR: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// __dirname is available in CJS (nodenext without "type":"module")
const defaultDataDir = path.resolve(__dirname, '..', 'data');

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// Mutable config object to allow test overrides
export const config: {
  PORT: number;
  HOST: string;
  JWT_SECRET: string;
  JWT_EXPIRY: string;
  DATA_DIR: string;
  NODE_ENV: 'development' | 'production' | 'test';
} = {
  ...parsed.data,
  DATA_DIR: parsed.data.DATA_DIR ?? defaultDataDir,
};

export type Config = typeof config;
