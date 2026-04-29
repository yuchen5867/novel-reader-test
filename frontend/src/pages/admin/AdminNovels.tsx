import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getNovels, deleteNovel, batchDeleteNovels, Novel } from '../../utils/api';

export default function AdminNovels() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState('updated_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const fetchNovels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNovels({ page, limit: 20, search, sort: sortField, order: sortOrder });
      setNovels(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [page, search, sortField, sortOrder]);

  useEffect(() => {
    fetchNovels();
  }, [fetchNovels]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这本小说？此操作不可恢复。')) return;
    try {
      await deleteNovel(id);
      fetchNovels();
    } catch (e) {
      console.error(e);
    }
  };

  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除选中的 ${selected.size} 本小说？此操作不可恢复。`)) return;
    try {
      await batchDeleteNovels(Array.from(selected));
      setSelected(new Set());
      fetchNovels();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === novels.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(novels.map(n => n.id)));
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">小说管理</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">共 {total} 本小说</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜索..."
            className="w-48 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
          />
          <Link to="/admin/import" className="btn-primary text-sm whitespace-nowrap">
            + 导入小说
          </Link>
        </div>
      </div>

      {/* Batch actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <span className="text-sm text-blue-700 dark:text-blue-300">已选择 {selected.size} 本</span>
          <button onClick={handleBatchDelete} className="btn-danger text-xs py-1">批量删除</button>
          <button onClick={() => setSelected(new Set())} className="btn-secondary text-xs py-1">取消选择</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === novels.length && novels.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left cursor-pointer hover:text-blue-600" onClick={() => handleSort('title')}>
                  书名 {sortField === 'title' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="px-4 py-3 text-left cursor-pointer hover:text-blue-600 hidden md:table-cell" onClick={() => handleSort('author')}>
                  作者 {sortField === 'author' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="px-4 py-3 text-center hidden sm:table-cell">章节数</th>
                <th className="px-4 py-3 text-center hidden lg:table-cell">总字数</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">标签</th>
                <th className="px-4 py-3 text-left cursor-pointer hover:text-blue-600 hidden md:table-cell" onClick={() => handleSort('updated_at')}>
                  更新时间 {sortField === 'updated_at' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent mx-auto" />
                  </td>
                </tr>
              ) : novels.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    暂无小说，<Link to="/admin/import" className="text-blue-600 hover:underline">去导入</Link>
                  </td>
                </tr>
              ) : (
                novels.map(novel => (
                  <tr key={novel.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(novel.id)}
                        onChange={() => toggleSelect(novel.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/admin/novels/${novel.id}`} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                        {novel.ai_title || novel.title}
                      </Link>
                      {novel.last_read_at && (
                        <span className="text-xs text-green-500 ml-2">读过</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                      {novel.author}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400 hidden sm:table-cell">
                      {novel.total_chapters}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-500 hidden lg:table-cell">
                      {novel.total_words > 0 ? `${Math.round(novel.total_words / 10000 * 10) / 10}万` : '-'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {novel.tag_names?.slice(0, 3).map(t => (
                          <span key={t} className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-500 text-xs hidden md:table-cell">
                      {new Date(novel.updated_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/admin/novels/${novel.id}`}
                          className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                        >
                          编辑
                        </Link>
                        <Link
                          to={`/reader/${novel.id}`}
                          className="px-2 py-1 text-xs text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"
                        >
                          阅读
                        </Link>
                        <button
                          onClick={() => handleDelete(novel.id)}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
            <span className="text-xs text-gray-500">
              共 {total} 条，第 {page}/{totalPages} 页
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="btn-secondary text-xs py-1 disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="btn-secondary text-xs py-1 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
