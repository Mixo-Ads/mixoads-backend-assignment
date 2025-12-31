/**
 * Structured logging system with multiple log levels and formats
 */

import { LogLevel, LogEntry } from '../types';

/**
 * Logger configuration
 */
interface LoggerConfig {
  level: LogLevel;
  format: 'text' | 'json';
  includeTimestamp: boolean;
}

/**
 * Logger class for structured logging
 */
export class Logger {
  private config: LoggerConfig;
  private static instance: Logger;

  private constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: config.level || LogLevel.INFO,
      format: config.format || 'text',
      includeTimestamp: config.includeTimestamp !== false,
    };
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  /**
   * Update logger configuration
   */
  public configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const configLevelIndex = levels.indexOf(this.config.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= configLevelIndex;
  }

  /**
   * Format log entry
   */
  private formatEntry(entry: LogEntry): string {
    if (this.config.format === 'json') {
      return JSON.stringify(entry);
    }

    // Text format
    const parts: string[] = [];
    
    if (this.config.includeTimestamp) {
      parts.push(`[${entry.timestamp}]`);
    }
    
    parts.push(`[${entry.level}]`);
    parts.push(entry.message);
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      parts.push(JSON.stringify(entry.context));
    }
    
    return parts.join(' ');
  }

  /**
   * Create log entry
   */
  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };
  }

  /**
   * Write log to output
   */
  private write(entry: LogEntry): void {
    const formatted = this.formatEntry(entry);
    
    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  /**
   * Log debug message
   */
  public debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = this.createEntry(LogLevel.DEBUG, message, context);
      this.write(entry);
    }
  }

  /**
   * Log info message
   */
  public info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = this.createEntry(LogLevel.INFO, message, context);
      this.write(entry);
    }
  }

  /**
   * Log warning message
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = this.createEntry(LogLevel.WARN, message, context);
      this.write(entry);
    }
  }

  /**
   * Log error message
   */
  public error(message: string, error?: Error, context?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorContext = {
        ...context,
        ...(error && {
          errorName: error.name,
          errorMessage: error.message,
          errorStack: error.stack,
        }),
      };
      const entry = this.createEntry(LogLevel.ERROR, message, errorContext);
      this.write(entry);
    }
  }

  /**
   * Log with custom level
   */
  public log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog(level)) {
      const entry = this.createEntry(level, message, context);
      this.write(entry);
    }
  }

  /**
   * Create a child logger with context
   */
  public child(context: Record<string, unknown>): ChildLogger {
    return new ChildLogger(this, context);
  }
}

/**
 * Child logger with inherited context
 */
export class ChildLogger {
  constructor(
    private parent: Logger,
    private context: Record<string, unknown>
  ) {}

  private mergeContext(additional?: Record<string, unknown>): Record<string, unknown> {
    return { ...this.context, ...additional };
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    this.parent.debug(message, this.mergeContext(context));
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.parent.info(message, this.mergeContext(context));
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.parent.warn(message, this.mergeContext(context));
  }

  public error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.parent.error(message, error, this.mergeContext(context));
  }

  public log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    this.parent.log(level, message, this.mergeContext(context));
  }
}

/**
 * Default logger instance
 */
export const logger = Logger.getInstance();