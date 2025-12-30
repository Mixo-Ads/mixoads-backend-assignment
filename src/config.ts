import dotenv from 'dotenv';

dotenv.config();

export const config = {
  api: {
    baseUrl: process.env.AD_PLATFORM_API_URL || 'http://localhost:3001',
    email: process.env.AD_PLATFORM_EMAIL || 'admin@mixoads.com',
    password: process.env.AD_PLATFORM_PASSWORD || 'SuperSecret123!',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'mixoads',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  useMockDb: process.env.USE_MOCK_DB !== 'false', // Default to true (mock mode) unless explicitly set to 'false'
  sync: {
    pageSize: 10,
    requestTimeout: 10000, // 10 seconds
    maxRetries: 3,
    retryBaseDelay: 1000, // 1 second
    rateLimitRetryAfter: 60000, // 1 minute
  },
};

// Validate required configuration (warn if using defaults, but don't fail)
if (!process.env.AD_PLATFORM_EMAIL || !process.env.AD_PLATFORM_PASSWORD) {
  console.warn('⚠ Warning: Using default credentials. Set AD_PLATFORM_EMAIL and AD_PLATFORM_PASSWORD in .env for production.');
}

