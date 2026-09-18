import { request } from '@umijs/max';

// export const base_url = 'http://127.0.0.1:7862/knowledge_base';

interface KBResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export async function listKnowledgeBases() {
  return request<KBResponse<API.KnowledgeBase[]>>(`/knowledge_base/list_knowledge_bases`, {
    method: 'GET',
  });
}

export async function createKnowledgeBase(params: {
  knowledge_base_name: string;
  kb_info?: string;
  vector_store_type?: string;
  embed_model?: string;
}) {
  return request<KBResponse<any>>(`/knowledge_base/create_knowledge_base`, {
    method: 'POST',
    data: params,
  });
}

export async function uploadDocs(params: {
  knowledge_base_name: string;
  files: FormData;
}) {
  const formData = new FormData();
  for (const [, value] of params.files.entries()) {
    formData.append('files', value);
  }
  formData.append('knowledge_base_name', params.knowledge_base_name);

  return request<KBResponse<any>>(`/knowledge_base/upload_docs`, {
    method: 'POST',
    data: formData,
    requestType: 'form',
    headers: {
      'Accept': 'application/json',
    },
  });
}

export async function searchDocs(params: {
  query: string;
  knowledge_base_name: string;
  top_k?: number;
  score_threshold?: number;
  mode?: 'hybrid' | 'vector' | 'bm25';
}) {
  const response = await request<API.SearchResult[]>(`/knowledge_base/search_docs`, {
    method: 'POST',
    data: {
      query: params.query,
      knowledge_base_name: params.knowledge_base_name,
      top_k: params.top_k || 10,
      ...(params.score_threshold !== undefined ? { score_threshold: params.score_threshold } : {}),
      mode: params.mode || 'hybrid',
    },
  });

  // 确保每个搜索结果都包含知识库名称
  if (Array.isArray(response)) {
    return response.map(doc => ({
      ...doc,
      metadata: {
        ...doc.metadata,
        kb_name: params.knowledge_base_name, // 添加知识库名称到 metadata
      },
    }));
  }

  return [];
}

export async function deleteDocs(params: {
  knowledge_base_name: string;
  file_names: string[];
  delete_content?: boolean;
}) {
  return request<KBResponse<any>>(`/knowledge_base/delete_docs`, {
    method: 'POST',
    data: params,
  });
}
export async function listDocs(knowledge_base_name: string) {
  return request<KBResponse<API.Document[]>>(`/knowledge_base/list_files`, {
    method: 'GET',
    params: { knowledge_base_name },
  });
}

export async function downloadDoc(params: {
  knowledge_base_name: string;
  file_name: string;
}) {
  if (!params.knowledge_base_name || !params.file_name) {
    throw new Error('知识库名称和文件名是必需的参数');
  }

  return request(`/knowledge_base/download_doc`, {
    method: 'GET',
    params: {
      knowledge_base_name: params.knowledge_base_name,
      file_name: params.file_name,
    },
    responseType: 'blob',  // 确保返回的是二进制数据
    headers: {
      'Accept': 'application/octet-stream',
    },
  });
}

export async function queryKbList(options?: { [key: string]: any }) {
  return request<API.KbListItem>('/knowledge_base/list_knowledge_bases', {
    method: 'GET',
    params: {},
    ...(options || {}),
  });
}

export async function updateKb(options?: { [key: string]: any }) {
  return request<API.KbItem>('/knowledge_base/update_info', {
    headers: {'Content-Type': 'application/json'},
    method: 'POST',
    data: {
      ...(options || {}),
    }
  });
}

export async function addKb(options?: { [key: string]: any }) {
  return request<API.KbItem>('/knowledge_base/create_knowledge_base', {
    headers: {
            'Content-Type': 'application/json',
        },
    method: 'POST',
    data: JSON.stringify(options),
  });
}
export async function deleteKb(options?:string) {
  return request<string>('/knowledge_base/delete_knowledge_base', {
    headers: {'Content-Type': 'application/json'},
    method: 'POST',
    data: options,
  });
}
export async function recreateVectorStore(options?: { [key: string]: any }) {
  return request<string>('/knowledge_base/recreate_vector_store', {
    headers: {'Content-Type': 'application/json'},
    method: 'POST',
    data: JSON.stringify(options),
  });
}


export async function queryKbFile(params: API.KbFileSearchParams) {
  return request('/knowledge_base/list_files', {
    headers: {'Content-Type': 'application/json'},
    method: 'GET',
    params: {
      knowledge_base_name: params.kb_name,
      query: params.query,
    },
  });
}
export async function batDeleteKbFile(options?:{[key:string]: any }) {
  console.log("batDeleteKbFileParam:",options)
  return request(`/knowledge_base/delete_docs`, {
    headers: {'accept': 'application/json','Content-Type': 'application/json'},
    method: 'POST',
    data: JSON.stringify(options),
  });
}

export async function updateKbFiles(options?:{[key:string]: any }) {
  return request(`/knowledge_base/update_docs`, {
   headers: {'Content-Type': 'application/json',},
   method: 'POST',
   data: JSON.stringify(options),
  });
}

/** 异步上传并创建解析/向量化任务 */
export async function uploadDocsAsync(formData: FormData) {
  return request(`/knowledge_base/upload_docs_async`, {
    method: 'POST',
    data: formData,
  });
}

export async function listUploadTasks(params?: { knowledge_base_name?: string; limit?: number }) {
  return request(`/knowledge_base/upload_tasks`, {
    method: 'GET',
    params: {
      knowledge_base_name: params?.knowledge_base_name || '',
      limit: params?.limit || 50,
    },
  });
}

export async function getUploadTask(taskId: string) {
  return request(`/knowledge_base/upload_tasks/${taskId}`, {
    method: 'GET',
  });
}

export async function pauseUploadTask(taskId: string) {
  return request(`/knowledge_base/upload_tasks/${taskId}/pause`, { method: 'POST' });
}

export async function resumeUploadTask(taskId: string) {
  return request(`/knowledge_base/upload_tasks/${taskId}/resume`, { method: 'POST' });
}

export async function stopUploadTask(taskId: string) {
  return request(`/knowledge_base/upload_tasks/${taskId}/stop`, { method: 'POST' });
}

export async function retryUploadTask(taskId: string) {
  return request(`/knowledge_base/upload_tasks/${taskId}/retry`, { method: 'POST' });
}

export async function revectorizeUploadTask(options: {
  knowledge_base_name: string;
  file_names: string[];
}) {
  return request(`/knowledge_base/upload_tasks/revectorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify(options),
  });
}

export async function addKbFile(data: API.KnowledgeBaseFile) {
  return request('/knowledge-base', {
    method: 'POST',
    data,
  });
}

export async function searchCrossKbDocs(params: {
  query: string;
  kb_names?: string[];
  top_k?: number;
  score_threshold?: number;
  mode?: 'hybrid' | 'vector' | 'bm25';
}) {
  return request<API.SearchResult[]>(`/knowledge_base/search_cross_kb_docs`, {
    method: 'POST',
    data: {
      query: params.query,
      kb_names: params.kb_names || [],
      top_k: params.top_k || 10,
      ...(params.score_threshold !== undefined ? { score_threshold: params.score_threshold } : {}),
      mode: params.mode || 'hybrid',
    },
  });
}
//用户管理
export async function getUserList() {
  return request<{ data: API.UserType[] }>('/mock_api/users');
}

export async function updateUser(data: API.UserType) {
  return request<{ success: boolean }>('/mock_api/user/update', {
    method: 'POST',
    data,
  });
}

export async function addUser(data: API.UserType) {
  return request<{ success: boolean }>('/mock_api/user/add', {
    method: 'POST',
    data,
  });
}

export async function deleteUser(data: string) {
  return request<{ success: boolean }>('/mock_api/user/delete', {
    method: 'GET',
    data:data,
  });
}

export async function changePassword(userId: string, oldPwd: string, newPwd: string) {
  return request<{ success: boolean }>('/mock_api/user/password', {
    method: 'PUT',
    data: { userId, oldPwd, newPwd },
  });
}








