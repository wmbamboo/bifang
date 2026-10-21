import { request } from '@umijs/max';

export type FeedbackType = 'bug' | 'suggestion' | 'data' | 'other';
export type FeedbackStatus =
  | 'pending'
  | 'resolving'
  | 'fixed'
  | 'resolved'
  | 'ignored';

export interface FeedbackItem {
  id: string;
  feedback_type: FeedbackType;
  content: string;
  page?: string;
  status: FeedbackStatus;
  assignee?: string;
  assignee_name?: string;
  reply?: string;
  user?: string;
  user_name?: string;
  gen_id?: string;
  gen_type?: string;
  outline_id?: string;
  target_key?: string;
  context_json?: string;
  images?: string[];
  notify_status?: string;
  created_at?: string;
  updated_at?: string;
  comments?: Array<{
    id: number;
    feedback_id: string;
    user?: string;
    user_name?: string;
    content: string;
    created_at?: string;
  }>;
}

interface ApiResp<T> {
  code: number;
  msg: string;
  data: T;
  success?: boolean;
}

export async function createFeedback(body: Record<string, any>) {
  return request<ApiResp<FeedbackItem>>('/api/feedback', {
    method: 'POST',
    data: body,
  });
}

export async function listFeedback(params?: {
  mine?: number;
  status?: string;
  assignee?: string;
}) {
  return request<ApiResp<FeedbackItem[]>>('/api/feedback', {
    method: 'GET',
    params,
  });
}

export async function getFeedback(id: string) {
  return request<ApiResp<FeedbackItem>>(`/api/feedback/${id}`, {
    method: 'GET',
  });
}

export async function updateFeedback(id: string, body: Record<string, any>) {
  return request<ApiResp<FeedbackItem>>(`/api/feedback/${id}`, {
    method: 'PUT',
    data: body,
  });
}

export async function addFeedbackComment(id: string, content: string) {
  return request<ApiResp<any>>(`/api/feedback/${id}/comments`, {
    method: 'POST',
    data: { content },
  });
}

export async function uploadFeedbackImage(file: File | Blob, filename?: string) {
  const fd = new FormData();
  fd.append('file', file, filename || 'shot.png');
  return request<ApiResp<{ file_name: string; url: string }>>(
    '/api/feedback/upload-image',
    {
      method: 'POST',
      data: fd,
      requestType: 'form',
    },
  );
}

export async function fetchUnreadFeedbackCount() {
  return request<ApiResp<{ count: number }>>('/api/feedback/unread-count', {
    method: 'GET',
  });
}

export async function resendFeedbackNotify(id: string) {
  return request<ApiResp<{ notify_status?: string }>>(
    `/api/feedback/${id}/resend-notify`,
    { method: 'POST' },
  );
}

/** 通知状态展示文案 */
export function notifyStatusLabel(status?: string): {
  text: string;
  color?: string;
  tip?: string;
} {
  switch (status) {
    case 'sent':
      return { text: '已发送', color: 'green' };
    case 'pending':
      return { text: '发送中', color: 'blue' };
    case 'no_email':
      return {
        text: '未发送·提交人未填邮箱',
        color: 'orange',
        tip: '在个人中心补充邮箱后可重发',
      };
    case 'failed':
      return { text: '发送失败', color: 'red', tip: '可尝试重发' };
    case 'skipped':
      return { text: '未发送·已跳过', color: 'default' };
    default:
      return { text: status || '—', color: 'default' };
  }
}

const QUEUE_KEY = 'bf_feedback_offline_queue';

export function loadFeedbackOfflineQueue(): any[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveFeedbackOfflineQueue(q: any[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export async function flushFeedbackOfflineQueue() {
  const q = loadFeedbackOfflineQueue();
  if (!q.length) return;
  const left: any[] = [];
  for (const item of q) {
    try {
      await createFeedback(item);
    } catch {
      left.push(item);
    }
  }
  saveFeedbackOfflineQueue(left);
}
