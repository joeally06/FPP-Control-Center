import { NextResponse } from 'next/server';

/**
 * Standard API error response format
 */
export interface ApiErrorResponse {
  error: string;
  message?: string;
  code?: string;
  details?: unknown;
}

/**
 * Standard API success response format
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data?: T;
  message?: string;
}

/**
 * Known error types with standard HTTP status codes and messages
 */
export enum ApiErrorType {
  // Authentication & Authorization (4xx)
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  ADMIN_REQUIRED = 'ADMIN_REQUIRED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Client Errors (4xx)
  BAD_REQUEST = 'BAD_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  
  // Server Errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
}

/**
 * Error type to HTTP status code mapping
 */
const ERROR_STATUS_CODES: Record<ApiErrorType, number> = {
  [ApiErrorType.UNAUTHORIZED]: 401,
  [ApiErrorType.FORBIDDEN]: 403,
  [ApiErrorType.AUTHENTICATION_REQUIRED]: 401,
  [ApiErrorType.ADMIN_REQUIRED]: 403,
  [ApiErrorType.RATE_LIMIT_EXCEEDED]: 429,
  [ApiErrorType.BAD_REQUEST]: 400,
  [ApiErrorType.NOT_FOUND]: 404,
  [ApiErrorType.VALIDATION_ERROR]: 400,
  [ApiErrorType.DUPLICATE_ENTRY]: 409,
  [ApiErrorType.INTERNAL_ERROR]: 500,
  [ApiErrorType.DATABASE_ERROR]: 500,
  [ApiErrorType.EXTERNAL_SERVICE_ERROR]: 502,
};

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(
    public type: ApiErrorType,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  error: unknown,
  fallbackMessage = 'An unexpected error occurred'
): NextResponse<ApiErrorResponse> {
  // Handle ApiError instances
  if (error instanceof ApiError) {
    const status = ERROR_STATUS_CODES[error.type];
    const response: ApiErrorResponse = {
      error: error.type,
      message: error.message,
    };
    
    // Include details in development mode
    if (process.env.NODE_ENV === 'development' && error.details) {
      response.details = error.details;
    }
    
    return NextResponse.json(response, { status });
  }

  // Handle standard Error instances
  if (error instanceof Error) {
    // Check for known error patterns in message
    const message = error.message.toLowerCase();
    
    if (message.includes('authentication required')) {
      return NextResponse.json(
        { error: ApiErrorType.AUTHENTICATION_REQUIRED, message: error.message },
        { status: 401 }
      );
    }
    
    if (message.includes('admin access required') || message.includes('admin required')) {
      return NextResponse.json(
        { error: ApiErrorType.ADMIN_REQUIRED, message: error.message },
        { status: 403 }
      );
    }
    
    if (message.includes('rate limit')) {
      return NextResponse.json(
        { error: ApiErrorType.RATE_LIMIT_EXCEEDED, message: error.message },
        { status: 429 }
      );
    }

    if (message.includes('not found')) {
      return NextResponse.json(
        { error: ApiErrorType.NOT_FOUND, message: error.message },
        { status: 404 }
      );
    }

    if (message.includes('duplicate') || message.includes('already exists')) {
      return NextResponse.json(
        { error: ApiErrorType.DUPLICATE_ENTRY, message: error.message },
        { status: 409 }
      );
    }

    // Default to internal error
    return NextResponse.json(
      {
        error: ApiErrorType.INTERNAL_ERROR,
        message: error.message || fallbackMessage,
      },
      { status: 500 }
    );
  }

  // Handle unknown error types
  console.error('[API Error] Unknown error type:', error);
  return NextResponse.json(
    { error: ApiErrorType.INTERNAL_ERROR, message: fallbackMessage },
    { status: 500 }
  );
}

/**
 * Creates a standardized success response
 */
export function createSuccessResponse<T = unknown>(
  data?: T,
  message?: string,
  status: number = 200
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      ...(data !== undefined && { data }),
      ...(message && { message }),
    },
    { status }
  );
}

/**
 * Higher-order function that wraps an API route handler with standardized error handling
 * 
 * @param handler - The API route handler function
 * @returns Wrapped handler with automatic error handling
 * 
 * @example
 * export const GET = withErrorHandling(async (request: NextRequest) => {
 *   const data = await fetchData();
 *   return createSuccessResponse(data);
 * });
 */
export function withErrorHandling<A extends unknown[]>(
  handler: (...args: A) => Promise<NextResponse>
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      // Log error for monitoring
      console.error('[API Route Error]:', error);
      
      // Return standardized error response
      return createErrorResponse(error);
    }
  };
}

/**
 * Validates required fields in request body
 * Throws ApiError if validation fails
 */
export function validateRequiredFields(
  data: Record<string, unknown>,
  requiredFields: string[]
): void {
  const missingFields = requiredFields.filter(field => {
    const value = data[field];
    return value === undefined || value === null || value === '';
  });

  if (missingFields.length > 0) {
    throw new ApiError(
      ApiErrorType.VALIDATION_ERROR,
      `Missing required fields: ${missingFields.join(', ')}`,
      { missingFields }
    );
  }
}
