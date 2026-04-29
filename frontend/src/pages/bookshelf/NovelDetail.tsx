import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { BookOpen, ArrowLeft, Sparkles, ChevronDown, ChevronUp, Image, X } from 'lucide-react';
import { getNovel, getChapters, Novel, Chapter } from '../../utils/api';
import { useThemeStore } from '../../stores/themeStore';

interface ChapterSummary {
  summary: string;
  cached: boolean;
  created_at?: string;
}

interface ChapterImage {
  id: string;
  image_path: string;
  prompt: string;
  model: string;
  created_at: string;
}

export default function NovelDetail() {
  const { novelId } = useParams<{ novelId: string }>();
  const navigate = useNavigate();
  const { mode } = useThemeStore();

  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  // Summary state: keyed by chapterId
  const [summaries, setSummaries] = useState<Record<string, ChapterSummary>>({});
  const [summarizing, setSummarizing] = useState<Record<string, boolean>>({});
  const [streamingText, setStreamingText] = useState<Record<string, string>>({});

  // Chapter images
  const [chapterImages, setChapterImages] = useState<Record<string, ChapterImage[]>>({});
  const [generatingImage, setGeneratingImage] = useState<Record<string, boolean>>({});
  const [progressStatus, setProgressStatus] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<ChapterImage | null>(null);
  const [showImagePrompt, setShowImagePrompt] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!novelId) return;
    setLoading(true);
    Promise.all([
      getNovel(novelId),
      getChapters(novelId),
    ]).then(([novelData, chaptersData]) => {
      setNovel(novelData);
      setChapters(chaptersData);
      setLoading(false);
      // Fetch existing summaries
      fetchExistingSummaries(chaptersData);
    }).catch(() => setLoading(false));
  }, [novelId]);

  const fetchExistingSummaries = async (chaptersList: Chapter[]) => {
    for (const ch of chaptersList) {
      try {
        const res = await fetch(`/api/novels/${novelId}/chapters/${ch.id}/summary`);
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setSummaries(prev => ({ ...prev, [ch.id]: data }));
          }
        }
      } catch { /* ignore */ }
    }
  };

  // SSE stream reader — parses server-sent events from fetch body
  async function readSSEStream(
    response: Response,
    onEvent: (event: string, data: any) => void,
  ) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('浏览器不支持流式读取');
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let currentData = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          if (currentEvent && currentData) {
            try { onEvent(currentEvent, JSON.parse(currentData)); } catch {}
          }
          currentEvent = ''; currentData = '';
          continue;
        }
        if (trimmed.startsWith('event: ')) currentEvent = trimmed.slice(7);
        else if (trimmed.startsWith('data: ')) currentData = trimmed.slice(6);
      }
    }
    if (currentEvent && currentData) {
      try { onEvent(currentEvent, JSON.parse(currentData)); } catch {}
    }
  }

  const handleSummarize = async (chapterId: string) => {
    if (summarizing[chapterId]) return;
    setSummarizing(prev => ({ ...prev, [chapterId]: true }));
    setStreamingText(prev => ({ ...prev, [chapterId]: '' }));
    setProgressStatus(prev => ({ ...prev, [chapterId]: '正在连接...' }));

    try {
      const token = localStorage.getItem('access_token') || '';
      const response = await fetch(
        `/api/novels/${novelId}/chapters/${chapterId}/summarize?access_token=${token}`
      );
      if (!response.ok) {
        throw new Error(`请求失败 (${response.status})`);
      }

      await readSSEStream(response, (event, data) => {
        switch (event) {
          case 'status':
            setProgressStatus(prev => ({ ...prev, [chapterId]: data.message }));
            break;
          case 'token':
            setProgressStatus(prev => ({ ...prev, [chapterId]: 'AI 正在生成...' }));
            setStreamingText(prev => ({ ...prev, [chapterId]: (prev[chapterId] || '') + data.token }));
            break;
          case 'done':
            setSummaries(prev => ({ ...prev, [chapterId]: { summary: data.summary, cached: !!data.cached } }));
            setExpandedSummaries(prev => ({ ...prev, [chapterId]: true }));
            setStreamingText(prev => ({ ...prev, [chapterId]: '' }));
            setSummarizing(prev => ({ ...prev, [chapterId]: false }));
            setProgressStatus(prev => ({ ...prev, [chapterId]: '' }));
            break;
          case 'error':
            setProgressStatus(prev => ({ ...prev, [chapterId]: `失败: ${data.message || '未知错误'}` }));
            setSummarizing(prev => ({ ...prev, [chapterId]: false }));
            break;
        }
      });
    } catch (e: any) {
      setProgressStatus(prev => ({ ...prev, [chapterId]: `连接失败: ${e.message}` }));
      setSummarizing(prev => ({ ...prev, [chapterId]: false }));
    }
  };

  // Fetch chapter images
  const fetchChapterImages = async (chapterId: string) => {
    try {
      const res = await fetch(`/api/novels/${novelId}/chapters/${chapterId}/images`);
      if (res.ok) {
        const data = await res.json();
        setChapterImages(prev => ({ ...prev, [chapterId]: data }));
      }
    } catch { /* ignore */ }
  };

  // Generate chapter image
  const handleGenerateImage = async (chapterId: string) => {
    if (generatingImage[chapterId]) return;
    setGeneratingImage(prev => ({ ...prev, [chapterId]: true }));
    setProgressStatus(prev => ({ ...prev, [chapterId]: '正在连接...' }));

    try {
      const token = localStorage.getItem('access_token') || '';
      const response = await fetch(
        `/api/novels/${novelId}/chapters/${chapterId}/generate-image?access_token=${token}`
      );
      if (!response.ok) {
        throw new Error(`请求失败 (${response.status})`);
      }

      await readSSEStream(response, (event, data) => {
        switch (event) {
          case 'status':
            setProgressStatus(prev => ({ ...prev, [chapterId]: data.message }));
            break;
          case 'done':
            setChapterImages(prev => ({
              ...prev,
              [chapterId]: [...(prev[chapterId] || []), {
                id: data.id, image_path: data.image_url,
                prompt: data.prompt, model: '', created_at: new Date().toISOString(),
              }],
            }));
            setGeneratingImage(prev => ({ ...prev, [chapterId]: false }));
            setProgressStatus(prev => ({ ...prev, [chapterId]: '' }));
            break;
          case 'error':
            setProgressStatus(prev => ({ ...prev, [chapterId]: `失败: ${data.message || '未知错误'}` }));
            setGeneratingImage(prev => ({ ...prev, [chapterId]: false }));
            break;
        }
      });
    } catch (e: any) {
      setProgressStatus(prev => ({ ...prev, [chapterId]: `连接失败: ${e.message}` }));
      setGeneratingImage(prev => ({ ...prev, [chapterId]: false }));
    }
  };

  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({});

  const toggleSummary = (chapterId: string) => {
    setExpandedSummaries(prev => ({ ...prev, [chapterId]: !prev[chapterId] }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!novel) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500">小说不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-theme">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200 truncate">
            {novel.ai_title || novel.title}
          </h1>
          <button
            onClick={() => navigate(`/reader/${novelId}`)}
            className="ml-auto btn-primary text-sm"
          >
            开始阅读
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Cover + Info */}
        <div className="flex flex-col sm:flex-row gap-6 mb-8">
          {/* Cover */}
          <div className={`w-36 h-48 sm:w-44 sm:h-60 flex-shrink-0 mx-auto sm:mx-0 rounded-lg overflow-hidden shadow-lg bg-gradient-to-br from-blue-100 to-purple-100 dark:from-gray-800 dark:to-gray-700 ${novel.cover_url ? 'cursor-pointer' : ''}`}>
            {novel.cover_url ? (
              <img src={novel.cover_url} alt={novel.title} className="w-full h-full object-cover" onClick={() => setLightbox({ id: 'cover', image_path: novel.cover_url, prompt: novel.ai_title || novel.title, model: '', created_at: '' })} />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <BookOpen size={40} className="text-gray-400" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {novel.ai_title || novel.title}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              {novel.author} · {novel.total_chapters} 章 · {Math.round(novel.total_words / 10000 * 10) / 10} 万字
              {novel.is_completed ? ' · 已完结' : ' · 连载中'}
            </p>

            {/* Tags */}
            {novel.tag_names && novel.tag_names.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {novel.tag_names.map((tag: string) => (
                  <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Summary/Description */}
            <div className="mt-3">
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {novel.ai_summary || novel.summary || '暂无简介'}
              </p>
            </div>
          </div>
        </div>

        {/* Chapter list */}
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
          目录 ({chapters.length} 章)
        </h3>

        <div className="space-y-1">
          {chapters.map((ch) => (
            <div
              key={ch.id}
              className="rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-xs text-gray-400 w-8 text-right flex-shrink-0">
                  {ch.chapter_number}
                </span>
                <button
                  onClick={() => navigate(`/reader/${novelId}/${ch.id}`)}
                  className="flex-1 text-left text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                >
                  {ch.title}
                  {ch.is_extra ? (
                    <span className="text-xs text-orange-400 ml-1.5">番外</span>
                  ) : null}
                </button>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {ch.word_count > 0 ? `${Math.round(ch.word_count / 1000 * 10) / 10}k字` : ''}
                </span>

                {/* Summarize button */}
                <button
                  onClick={() => {
                    if (summaries[ch.id]) {
                      // Toggle visibility of summary section
                      setExpandedSummaries(prev => {
                        const newState = { ...prev };
                        if (newState[ch.id]) {
                          delete newState[ch.id];
                        } else {
                          newState[ch.id] = true;
                        }
                        return newState;
                      });
                    } else {
                      handleSummarize(ch.id);
                    }
                  }}
                  disabled={summarizing[ch.id]}
                  className={`flex-shrink-0 px-2 py-1 text-xs rounded transition-colors ${
                    expandedSummaries[ch.id] || summarizing[ch.id]
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100'
                      : summaries[ch.id]
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-blue-50'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600'
                  } disabled:opacity-50`}
                  title={summaries[ch.id] ? (expandedSummaries[ch.id] ? '隐藏摘要' : '查看摘要') : 'AI 总结本章'}
                >
                  <Sparkles size={12} className={summarizing[ch.id] ? 'animate-pulse' : ''} />
                </button>

                {/* Image generation button */}
                <button
                  onClick={() => {
                    if (!chapterImages[ch.id] || chapterImages[ch.id].length === 0) {
                      handleGenerateImage(ch.id);
                    }
                    fetchChapterImages(ch.id);
                  }}
                  disabled={generatingImage[ch.id]}
                  className={`flex-shrink-0 px-2 py-1 text-xs rounded transition-colors ${
                    chapterImages[ch.id]?.length
                      ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-600'
                  } disabled:opacity-50`}
                  title={chapterImages[ch.id]?.length ? `查看插图 (${chapterImages[ch.id].length}张)` : 'AI 生成插图'}
                >
                  <Image size={12} className={generatingImage[ch.id] ? 'animate-pulse' : ''} />
                  {chapterImages[ch.id]?.length ? (
                    <span className="ml-0.5 text-[10px]">{chapterImages[ch.id].length}</span>
                  ) : null}
                </button>
              </div>

              {/* Progress status — stays visible even after completion for errors */}
              {progressStatus[ch.id] && (
                <div className="px-4 pl-16 pb-1">
                  <span className={`text-[10px] ${
                    progressStatus[ch.id].startsWith('失败') || progressStatus[ch.id].startsWith('连接失败')
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-blue-500 dark:text-blue-400'
                  } ${summarizing[ch.id] || generatingImage[ch.id] ? 'animate-pulse' : ''}`}>
                    {(summarizing[ch.id] || progressStatus[ch.id].startsWith('AI') || progressStatus[ch.id].startsWith('正在')) ? '✨ ' : '🖼 '}
                    {progressStatus[ch.id]}
                  </span>
                </div>
              )}

              {/* Summary display — controlled by expandedSummaries flag */}
              {(summarizing[ch.id] || expandedSummaries[ch.id]) && (
                <div className="px-4 pb-3 pl-16">
                  {summarizing[ch.id] && streamingText[ch.id] ? (
                    <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 leading-relaxed">
                      {streamingText[ch.id]}
                      <span className="animate-pulse text-blue-500">▊</span>
                    </div>
                  ) : summaries[ch.id] && (
                    <div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg p-3 leading-relaxed">
                        <span className="text-blue-500 mr-1">AI 摘要:</span>
                        {summaries[ch.id].summary}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Chapter images display */}
              {chapterImages[ch.id] && chapterImages[ch.id].length > 0 && (
                <div className="px-4 pb-3 pl-16">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {chapterImages[ch.id].map((img) => (
                      <div
                        key={img.id}
                        className="flex-shrink-0 w-24 h-36 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 relative group cursor-pointer"
                        onClick={() => setLightbox(img)}
                      >
                        <img
                          src={img.image_path}
                          alt={img.prompt?.substring(0, 50)}
                          className="w-full h-full object-cover pointer-events-none"
                          loading="lazy"
                        />
                        {/* Hover hint */}
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <span className="text-white text-xs">点击放大</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] text-gray-400">
                      共 {chapterImages[ch.id].length} 张 · 点击放大 · 最多 3 张
                    </p>
                    <button
                      onClick={() => setShowImagePrompt(prev => ({ ...prev, [ch.id]: !prev[ch.id] }))}
                      className="text-[10px] text-blue-500 hover:text-blue-400"
                    >
                      {showImagePrompt[ch.id] ? '隐藏提示词' : '显示提示词'}
                    </button>
                  </div>
                  {showImagePrompt[ch.id] && chapterImages[ch.id].length > 0 && (
                    <div className="mt-2 p-2 rounded bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 max-h-32 overflow-y-auto custom-scrollbar">
                      {chapterImages[ch.id].map((img, i) => (
                        img.prompt ? (
                          <div key={img.id} className={`text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed font-mono ${i > 0 ? 'mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-700' : ''}`}>
                            <span className="text-blue-400 mr-1">图{i + 1}:</span>
                            {img.prompt}
                          </div>
                        ) : null
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox for image preview */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={24} />
          </button>
          <img
            src={lightbox.image_path}
            alt={lightbox.prompt?.substring(0, 100)}
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {lightbox.prompt && (
            <div className="absolute bottom-4 left-4 right-4 max-w-2xl mx-auto bg-black/60 backdrop-blur rounded-lg p-3">
              <p className="text-xs text-gray-300 leading-relaxed line-clamp-3">{lightbox.prompt}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
