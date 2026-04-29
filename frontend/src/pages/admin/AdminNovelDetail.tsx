import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Bot, ChevronUp, ChevronDown } from 'lucide-react';
import {
  getNovel, getChapters, updateNovel, updateNovelTags,
  updateNovelAiAnalysis, deleteNovel as delNovel, reorderChapters,
  getTags, analyzeNovel, mergeChapters,
  Novel, Chapter
} from '../../utils/api';

export default function AdminNovelDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'chapters' | 'tags' | 'ai'>('info');

  // Form state
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [summary, setSummary] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [aiTitle, setAiTitle] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getNovel(id),
      getChapters(id),
      getTags(),
    ]).then(([novelData, chaptersData, tagsData]) => {
      setNovel(novelData);
      setChapters(chaptersData);
      setAllTags(tagsData);
      setTitle(novelData.title);
      setAuthor(novelData.author);
      setSummary(novelData.summary);
      setIsCompleted(!!novelData.is_completed);
      setSelectedTags(novelData.tag_ids || []);
      setAiTitle(novelData.ai_title || '');
      setAiSummary(novelData.ai_summary || '');
      setAiTags(novelData.ai_tags || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateNovel(id, { title, author, summary, is_completed: isCompleted ? 1 : 0 });
      await updateNovelTags(id, selectedTags);
      alert('保存成功');
    } catch (e: any) {
      alert('保存失败: ' + e.message);
    }
    setSaving(false);
  };

  const handleSaveAi = async () => {
    if (!id) return;
    try {
      await updateNovelAiAnalysis(id, { ai_title: aiTitle, ai_summary: aiSummary, ai_tags: aiTags });
      alert('AI分析结果保存成功');
    } catch (e: any) {
      alert('保存失败: ' + e.message);
    }
  };

  const handleAnalyze = async () => {
    if (!id) return;
    setAnalyzing(true);
    try {
      const res = await analyzeNovel(id);
      alert('AI分析任务已提交，任务ID: ' + res.taskId);
    } catch (e: any) {
      alert('分析失败: ' + e.message);
    }
    setAnalyzing(false);
  };

  const handleReorder = async (chapters: Chapter[]) => {
    if (!id) return;
    try {
      const orders = chapters.map((ch, i) => ({ id: ch.id, chapter_number: i + 1 }));
      await reorderChapters(id, orders);
      setChapters(chapters);
    } catch (e: any) {
      alert('排序失败: ' + e.message);
    }
  };

  const moveChapter = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === chapters.length - 1)) return;
    const newChapters = [...chapters];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newChapters[index], newChapters[targetIndex]] = [newChapters[targetIndex], newChapters[index]];
    handleReorder(newChapters);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  const groupedTags: Record<string, any[]> = {};
  allTags.forEach(t => {
    const cat = t.category || '其他';
    if (!groupedTags[cat]) groupedTags[cat] = [];
    groupedTags[cat].push(t);
  });

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!novel) {
    return <div className="text-center py-20 text-gray-400">小说不存在</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => navigate('/admin/novels')} className="text-sm text-gray-500 hover:text-gray-700 mb-1">
            ← 返回小说列表
          </button>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{novel.title}</h2>
        </div>
        <div className="flex gap-2">
          <LinkTo to={`/reader/${id}`} className="btn-secondary text-sm">
            阅读
          </LinkTo>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? '保存中...' : '保存修改'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 mb-6">
        {[
          { key: 'info', label: '基本信息' },
          { key: 'chapters', label: `章节管理 (${chapters.length})` },
          { key: 'tags', label: '标签分类' },
          { key: 'ai', label: 'AI 分析' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'info' && (
        <div className="max-w-2xl space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">书名</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">作者</label>
            <input type="text" value={author} onChange={e => setAuthor(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">简介</label>
            <textarea rows={4} value={summary} onChange={e => setSummary(e.target.value)} className="input-field" />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">完结状态</label>
            <button
              onClick={() => setIsCompleted(!isCompleted)}
              className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${
                isCompleted
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600'
              }`}
            >
              {isCompleted ? '已完结' : '连载中'}
            </button>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <p>文件路径: {novel.source_file_path || '无'}</p>
            <p>创建时间: {new Date(novel.created_at).toLocaleString('zh-CN')}</p>
            <p>最后更新: {new Date(novel.updated_at).toLocaleString('zh-CN')}</p>
            <p>最后阅读: {novel.last_read_at ? new Date(novel.last_read_at).toLocaleString('zh-CN') : '未读过'}</p>
          </div>
        </div>
      )}

      {activeTab === 'chapters' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">拖拽排序、合并拆分章节</p>
          <div className="space-y-1 max-h-[600px] overflow-y-auto custom-scrollbar">
            {chapters.map((ch, i) => (
              <div key={ch.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800">
                <span className="text-xs text-gray-400 w-8 text-center">{ch.chapter_number}</span>
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{ch.title}</span>
                <span className="text-xs text-gray-400">{ch.word_count}字</span>
                {ch.is_extra ? <span className="text-xs text-orange-400">番外</span> : null}
                <div className="flex gap-1">
                  <button onClick={() => moveChapter(i, 'up')} className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-600" disabled={i === 0}><ChevronUp size={14} /></button>
                  <button onClick={() => moveChapter(i, 'down')} className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-600" disabled={i === chapters.length - 1}><ChevronDown size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'tags' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">为小说选择标签分类</p>
          {Object.entries(groupedTags).map(([cat, catTags]) => (
            <div key={cat} className="mb-4">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{cat}</h4>
              <div className="flex flex-wrap gap-2">
                {catTags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      selectedTags.includes(tag.id)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                    }`}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button onClick={handleSave} className="btn-primary mt-4">保存标签</button>
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="space-y-6 max-w-2xl">
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">AI 分析</h3>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="btn-primary text-sm"
            >
              {analyzing ? '分析中...' : <><Bot size={16} className="mr-1 inline" /> 开始 AI 分析</>}
            </button>
            <p className="text-xs text-gray-500 mt-2">AI 将自动识别书名、生成概要、推荐标签。请在 AI 配置中先设置 API。</p>
          </div>

          <div className="border-t pt-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">手动编辑 AI 结果</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">AI 识别的书名</label>
                <input type="text" value={aiTitle} onChange={e => setAiTitle(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">AI 生成的概要</label>
                <textarea rows={5} value={aiSummary} onChange={e => setAiSummary(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">AI 推荐标签（逗号分隔）</label>
                <input
                  type="text"
                  value={aiTags.join(', ')}
                  onChange={e => setAiTags(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  className="input-field"
                />
              </div>
              <button onClick={handleSaveAi} className="btn-primary text-sm">保存 AI 结果</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LinkTo({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(to)} className={className}>
      {children}
    </button>
  );
}
