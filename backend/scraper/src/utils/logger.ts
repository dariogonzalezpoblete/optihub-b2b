export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';

export class Logger {
  private static formatTimestamp(): string {
    return new Date().toISOString();
  }

  private static log(level: LogLevel, prefix: string, message: string, meta?: unknown): void {
    const ts = Logger.formatTimestamp();
    const metaStr = meta ? ` | ${typeof meta === 'object' ? JSON.stringify(meta) : String(meta)}` : '';
    console.log(`[${ts}] [${level}] ${prefix} ${message}${metaStr}`);
  }

  public static info(message: string, meta?: unknown): void {
    Logger.log('INFO', 'ℹ️ ', message, meta);
  }

  public static success(message: string, meta?: unknown): void {
    Logger.log('SUCCESS', '✅', message, meta);
  }

  public static warn(message: string, meta?: unknown): void {
    Logger.log('WARN', '⚠️ ', message, meta);
  }

  public static error(message: string, error?: unknown): void {
    const errDetails = error instanceof Error ? `${error.message}\n${error.stack}` : error;
    Logger.log('ERROR', '❌', message, errDetails);
  }

  public static debug(message: string, meta?: unknown): void {
    if (process.env.DEBUG === 'true') {
      Logger.log('DEBUG', '🔍', message, meta);
    }
  }

  public static apiIntercept(endpoint: string, itemCount: number, durationMs?: number): void {
    const duration = durationMs ? ` in ${durationMs}ms` : '';
    Logger.log('SUCCESS', '⚡ [API_INTERCEPT]', `Captured ${itemCount} items from: ${endpoint}${duration}`);
  }

  public static pricing(sku: string, usd: number, netoClp: number, brutoClp: number): void {
    Logger.log('INFO', '💲 [PRICING]', `${sku} -> Base: $${usd.toFixed(2)} USD | Net B2B: $${netoClp.toLocaleString('es-CL')} CLP | IVA Inc: $${brutoClp.toLocaleString('es-CL')} CLP`);
  }
}

/**
 * Execute an asynchronous function with automatic retries and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delayMs?: number;
    backoffFactor?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const retries = options.retries ?? 3;
  const initialDelay = options.delayMs ?? 1000;
  const factor = options.backoffFactor ?? 2;
  const opName = options.operationName ?? 'Operation';

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        Logger.error(`${opName} failed after ${retries} attempts`, err);
        break;
      }

      const delay = initialDelay * Math.pow(factor, attempt - 1) + Math.random() * 200;
      Logger.warn(`${opName} failed (attempt ${attempt}/${retries}). Retrying in ${Math.round(delay)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
