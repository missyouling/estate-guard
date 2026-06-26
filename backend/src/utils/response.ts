export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

export function success<T>(data?: T, message = 'ok'): ApiResponse<T> {
  return { code: 0, message, data };
}

export function fail(message: string, code = -1): ApiResponse {
  return { code, message };
}
