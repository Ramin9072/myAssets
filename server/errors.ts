export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export type PriceErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'HTTP'
  | 'INVALID_RESPONSE'
  | 'INCONSISTENT'
  | 'NO_PRICES'
  | 'USD_MARKET_UNSUPPORTED';

export class PriceError extends Error {
  constructor(
    public code: PriceErrorCode,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}

export class StorageError extends Error {
  constructor(
    public code: 'CORRUPT' | 'CONFLICT' | 'INVALID' | 'UNAVAILABLE',
    message: string,
  ) {
    super(message);
  }
}
