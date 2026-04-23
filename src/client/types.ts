export interface DsmApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: number;
    errors?: Array<{ code: number; path?: string }>;
  };
}

export interface DsmLoginData {
  sid: string;
  did?: string;
  is_portal_port?: boolean;
}
