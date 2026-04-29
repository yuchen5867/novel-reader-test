const API_BASE = '/api';

function getToken(): string {
  return localStorage.getItem('admin_token') || '';
}

function getAccessToken(): string {
  return localStorage.getItem('access_token') || '';
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const accessToken = getAccessToken();
  if (accessToken) {
    headers['x-access-token'] = accessToken;
  }

  // Don't set Content-Type for FormData (multipart)
  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Auth
export const login = (username: string, password: string) =>
  request<{ token: string; username: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export const changePassword = (newPassword: string) =>
  request('/auth/change-password', {
    method: 'PUT',
    body: JSON.stringify({ newPassword }),
  });

// Access password (frontend gate)
export const checkAccessStatus = () =>
  request<{ needsPassword: boolean }>('/auth/check-access');

export const verifyAccessPassword = (password: string) =>
  request<{ token: string }>('/auth/verify-access', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });

// Novels
export interface Novel {
  id: string;
  title: string;
  author: string;
  cover_url: string;
  summary: string;
  ai_title: string;
  ai_summary: string;
  ai_tags: string[];
  tag_names: string[];
  tag_ids: string[];
  is_completed: number;
  total_chapters: number;
  total_words: number;
  source_file_path: string;
  created_at: string;
  updated_at: string;
  last_read_at: string | null;
}

export interface NovelListResponse {
  data: Novel[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const getNovels = (params?: {
  page?: number;
  limit?: number;
  search?: string;
  tag?: string;
  sort?: string;
  order?: string;
}) => {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') searchParams.set(k, String(v));
    });
  }
  return request<NovelListResponse>(`/novels?${searchParams.toString()}`);
};

export const getNovel = (id: string) => request<Novel>(`/novels/${id}`);

export const importNovel = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return request<{ id: string; title: string; totalChapters: number }>('/novels/import', {
    method: 'POST',
    body: formData,
  });
};

export const batchImportNovels = (files: File[]) => {
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  return request<{ tasks: any[] }>('/novels/batch-import', {
    method: 'POST',
    body: formData,
  });
};

export const updateNovel = (id: string, data: Partial<Novel>) =>
  request(`/novels/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const updateNovelTags = (id: string, tag_ids: string[]) =>
  request(`/novels/${id}/tags`, { method: 'PUT', body: JSON.stringify({ tag_ids }) });

export const updateNovelAiAnalysis = (id: string, data: { ai_title?: string; ai_summary?: string; ai_tags?: string[] }) =>
  request(`/novels/${id}/ai-analysis`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteNovel = (id: string) =>
  request(`/novels/${id}`, { method: 'DELETE' });

export const batchDeleteNovels = (ids: string[]) =>
  request('/novels/batch-delete', { method: 'POST', body: JSON.stringify({ ids }) });

// Chapters
export interface Chapter {
  id: string;
  chapter_number: number;
  title: string;
  word_count: number;
  is_extra: number;
}

export interface ChapterDetail extends Chapter {
  content: string;
  prev: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
}

export const getChapters = (novelId: string) =>
  request<Chapter[]>(`/novels/${novelId}/chapters`);

export const getChapter = (novelId: string, chapterId: string) =>
  request<ChapterDetail>(`/novels/${novelId}/chapters/${chapterId}`);

export const updateChapter = (novelId: string, chapterId: string, data: { title?: string; content?: string }) =>
  request(`/novels/${novelId}/chapters/${chapterId}`, { method: 'PUT', body: JSON.stringify(data) });

export const reorderChapters = (novelId: string, orders: { id: string; chapter_number: number }[]) =>
  request(`/novels/${novelId}/chapters/reorder`, { method: 'PUT', body: JSON.stringify({ orders }) });

export const mergeChapters = (novelId: string, chapterIds: string[]) =>
  request(`/novels/${novelId}/chapters/merge`, { method: 'POST', body: JSON.stringify({ chapterIds }) });

export const splitChapter = (novelId: string, chapterId: string, splitIndex: number) =>
  request(`/novels/${novelId}/chapters/${chapterId}/split`, { method: 'POST', body: JSON.stringify({ splitIndex }) });

// Reading Progress
export const getProgress = (novelId: string) =>
  request<{ chapter_id: string; scroll_position: number; paragraph_index: number } | null>(`/novels/${novelId}/progress`);

export const saveProgress = (novelId: string, data: { chapter_id: string; scroll_position?: number; paragraph_index?: number }) =>
  request(`/novels/${novelId}/progress`, { method: 'PUT', body: JSON.stringify(data) });

// Bookmarks
export const getBookmarks = (novelId: string) =>
  request<any[]>(`/novels/${novelId}/bookmarks`);

export const addBookmark = (novelId: string, data: { chapter_id: string; paragraph_index: number; note?: string }) =>
  request(`/novels/${novelId}/bookmarks`, { method: 'POST', body: JSON.stringify(data) });

export const deleteBookmark = (novelId: string, bookmarkId: string) =>
  request(`/novels/${novelId}/bookmarks/${bookmarkId}`, { method: 'DELETE' });

// Tags
export const getTags = (category?: string) => {
  const params = category ? `?category=${category}` : '';
  return request<any[]>(`/tags${params}`);
};

export const createTag = (data: { name: string; category: string; color: string }) =>
  request('/tags', { method: 'POST', body: JSON.stringify(data) });

export const deleteTag = (id: string) =>
  request(`/tags/${id}`, { method: 'DELETE' });

// AI
export const getAiConfigs = () => request<any[]>('/ai/configs');

export const saveAiConfig = (data: any) =>
  request('/ai/configs', { method: 'POST', body: JSON.stringify(data) });

export const deleteAiConfig = (id: string) =>
  request(`/ai/configs/${id}`, { method: 'DELETE' });

// Image generation configs (separate from text AI)
export const getImageConfigs = () => request<any[]>('/ai/image-configs');

export const saveImageConfig = (data: any) =>
  request('/ai/image-configs', { method: 'POST', body: JSON.stringify(data) });

export const deleteImageConfig = (id: string) =>
  request(`/ai/image-configs/${id}`, { method: 'DELETE' });

export const testImageConnection = (id: string) =>
  request<{ success: boolean; message: string }>(`/ai/image-configs/${id}/test`, { method: 'POST' });

export const getImageModels = () =>
  request<any[]>('/ai/image-models');

export const testAiConnection = (id: string) =>
  request<{ success: boolean; message: string }>(`/ai/configs/${id}/test`, { method: 'POST' });

export const analyzeNovel = (novel_id: string, config_id?: string) =>
  request<{ taskId: string; status: string }>('/ai/analyze', { method: 'POST', body: JSON.stringify({ novel_id, config_id }) });

export const getAiTask = (taskId: string) =>
  request<{ status: string; progress: number; result: string; error: string }>(`/ai/tasks/${taskId}`);

// Fetch available models from AI provider
export const fetchModels = (base_url: string, api_key: string) =>
  request<{ success: boolean; models?: { id: string; owned_by: string }[]; message?: string }>(
    '/ai/fetch-models',
    { method: 'POST', body: JSON.stringify({ base_url, api_key }) }
  );

// DeepSeek one-click preset
export const createDeepSeekPreset = (api_key: string, model?: string) =>
  request<{ id: string; name: string; message: string }>('/ai/deepseek-preset', {
    method: 'POST',
    body: JSON.stringify({ api_key, model }),
  });

// Cover generation
export const generateCover = (novel_id: string, config_id?: string) =>
  request<{ cover_url: string; prompt: string }>('/ai/generate-cover', {
    method: 'POST',
    body: JSON.stringify({ novel_id, config_id }),
  });

// SSE Streaming cover generation
export function createCoverStream(
  novelId: string,
  configId?: string
): EventSource {
  const token = getToken();
  const params = new URLSearchParams({ novel_id: novelId });
  if (configId) params.set('config_id', configId);
  return new EventSource(`${API_BASE}/ai/generate-cover-stream?${params.toString()}&token=${token}`);
}

// SSE Streaming analysis
export function createAnalyzeStream(
  novelId: string,
  configId?: string
): EventSource {
  const token = getToken();
  const params = new URLSearchParams({ novel_id: novelId });
  if (configId) params.set('config_id', configId);
  return new EventSource(`${API_BASE}/ai/analyze-stream?${params.toString()}&token=${token}`);
}

// Batch SSE streaming analysis via fetch (POST with SSE response)
export async function createBatchAnalyzeStream(
  novelIds: string[],
  configId?: string,
  onEvent?: (event: string, data: any) => void,
  onError?: (error: string) => void
): Promise<void> {
  const token = getToken();
  const response = await fetch(`${API_BASE}/ai/batch-analyze-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ novel_ids: novelIds, config_id: configId }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('浏览器不支持流式读取');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      try {
        const eventMatch = trimmed.match(/^event:\s*(\S+)/);
        // Parse the line after the event line, or parse as inline
        let eventType = 'message';
        let dataStr = '';

        if (eventMatch) {
          // Multi-line SSE format
          continue; // skip event line, data follows on next line
        }

        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            // Determine event type from data content
            if (parsed.phase) eventType = 'status';
            else if (parsed.token !== undefined) eventType = 'token';
            else if (parsed.tags) eventType = 'result';
            if (onEvent) onEvent(eventType, parsed);
          } catch {}
        }
      } catch {}
    }
  }
}

// Settings
export const getSettings = () => request<Record<string, any>>('/settings');

export const updateSettings = (settings: Record<string, any>) =>
  request('/settings', { method: 'PUT', body: JSON.stringify(settings) });

// Backup
export const getBackupUrl = () => {
  const token = getToken();
  return `${API_BASE}/backup?token=${token}`;
};
