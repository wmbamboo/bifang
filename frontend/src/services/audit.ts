import { request } from '@umijs/max';

interface PageResp<T> {
  code: number;
  msg: string;
  data: { list: T[]; total: number; page: number; size: number };
  success?: boolean;
}

export async function fetchUserLogs(params: Record<string, any>) {
  return request<PageResp<any>>('/mock_api/user/logs', {
    method: 'GET',
    params,
  });
}

export async function fetchLoginLogs(params: Record<string, any>) {
  return request<PageResp<any>>('/mock_api/login/logs', {
    method: 'GET',
    params,
  });
}

export async function reportUserLog(body: {
  action: string;
  url?: string;
  module?: string;
  menu?: string;
  target?: string;
  result?: string;
  detail?: string;
  duration_ms?: number;
  event?: string;
}) {
  return request('/mock_api/user-log', {
    method: 'POST',
    data: body,
    skipErrorHandler: true,
  });
}
