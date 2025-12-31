/**
 * Configuration management with environment variable validation
 */

import * as dotenv from 'dotenv';
import { Config, LogLevel } from './types';
import { ConfigError } from './utils/ErrorHandler';

// Load environment variables
dotenv.config();

/**
 * Get environment variable with validation
 */
function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new ConfigError(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Get number from environment variable
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new ConfigError(`Invalid number for ${key}: ${value}`);
  }
  return parsed;
}

/**
 * Get log level from environment variable
 */
function getLogLevel(value: string): LogLevel {
  const upperValue = value.toUpperCase();
  if (Object.values(LogLevel).includes(upperValue as LogLevel)) {
    return upperValue as LogLevel;
  }
  throw new ConfigError(`Invalid log level: ${value}. Must be one of: DEBUG, INFO, WARN, ERROR`);
}

/**
 * Validate URL format
 */
function validateUrl(url: string, name: string): string {
  try {
    new URL(url);
    return url;
  } catch {
    throw new ConfigError(`Invalid URL for ${name}: ${url}`);
  }
}

/**
 * Validate email format
 */
function validateEmail(email: string): string {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ConfigError(`Invalid email format: ${email}`);
  }
  return email;
}

/**
 * Validate positive number
 */
function validatePositive(value: number, name: string): number {
  if (value <= 0) {
    throw new ConfigError(`${name} must be positive: ${value}`);
  }
  return value;
}

/**
 * Load and validate configuration
 */
export function loadConfig(): Config {
  try {
    const config: Config = {
      api: {
        baseUrl: validateUrl(
          getEnvVar('AD_PLATFORM_API_URL'),
          'AD_PLATFORM_API_URL'
        ),
        email: validateEmail(getEnvVar('API_EMAIL')),
        password: getEnvVar('API_PASSWORD'),
        fetchTimeout: validatePositive(
          getEnvNumber('FETCH_TIMEOUT_MS', 3000),
          'FETCH_TIMEOUT_MS'
        ),
        syncTimeout: validatePositive(
          getEnvNumber('SYNC_TIMEOUT_MS', 10000),
          'SYNC_TIMEOUT_MS'
        ),
      },
      sync: {
        maxConcurrent: validatePositive(
          getEnvNumber('MAX_CONCURRENT_SYNCS', 3),
          'MAX_CONCURRENT_SYNCS'
        ),
        pageSize: validatePositive(
          getEnvNumber('PAGE_SIZE', 10),
          'PAGE_SIZE'
        ),
      },
      retry: {
        maxAttempts: validatePositive(
          getEnvNumber('MAX_RETRY_ATTEMPTS', 5),
          'MAX_RETRY_ATTEMPTS'
        ),
        baseDelay: validatePositive(
          getEnvNumber('BASE_RETRY_DELAY_MS', 1000),
          'BASE_RETRY_DELAY_MS'
        ),
        jitter: getEnvNumber('RETRY_JITTER_MS', 250),
        maxDelay: validatePositive(
          getEnvNumber('MAX_RETRY_DELAY_MS', 16000),
          'MAX_RETRY_DELAY_MS'
        ),
      },
      rateLimit: {
        maxRequests: validatePositive(
          getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 10),
          'RATE_LIMIT_MAX_REQUESTS'
        ),
        windowMs: validatePositive(
          getEnvNumber('RATE_LIMIT_WINDOW_MS', 60000),
          'RATE_LIMIT_WINDOW_MS'
        ),
      },
      database: {
        host: getEnvVar('DB_HOST', 'localhost'),
        port: validatePositive(
          getEnvNumber('DB_PORT', 5432),
          'DB_PORT'
        ),
        database: getEnvVar('DB_NAME', 'mixoads'),
        user: getEnvVar('DB_USER', 'postgres'),
        password: getEnvVar('DB_PASSWORD', 'postgres'),
        max: validatePositive(
          getEnvNumber('DB_MAX_CONNECTIONS', 10),
          'DB_MAX_CONNECTIONS'
        ),
        idleTimeoutMillis: validatePositive(
          getEnvNumber('DB_IDLE_TIMEOUT_MS', 30000),
          'DB_IDLE_TIMEOUT_MS'
        ),
        connectionTimeoutMillis: validatePositive(
          getEnvNumber('DB_CONNECTION_TIMEOUT_MS', 2000),
          'DB_CONNECTION_TIMEOUT_MS'
        ),
      },
      logging: {
        level: getLogLevel(getEnvVar('LOG_LEVEL', 'INFO')),
        format: (getEnvVar('LOG_FORMAT', 'text') === 'json' ? 'json' : 'text'),
      },
    };

    // Validate configuration constraints
    if (config.sync.maxConcurrent > 10) {
      throw new ConfigError('MAX_CONCURRENT_SYNCS cannot exceed 10');
    }

    if (config.retry.maxAttempts > 20) {
      throw new ConfigError('MAX_RETRY_ATTEMPTS cannot exceed 20');
    }

    if (config.retry.baseDelay > config.retry.maxDelay) {
      throw new ConfigError('BASE_RETRY_DELAY_MS cannot exceed MAX_RETRY_DELAY_MS');
    }

    return config;
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    throw new ConfigError(
      `Failed to load configuration: ${(error as Error).message}`,
      { originalError: error }
    );
  }
}

/**
 * Print configuration (with sensitive data masked)
 */
export function printConfig(config: Config): void {
  const masked = {
    ...config,
    api: {
      ...config.api,
      password: '***REDACTED***',
    },
    database: {
      ...config.database,
      password: '***REDACTED***',
    },
  };

  console.log('Configuration:');
  console.log(JSON.stringify(masked, null, 2));
}

/**
 * Validate configuration is complete
 */
export function validateConfig(config: Config): void {
  const required = [
    'api.baseUrl',
    'api.email',
    'api.password',
    'database.host',
    'database.database',
    'database.user',
    'database.password',
  ];

  for (const path of required) {
    const parts = path.split('.');
    let value: unknown = config;
    
    for (const part of parts) {
      value = (value as Record<string, unknown>)[part];
      if (value === undefined || value === null || value === '') {
        throw new ConfigError(`Missing required configuration: ${path}`);
      }
    }
  }
}

/**
 * Get default config for testing
 */
export function getTestConfig(): Config {
  return {
    api: {
      baseUrl: process.env.TEST_API_URL || 'http://localhost:3002',
      email: 'test@example.com',
      password: 'test123',
      fetchTimeout: 1000,
      syncTimeout: 2000,
    },
    sync: {
      maxConcurrent: 2,
      pageSize: 10,
    },
    retry: {
      maxAttempts: 3,
      baseDelay: 100,
      jitter: 50,
      maxDelay: 1000,
    },
    rateLimit: {
      maxRequests: 10,
      windowMs: 10000,
    },
    database: {
      host: 'localhost',
      port: 5432,
      database: process.env.TEST_DB_NAME || 'mixoads_test',
      user: 'postgres',
      password: 'postgres',
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 1000,
    },
    logging: {
      level: LogLevel.ERROR,
      format: 'text',
    },
  };
}