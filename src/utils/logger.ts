type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

class Logger {
  private maskSensitiveData(data: any): any {
    if (typeof data === 'string') {
      // Mask email addresses
      data = data.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '***@***.***');

      // Mask tokens (show only first and last 4 chars)
      if (data.startsWith('mock_access_token_') || data.startsWith('Bearer ')) {
        const token = data.replace('Bearer ', '');
        if (token.length > 12) {
          return token.substring(0, 6) + '...' + token.substring(token.length - 4);
        }
      }

      // Mask base64 auth strings
      if (data.startsWith('Basic ')) {
        return 'Basic ***';
      }
    }
    return data;
  }

  private log(level: LogLevel, message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    const maskedMessage = this.maskSensitiveData(message);

    let logMessage = `[${timestamp}] [${level}] ${maskedMessage}`;

    if (meta) {
      const maskedMeta = this.maskSensitiveData(JSON.stringify(meta, null, 2));
      logMessage += `\n${maskedMeta}`;
    }

    if (level === 'ERROR') {
      console.error(logMessage);
    } else if (level === 'WARN') {
      console.warn(logMessage);
    } else {
      console.log(logMessage);
    }
  }

  debug(message: string, meta?: any): void {
    this.log('DEBUG', message, meta);
  }

  info(message: string, meta?: any): void {
    this.log('INFO', message, meta);
  }

  warn(message: string, meta?: any): void {
    this.log('WARN', message, meta);
  }

  error(message: string, error?: Error | any): void {
    const meta = error ? {
      message: error.message,
      code: error.code,
      // Don't include stack traces in production
    } : undefined;
    this.log('ERROR', message, meta);
  }
}

export const logger = new Logger();
