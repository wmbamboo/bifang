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
  comment_count?: number;
  new_comment_count?: number;
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

export async function fetchUnreadFeedbackCount(
  scope: 'all' | 'submitter' | 'comments' = 'all',
) {
  return request<
    ApiResp<{ count: number; new_comments?: number; todos?: number }>
  >('/api/feedback/unread-count', {
    method: 'GET',
    params: { scope },
  });
}

export async function markFeedbackCommentsRead(id: string) {
  return request<ApiResp<{ comments_read_at?: string; new_comment_count?: number }>>(
    `/api/feedback/${id}/comments/read`,
    { method: 'POST' },
  );
}

export async function resendFeedbackNotify(id: string) {
  return request<ApiResp<{ notify_status?: string }>>(
    `/api/feedback/${id}/resend-notify`,
    { method: 'POST' },
  );
}

export interface CursorJobMeta {
  job_id?: string;
  status?: string;
  error?: string;
  created_by?: string;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  agent_id?: string;
  has_result?: boolean;
  has_error?: boolean;
  has_pack?: boolean;
  ids?: string[];
}

export async function dispatchFeedbackToCursor(body: {
  ids: string[];
  instruction?: string;
}) {
  return request<ApiResp<{ job_id: string; status: string }>>(
    '/api/feedback/cursor-dispatch',
    { method: 'POST', data: body },
  );
}

/** 打包反馈并生成 WorkBuddy 分析指令（不派 Cursor，等待 WorkBuddy 写回 RESULT.md） */
export async function prepareFeedbackForWorkbuddy(body: {
  ids: string[];
  instruction?: string;
}) {
  return request<
    ApiResp<{ job_id: string; status: string; agent?: string; instruction: string }>
  >('/api/feedback/workbuddy-prepare', { method: 'POST', data: body });
}

export async function getCursorJob(jobId: string) {
  return request<ApiResp<CursorJobMeta>>(
    `/api/feedback/cursor-jobs/${jobId}`,
    { method: 'GET' },
  );
}

export interface FeedbackDevJob {
  job_id: string;
  status?: string;
  created_by?: string;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  agent_id?: string;
  error?: string;
  instruction?: string;
  ids?: string[];
  feedbacks?: Array<{
    id?: string;
    status?: string;
    feedback_type?: string;
    content?: string;
    user?: string;
    user_name?: string;
    page?: string;
    reply?: string;
    created_at?: string;
    updated_at?: string;
    images?: string[];
  }>;
  has_pack?: boolean;
  has_result?: boolean;
  has_error?: boolean;
  has_brief?: boolean;
  result_preview?: string;
  pack_size?: number;
  brief_md?: string;
  result_md?: string;
  error_md?: string;
  manifest?: Record<string, any>;
}

export async function listFeedbackDevJobs(limit = 100) {
  return request<ApiResp<FeedbackDevJob[]>>('/api/feedback/dev/jobs', {
    method: 'GET',
    params: { limit },
  });
}

export async function getFeedbackDevJob(jobId: string) {
  return request<ApiResp<FeedbackDevJob>>(
    `/api/feedback/dev/jobs/${jobId}`,
    { method: 'GET' },
  );
}

/** 反馈处理状态展示文案（表格 / 抽屉 / 弹窗共用） */
export function feedbackStatusLabel(status?: string): {
  text: string;
  color: string;
  tip?: string;
} {
  switch (status) {
    case 'pending':
      return { text: '待处理', color: 'orange', tip: '已提交，等待处理' };
    case 'resolving':
      return { text: '处理中', color: 'blue', tip: '正在修复或评估' };
    case 'fixed':
      return {
        text: '待验证',
        color: 'purple',
        tip: '已修复，等待提交人或验证员验证',
      };
    case 'resolved':
      return { text: '已关闭', color: 'green', tip: '提交人或验证员已验证' };
    case 'ignored':
      return { text: '已忽略', color: 'default', tip: '经评估不处理' };
    default:
      return { text: status || '—', color: 'default' };
  }
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
