/**
 * Unified API Client
 * Provides consistent error handling, retry logic, and request management
 */

import logger from './logger';
import { AppError, retryAsync, safeAsync } from './errorHandler';

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    statusCode: number;
  };
}

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;

/**
 * Create fetch request with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = DEFAULT_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * API Client
 */
export class ApiClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  constructor(baseURL: string = '') {
    this.baseURL = baseURL;
  }

  /**
   * Set authorization header
   */
  setAuthorizationToken(token: string): void {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Build full URL
   */
  private getFullUrl(endpoint: string): string {
    if (endpoint.startsWith('http')) {
      return endpoint;
    }
    return this.baseURL ? `${this.baseURL}${endpoint}` : endpoint;
  }

  /**
   * Handle response
   */
  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const contentType = response.headers.get('content-type');

    if (!response.ok) {
      let error: any = {};

      try {
        if (contentType?.includes('application/json')) {
          error = await response.json();
        } else {
          error = { message: await response.text() };
        }
      } catch {
        error = { message: response.statusText };
      }

      return {
        ok: false,
        error: {
          code: error.code || 'HTTP_ERROR',
          message: error.message || response.statusText,
          statusCode: response.status,
        },
      };
    }

    try {
      const data = contentType?.includes('application/json')
        ? await response.json()
        : await response.text();
      return { ok: true, data };
    } catch (error) {
      logger.error('[ApiClient] Failed to parse response', { error });
      return {
        ok: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Failed to parse response',
          statusCode: 500,
        },
      };
    }
  }

  /**
   * Generic request method
   */
  async request<T = any>(
    endpoint: string,
    options: ApiRequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = DEFAULT_TIMEOUT,
      maxRetries = DEFAULT_MAX_RETRIES,
      retryDelay = DEFAULT_RETRY_DELAY,
    } = options;

    const url = this.getFullUrl(endpoint);
    const mergedHeaders = { ...this.defaultHeaders, ...headers };

    const makeRequest = async () => {
      logger.info(`[ApiClient] ${method} ${endpoint}`);

      const response = await fetchWithTimeout(
        url,
        {
          method,
          headers: mergedHeaders,
          body: body ? JSON.stringify(body) : undefined,
        },
        timeout,
      );

      return this.handleResponse<T>(response);
    };

    try {
      return await retryAsync(makeRequest, maxRetries, retryDelay);
    } catch (error) {
      logger.error('[ApiClient] Request failed after retries', { error, endpoint });
      return {
        ok: false,
        error: {
          code: 'REQUEST_FAILED',
          message: error instanceof Error ? error.message : 'Request failed',
          statusCode: 0,
        },
      };
    }
  }

  /**
   * GET request
   */
  async get<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T = any>(
    endpoint: string,
    body?: any,
    options?: ApiRequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  /**
   * PUT request
   */
  async put<T = any>(
    endpoint: string,
    body?: any,
    options?: ApiRequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  /**
   * PATCH request
   */
  async patch<T = any>(
    endpoint: string,
    body?: any,
    options?: ApiRequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }

  /**
   * DELETE request
   */
  async delete<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Safe request with fallback
   */
  async safeGet<T = any>(endpoint: string, fallback: T, options?: ApiRequestOptions): Promise<T> {
    const response = await this.get<T>(endpoint, options);
    return response.ok && response.data ? response.data : fallback;
  }

  /**
   * Safe POST with fallback
   */
  async safePost<T = any>(
    endpoint: string,
    body?: any,
    fallback?: T,
    options?: ApiRequestOptions,
  ): Promise<T | undefined> {
    const response = await this.post<T>(endpoint, body, options);
    return response.ok && response.data ? response.data : fallback;
  }
}

// Singleton instance
let apiClient: ApiClient | null = null;

export function initApiClient(baseURL: string = ''): ApiClient {
  apiClient = new ApiClient(baseURL);
  logger.info(`[ApiClient] Initialized with base URL: ${baseURL}`);
  return apiClient;
}

export function getApiClient(): ApiClient {
  if (!apiClient) {
    apiClient = new ApiClient();
  }
  return apiClient;
}

const apiClientExports = {
  ApiClient,
  initApiClient,
  getApiClient,
};

export default apiClientExports;
