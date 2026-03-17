export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function apiSuccess<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function apiError(code: string, message: string, details?: unknown): ApiError {
  return { success: false, error: { code, message, details } };
}
