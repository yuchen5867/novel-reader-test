import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, LayoutGrid, List, Moon, Sun, Settings, ChevronRight } from 'lucide-react';
import { getNovels, Novel, getTags } from '../../utils/api';
import { useThemeStore } from '../../stores/themeStore';

export default function Bookshelf() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedTag, setSelectedTag] = useState('');
  const navigate = useNavigate();
  const { mode, toggleMode } = useThemeStore();

  const fetchNovels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNovels({ page, limit: 24, search, tag: selectedTag, sort: 'updated_at' });
      setNovels(res.data);
      setTotalPages(res.pagination.totalPages);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [page, search, selectedTag]);

  useEffect(() => {
    fetchNovels();
  }, [fetchNovels]);

  useEffect(() => {
    getTags().then(setTags).catch(console.error);
  }, []);

  // Group tags by category
  const groupedTags: Record<string, any[]> = {};
  tags.forEach(t => {
    const cat = t.category || '其他';
    if (!groupedTags[cat]) groupedTags[cat] = [];
    groupedTags[cat].push(t);
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchNovels();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-theme">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100"><BookOpen size={22} className="mr-1 inline" /> 小说阅读器</h1>
            <nav className="hidden md:flex items-center gap-4 text-sm">
              <Link to="/" className="text-blue-600 dark:text-blue-400 font-medium">书架</Link>
              <Link to="/admin" className="text-gray-600 dark:text-gray-400 hover:text-blue-600">后台管理</Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <form onSubmit={handleSearch} className="hidden sm:block">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索书名、作者..."
                className="w-48 md:w-64 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </form>
            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
              title={viewMode === 'grid' ? '切换列表视图' : '切换网格视图'}
            >
              {viewMode === 'grid' ? <List size={20} /> : <LayoutGrid size={20} />}
            </button>
            <button
              onClick={toggleMode}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
              title={mode === 'light' ? '切换夜间模式' : '切换白天模式'}
            >
              {mode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Search */}
      <div className="sm:hidden px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <form onSubmit={handleSearch}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索书名、作者..."
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
          />
        </form>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Tag filters */}
        {Object.keys(groupedTags).length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setSelectedTag(''); setPage(1); }}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  !selectedTag
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300'
                }`}
              >
                全部
              </button>
              {Object.entries(groupedTags).slice(0, 4).map(([cat, catTags]) => (
                <span key={cat} className="flex flex-wrap gap-1.5">
                  <span className="text-xs text-gray-400 dark:text-gray-500 px-1 py-1">|</span>
                  {catTags.slice(0, 6).map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => { setSelectedTag(selectedTag === tag.name ? '' : tag.name); setPage(1); }}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        selectedTag === tag.name
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {tag.name}
                    </button>
                  ))}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Novel Grid/List */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : novels.length === 0 ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400">
            <div className="text-6xl mb-4"><BookOpen size={60} className="mx-auto" /></div>
            <p className="text-lg">书架空空如也</p>
            <p className="text-sm mt-2">前往后台管理导入小说</p>
            <Link to="/admin/import" className="btn-primary inline-block mt-4">去导入</Link>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {novels.map(novel => (
              <div
                key={novel.id}
                onClick={() => navigate(`/novel/${novel.id}`)}
                className="cursor-pointer group"
              >
                {/* Cover */}
                <div className="aspect-[3/4] rounded-lg overflow-hidden bg-gradient-to-br from-blue-100 to-purple-100 dark:from-gray-800 dark:to-gray-700 mb-2 relative shadow-sm group-hover:shadow-md transition-shadow">
                  {novel.cover_url ? (
                    <img src={novel.cover_url} alt={novel.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="flex items-center justify-center"><BookOpen size={36} /></span>
                    </div>
                  )}
                  {novel.total_chapters > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <span className="text-white text-xs">{novel.total_chapters} 章 · {Math.round(novel.total_words / 10000 * 10) / 10} 万字</span>
                    </div>
                  )}
                  {/* Reading progress bar */}
                  {novel.last_read_at && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500/60" />
                  )}
                </div>
                {/* Info */}
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {novel.ai_title || novel.title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                  {novel.author}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {novels.map(novel => (
              <div
                key={novel.id}
                onClick={() => navigate(`/novel/${novel.id}`)}
                className="flex items-center gap-4 p-3 rounded-lg bg-white dark:bg-gray-900 shadow-sm hover:shadow-md cursor-pointer transition-all"
              >
                <div className="w-12 h-16 rounded bg-gradient-to-br from-blue-100 to-purple-100 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {novel.cover_url ? (
                    <img src={novel.cover_url} alt={novel.title} className="w-full h-full object-cover" />
                  ) : (
                    <BookOpen size={20} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-1">
                    {novel.ai_title || novel.title}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {novel.author} · {novel.total_chapters}章 · {novel.tag_names?.join(', ')}
                  </p>
                  {novel.ai_summary && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-2">{novel.ai_summary}</p>
                  )}
                </div>
                <span className="text-gray-400"><ChevronRight size={20} /></span>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-8">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              上一页
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* Mobile bottom nav */}
      <nav className="mobile-nav md:hidden">
        <Link to="/" className="flex flex-col items-center text-blue-600 dark:text-blue-400">
          <BookOpen size={20} />
          <span className="text-xs mt-0.5">书架</span>
        </Link>
        <Link to="/admin" className="flex flex-col items-center text-gray-500 dark:text-gray-400">
          <Settings size={20} />
          <span className="text-xs mt-0.5">管理</span>
        </Link>
      </nav>
    </div>
  );
}
