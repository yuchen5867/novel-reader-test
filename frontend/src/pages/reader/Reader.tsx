import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Bookmark, BookOpen, List, Menu, Settings, X
} from 'lucide-react';
import {
  getNovel, getChapters, getChapter, getProgress, saveProgress,
  getBookmarks, addBookmark, deleteBookmark,
  Novel, Chapter, ChapterDetail
} from '../../utils/api';
import { useThemeStore } from '../../stores/themeStore';
import ReaderSettings from './ReaderSettings';

export default function Reader() {
  const { novelId, chapterId } = useParams<{ novelId: string; chapterId?: string }>();
  const navigate = useNavigate();

  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapter, setChapter] = useState<ChapterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const {
    mode, toggleMode, bgTheme, fontSize, lineHeight, letterSpacing, marginWidth, fontFamily, pageMode
  } = useThemeStore();

  // Fetch novel and chapters
  useEffect(() => {
    if (!novelId) return;
    getNovel(novelId).then(setNovel).catch(console.error);
    getChapters(novelId).then(c => {
      setChapters(c);
      // If no chapterId specified, try to restore reading progress
      if (!chapterId) {
        getProgress(novelId).then(progress => {
          if (progress && progress.chapter_id) {
            navigate(`/reader/${novelId}/${progress.chapter_id}`, { replace: true });
          } else if (c.length > 0) {
            navigate(`/reader/${novelId}/${c[0].id}`, { replace: true });
          }
        }).catch(() => {
          if (c.length > 0) navigate(`/reader/${novelId}/${c[0].id}`, { replace: true });
        });
      }
    }).catch(console.error);
  }, [novelId]);

  // Fetch chapter content
  useEffect(() => {
    if (!novelId || !chapterId) return;
    setLoading(true);
    getChapter(novelId, chapterId).then(ch => {
      setChapter(ch);
      setLoading(false);
      // Save reading progress
      saveProgress(novelId, { chapter_id: chapterId, paragraph_index: 0 });
      // Restore scroll position
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop = 0;
        }
      }, 100);
    }).catch(e => {
      console.error(e);
      setLoading(false);
    });

    // Fetch bookmarks
    getBookmarks(novelId).then(setBookmarks).catch(console.error);
  }, [novelId, chapterId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 't': case 'T':
          toggleMode();
          break;
        case 'f': case 'F':
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen();
          }
          break;
        case 'ArrowLeft':
          if (chapter?.prev) {
            navigate(`/reader/${novelId}/${chapter.prev.id}`);
          }
          break;
        case 'ArrowRight':
          if (chapter?.next) {
            navigate(`/reader/${novelId}/${chapter.next.id}`);
          }
          break;
        case 'Escape':
          setShowSidebar(false);
          setShowSettings(false);
          setShowBookmarks(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chapter, novelId]);

  const bgStyle = useMemo(() => {
    if (mode === 'dark') {
      return bgTheme === 'dark-black' ? 'bg-black text-gray-300' : 'bg-[#1A1A1A] text-[#B0B0B0]';
    }
    switch (bgTheme) {
      case 'white': return 'bg-white text-gray-900';
      case 'green': return 'bg-[#E8F0E8] text-gray-800';
      default: return 'bg-[#F5F0E8] text-[#2C2C2C]';
    }
  }, [mode, bgTheme]);

  const fontFamilyClass = useMemo(() => {
    switch (fontFamily) {
      case 'song': return 'font-song';
      case 'wenkai': return 'font-wenkai';
      default: return 'font-sans';
    }
  }, [fontFamily]);

  const marginClass = useMemo(() => {
    switch (marginWidth) {
      case 'narrow': return 'px-4 md:px-8';
      case 'wide': return 'px-8 md:px-32';
      default: return 'px-4 md:px-16';
    }
  }, [marginWidth]);

  const letterSpacingClass = useMemo(() => {
    switch (letterSpacing) {
      case 'compact': return 'tracking-tight';
      case 'wide': return 'tracking-wide';
      default: return 'tracking-normal';
    }
  }, [letterSpacing]);

  const handleAddBookmark = async () => {
    if (!novelId || !chapterId) return;
    try {
      await addBookmark(novelId, { chapter_id: chapterId, paragraph_index: 0, note: '' });
      const updated = await getBookmarks(novelId);
      setBookmarks(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveBookmark = async (bookmarkId: string) => {
    if (!novelId) return;
    try {
      await deleteBookmark(novelId, bookmarkId);
      setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
    } catch (e) {
      console.error(e);
    }
  };

  // Find current chapter index for progress
  const currentChapterIndex = chapters.findIndex(c => c.id === chapterId);
  const progressPercent = chapters.length > 1
    ? Math.round((currentChapterIndex / (chapters.length - 1)) * 100)
    : chapters.length === 1 ? 100 : 0;

  if (!novelId) return null;

  return (
    <div className={`h-screen flex flex-col ${bgStyle} transition-theme`}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200/20 dark:border-gray-700/20 bg-inherit">
        <div className="flex items-center gap-3">
          <Link to={`/novel/${novelId}`} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            ← 返回
          </Link>
          <span className="text-sm font-medium truncate max-w-[200px] hidden sm:block">
            {novel?.ai_title || novel?.title}
          </span>
          {chapter && (
            <span className="text-xs text-gray-400 hidden sm:block">
              {chapter.title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBookmarks(!showBookmarks)}
            className={`p-2 rounded-lg text-sm ${bookmarks.some(b => b.chapter_id === chapterId) ? 'text-yellow-500' : 'text-gray-400 hover:text-gray-600'}`}
            title="书签"
          >
            <Bookmark size={18} />
          </button>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            title="目录"
          >
            <Menu size={18} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            title="设置"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Chapter Sidebar */}
        {showSidebar && (
          <div className="absolute md:relative z-30 left-0 top-0 bottom-0 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 shadow-lg overflow-y-auto custom-scrollbar">
            {novel?.cover_url && (
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <img src={novel.cover_url} alt={novel.title} className="w-full aspect-[3/4] object-cover rounded-lg shadow-sm" />
                <h3 className="font-medium text-gray-800 dark:text-gray-200 mt-3"><List size={16} className="mr-1 inline" /> 目录</h3>
                <p className="text-xs text-gray-400 mt-1">{chapters.length} 章</p>
              </div>
            )}
            {!novel?.cover_url && (
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-medium text-gray-800 dark:text-gray-200"><List size={16} className="mr-1 inline" /> 目录</h3>
                <p className="text-xs text-gray-400 mt-1">{chapters.length} 章</p>
              </div>
            )}
            <div className="p-2">
              {chapters.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => {
                    navigate(`/reader/${novelId}/${ch.id}`);
                    setShowSidebar(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm rounded-lg mb-0.5 transition-colors ${
                    ch.id === chapterId
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <span className="text-xs text-gray-400 mr-2">{ch.chapter_number}.</span>
                  {ch.title}
                  {ch.is_extra ? <span className="text-xs text-orange-400 ml-1">番外</span> : null}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Reading content */}
        <div
          ref={contentRef}
          className={`flex-1 overflow-y-auto custom-scrollbar ${marginClass} ${pageMode === 'swipe' ? 'snap-y snap-mandatory' : ''}`}
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: lineHeight,
          }}
        >
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : chapter ? (
            <div className={`max-w-3xl mx-auto py-8 md:py-12 ${fontFamilyClass} ${letterSpacingClass}`}>
              <h1 className="text-xl md:text-2xl font-bold text-center mb-8">{chapter.title}</h1>
              <div className="reader-content">
                {chapter.content.split('\n').map((para, i) => (
                  para.trim() ? (
                    <p key={i} className="mb-2" style={{ textIndent: '2em' }}>
                      {para.trim()}
                    </p>
                  ) : <div key={i} className="h-4" />
                ))}
              </div>

              {/* Chapter navigation */}
              <div className="flex justify-between items-center mt-12 pt-8 border-t border-gray-300/30 dark:border-gray-600/30">
                {chapter.prev ? (
                  <button
                    onClick={() => navigate(`/reader/${novelId}/${chapter.prev!.id}`)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    ← {chapter.prev.title}
                  </button>
                ) : <div />}
                {chapter.next ? (
                  <button
                    onClick={() => navigate(`/reader/${novelId}/${chapter.next!.id}`)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {chapter.next.title} →
                  </button>
                ) : <div />}
              </div>

            </div>
          ) : (
            <div className="flex justify-center items-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-4xl mb-4"><BookOpen size={40} className="mx-auto" /></p>
                <p>请从目录中选择章节</p>
              </div>
            </div>
          )}
        </div>

        {/* Bookmarks sidebar */}
        {showBookmarks && (
          <div className="absolute md:relative z-30 right-0 top-0 bottom-0 w-72 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-lg overflow-y-auto custom-scrollbar">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-medium text-gray-800 dark:text-gray-200"><Bookmark size={16} className="mr-1 inline" /> 书签</h3>
              <button onClick={handleAddBookmark} className="text-sm text-blue-600 dark:text-blue-400">
                + 添加书签
              </button>
            </div>
            <div className="p-2">
              {bookmarks.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">暂无书签</p>
              ) : (
                bookmarks.map(bm => (
                  <div key={bm.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 group">
                    <button
                      onClick={() => {
                        navigate(`/reader/${novelId}/${bm.chapter_id}`);
                        setShowBookmarks(false);
                      }}
                      className="flex-1 text-left"
                    >
                      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-1">{bm.chapter_title}</p>
                      <p className="text-xs text-gray-400">{new Date(bm.created_at).toLocaleDateString()}</p>
                    </button>
                    <button
                      onClick={() => handleRemoveBookmark(bm.id)}
                      className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Settings panel */}
        {showSettings && (
          <ReaderSettings onClose={() => setShowSettings(false)} />
        )}
      </div>

      {/* Bottom bar: progress + shortcuts */}
      <div className="bg-inherit border-t border-gray-200/20 dark:border-gray-700/20">
        {/* Progress bar */}
        <div className="px-4 py-1.5">
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mb-1">
            <span>阅读进度</span>
            <span>{progressPercent}%</span>
            <span className="ml-auto">{currentChapterIndex + 1} / {chapters.length} 章</span>
          </div>
          <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        {/* Keyboard hints (desktop only) */}
        <div className="hidden md:flex items-center justify-center gap-4 py-1 text-xs text-gray-400 dark:text-gray-600 border-t border-gray-200/20 dark:border-gray-700/20">
          <span>← → 翻页</span>
          <span>T 切换主题</span>
          <span>F 全屏</span>
          <span>Esc 关闭面板</span>
        </div>
      </div>
    </div>
  );
}
