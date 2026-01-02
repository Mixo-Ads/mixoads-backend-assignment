import dotenv from 'dotenv';

dotenv.config();

interface Config {
  adPlatform: {
    apiUrl: string;
    email: string;
    password: string;
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    useMock: boolean;
  };
  sync: {
    timeout: {
      auth: number;
      list: number;
      sync: number;
    };
    retry: {
      maxAttempts: number;
      baseDelay: number;
    };
    concurrency: number;
  };
}

function validateEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config: Config = {
  adPlatform: {
    apiUrl: validateEnv('AD_PLATFORM_API_URL'),
    email: validateEnv('AD_PLATFORM_EMAIL'),
    password: validateEnv('AD_PLATFORM_PASSWORD'),
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'mixoads',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    useMock: process.env.USE_MOCK_DB === 'true',
  },
  sync: {
    timeout: {
      auth: 10000,      // 10 seconds for auth
      list: 15000,      // 15 seconds for campaign list
      sync: 30000,      // 30 seconds for sync (API takes 2s)
    },
    retry: {
      maxAttempts: 5,   // Max 5 retry attempts
      baseDelay: 1000,  // Start with 1 second delay
    },
    concurrency: 3,     // Process 3 campaigns concurrently (balance speed vs rate limits)
  },
};
