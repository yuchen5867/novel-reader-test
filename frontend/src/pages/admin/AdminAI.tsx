import { useEffect, useState } from 'react';
import {
  Brain, Settings, Key, Rocket, Check, X, BadgeCheck, BookOpen,
  BarChart3, Bot, Link2, Circle, Image
} from 'lucide-react';
import {
  getAiConfigs, saveAiConfig, deleteAiConfig, testAiConnection,
  createDeepSeekPreset, fetchModels,
  getImageConfigs, saveImageConfig, deleteImageConfig, testImageConnection,
  getImageModels,
  getNovels, Novel,
} from '../../utils/api';

interface AIConfig {
  id: string; name: string; base_url: string; api_key: string;
  model: string; temperature: number; max_tokens: number; is_default: number;
}

interface ImageConfig {
  id: string; name: string; api_key: string; model: string; size: string; is_default: number;
}

interface ImageModel {
  id: string; name: string; desc: string; sizes: string[];
}

type TabId = 'analysis' | 'cover' | 'text-config' | 'image-config';

export default function AdminAI() {
  const [activeTab, setActiveTab] = useState<TabId>('analysis');
  const [configs, setConfigs] = useState<AIConfig[]>([]);
  const [imageConfigs, setImageConfigs] = useState<ImageConfig[]>([]);
  const [configsLoaded, setConfigsLoaded] = useState(false);

  const fetchAll = async () => {
    try {
      const [textData, imgData] = await Promise.all([
        getAiConfigs(), getImageConfigs(),
      ]);
      setConfigs(textData);
      setImageConfigs(imgData);
    } catch (e) { console.error(e); }
    setConfigsLoaded(true);
  };

  useEffect(() => { fetchAll(); }, []);

  const defaultConfig = configs.find(c => c.is_default) || configs[0];
  const defaultImageConfig = imageConfigs.find(c => c.is_default) || imageConfigs[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">AI 智能分析</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {defaultConfig
              ? `文字: ${defaultConfig.name} · ${defaultConfig.model}`
              : '请先配置文字 AI 服务'}
            {' | '}
            {defaultImageConfig
              ? `图片: ${defaultImageConfig.name} · ${defaultImageConfig.model}`
              : '图片服务未配置'}
          </p>
        </div>
      </div>

      <div className="flex border-b border-gray-200 dark:border-gray-800 mb-6">
        {([
          { key: 'analysis' as TabId, label: <><Brain size={16} className="mr-1 inline" /> 批量分析</> },
          { key: 'cover' as TabId, label: <><Image size={16} className="mr-1 inline" /> 封面生成</> },
          { key: 'text-config' as TabId, label: <><Bot size={16} className="mr-1 inline" /> 文字模型</> },
          { key: 'image-config' as TabId, label: <><Image size={16} className="mr-1 inline" /> 图片模型</> },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'analysis' && (
        <AnalysisPanel configs={configs} configsLoaded={configsLoaded} onConfigCreated={fetchAll} />
      )}
      {activeTab === 'cover' && (
        <CoverPanel imageConfigs={imageConfigs} configs={configs} configsLoaded={configsLoaded} />
      )}
      {activeTab === 'text-config' && (
        <TextConfigPanel configs={configs} configsLoaded={configsLoaded} onRefresh={fetchAll} />
      )}
      {activeTab === 'image-config' && (
        <ImageConfigPanel configs={imageConfigs} configsLoaded={configsLoaded} onRefresh={fetchAll} />
      )}
    </div>
  );
}

// ==================== Analysis Panel ====================

interface AnalysisTask {
  novelId: string; novelTitle: string;
  status: 'pending' | 'streaming' | 'parsing' | 'done' | 'error';
  streamText: string;
  result: { title: string; summary: string; tags: string[] } | null;
  error: string;
}

function AnalysisPanel({ configs, configsLoaded, onConfigCreated }: {
  configs: AIConfig[]; configsLoaded: boolean; onConfigCreated: () => void;
}) {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingNovels, setLoadingNovels] = useState(true);
  const [running, setRunning] = useState(false);
  const [tasks, setTasks] = useState<Map<string, AnalysisTask>>(new Map());
  const [showSetup, setShowSetup] = useState(false);
  const [setupStep, setSetupStep] = useState<'key' | 'models' | 'confirm'>('key');
  const [apiKey, setApiKey] = useState('');
  const [settingUp, setSettingUp] = useState(false);
  const [models, setModels] = useState<{ id: string; owned_by: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsError, setModelsError] = useState('');

  const defaultConfig = configs.find(c => c.is_default) || configs[0];
  const hasConfig = configs.length > 0;

  useEffect(() => {
    getNovels({ limit: 100 }).then(res => { setNovels(res.data); setLoadingNovels(false); })
      .catch(() => setLoadingNovels(false));
  }, []);

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleAll = () => {
    if (selected.size === novels.length) setSelected(new Set());
    else setSelected(new Set(novels.map(n => n.id)));
  };

  const openSetup = () => { setSetupStep('key'); setApiKey(''); setModels([]); setSelectedModel(''); setModelsError(''); setShowSetup(true); };

  const handleFetchModels = async () => {
    if (!apiKey.trim()) return;
    setFetchingModels(true); setModelsError('');
    try {
      const res = await fetchModels('https://api.deepseek.com/v1', apiKey.trim());
      if (res.success && res.models && res.models.length > 0) { setModels(res.models); setSelectedModel(res.models[0].id); setSetupStep('models'); }
      else setModelsError(res.message || '未找到可用模型');
    } catch (e: any) { setModelsError('获取模型列表失败: ' + e.message); }
    setFetchingModels(false);
  };

  const handleConfirmSetup = async () => {
    if (!apiKey.trim() || !selectedModel) return;
    setSettingUp(true);
    try { await createDeepSeekPreset(apiKey.trim(), selectedModel); setShowSetup(false); onConfigCreated(); }
    catch (e: any) { alert('配置失败: ' + e.message); }
    setSettingUp(false);
  };

  const handleStartBatch = async () => {
    if (selected.size === 0 || running || !defaultConfig) return;
    setRunning(true);
    const novelIds = Array.from(selected);
    const newTasks = new Map<string, AnalysisTask>();
    novelIds.forEach(id => {
      const novel = novels.find(n => n.id === id);
      newTasks.set(id, { novelId: id, novelTitle: novel?.title || id, status: 'pending', streamText: '', result: null, error: '' });
    });
    setTasks(newTasks);

    try {
      const token = localStorage.getItem('admin_token') || '';
      const response = await fetch('/api/ai/batch-analyze-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ novel_ids: novelIds, config_id: defaultConfig.id }),
      });
      if (!response.ok) { const err = await response.json().catch(() => ({ error: '请求失败' })); throw new Error(err.error); }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('浏览器不支持流式读取');
      const decoder = new TextDecoder();
      let buffer = '', currentEvent = '', currentData = '';
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) { if (currentEvent && currentData) processEvent(currentEvent, currentData, setTasks); currentEvent = ''; currentData = ''; continue; }
          if (trimmed.startsWith('event: ')) currentEvent = trimmed.slice(7);
          else if (trimmed.startsWith('data: ')) currentData = trimmed.slice(6);
        }
      }
      if (currentEvent && currentData) processEvent(currentEvent, currentData, setTasks);
    } catch (e: any) {
      setTasks(prev => { const next = new Map(prev); next.forEach(t => { if (t.status === 'pending') { t.status = 'error'; t.error = e.message; } }); return next; });
    }
    setRunning(false);
  };

  return (
    <div>
      {!hasConfig && !showSetup && (
        <div className="p-6 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 text-center mb-6">
          <p className="text-4xl mb-3"><Key size={40} className="mx-auto" /></p>
          <h3 className="font-medium text-amber-800 dark:text-amber-200 mb-2">尚未配置 AI 服务</h3>
          <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">使用 DeepSeek API 进行智能分析</p>
          <button onClick={openSetup} className="btn-primary text-sm"><Rocket size={16} className="mr-1 inline" /> 一键配置 DeepSeek</button>
        </div>
      )}

      {/* Setup modal (abbreviated - same as before) */}
      {showSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSetup(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg p-6 z-10">
            <div className="flex items-center gap-2 mb-6">
              {[{ key: 'key' as const, label: '输入 Key', num: 1 }, { key: 'models' as const, label: '选择模型', num: 2 }, { key: 'confirm' as const, label: '确认', num: 3 }].map((step, i) => (
                <div key={step.key} className="flex items-center gap-2 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${setupStep === step.key ? 'bg-blue-600 text-white' : (setupStep === 'models' && step.key === 'key') || (setupStep === 'confirm') ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
                    {(setupStep === 'models' && step.key === 'key') || (setupStep === 'confirm' && step.key !== 'confirm') ? <Check size={10} /> : step.num}
                  </div>
                  <span className={`text-xs ${setupStep === step.key ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>{step.label}</span>
                  {i < 2 && <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />}
                </div>
              ))}
            </div>
            {setupStep === 'key' && (<>
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-2"><Key size={20} className="mr-1 inline" /> 输入 DeepSeek API Key</h3>
              <p className="text-sm text-gray-500 mb-4"><a href="https://platform.deepseek.com/api_keys" target="_blank" className="text-blue-600 hover:underline">去 DeepSeek 开放平台获取 Key →</a></p>
              <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); setModelsError(''); }} onKeyDown={e => e.key === 'Enter' && handleFetchModels()} placeholder="sk-..." className="input-field mb-2" autoFocus />
              {modelsError && <p className="text-xs text-red-500 mb-2">{modelsError}</p>}
              <div className="flex gap-3"><button onClick={handleFetchModels} disabled={fetchingModels || !apiKey.trim()} className="btn-primary flex-1 text-sm">{fetchingModels ? '获取中...' : '获取模型列表 →'}</button><button onClick={() => setShowSetup(false)} className="btn-secondary text-sm">取消</button></div>
            </>)}
            {setupStep === 'models' && (<>
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-2"><Bot size={20} className="mr-1 inline" /> 选择模型</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar mb-4">
                {models.map(m => (<button key={m.id} onClick={() => setSelectedModel(m.id)} className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedModel === m.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-3"><div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedModel === m.id ? 'border-blue-500' : 'border-gray-300'}`}>{selectedModel === m.id && <div className="w-2 h-2 rounded-full bg-blue-500" />}</div>
                    <div><p className="text-sm font-medium text-gray-800 dark:text-gray-200">{m.id}</p>{m.owned_by && <p className="text-xs text-gray-400">{m.owned_by}</p>}</div></div></button>))}
              </div>
              <div className="flex gap-3"><button onClick={() => setSetupStep('key')} className="btn-secondary text-sm">← 返回</button><button onClick={() => setSetupStep('confirm')} disabled={!selectedModel} className="btn-primary flex-1 text-sm">下一步 →</button></div>
            </>)}
            {setupStep === 'confirm' && (<>
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4"><BadgeCheck size={20} className="mr-1 inline" /> 确认配置</h3>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">服务商</span><span className="text-gray-800 dark:text-gray-200 font-medium">DeepSeek</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Key</span><span className="text-gray-800 dark:text-gray-200 font-mono">{apiKey.slice(0, 8)}••••{apiKey.slice(-4)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">模型</span><span className="text-blue-600 font-medium font-mono">{selectedModel}</span></div>
              </div>
              <div className="flex gap-3"><button onClick={() => setSetupStep('models')} className="btn-secondary text-sm">← 返回</button><button onClick={handleConfirmSetup} disabled={settingUp} className="btn-primary flex-1 text-sm">{settingUp ? '配置中...' : <><BadgeCheck size={16} className="mr-1 inline" /> 确认使用此模型</>}</button></div>
            </>)}
          </div>
        </div>
      )}

      {/* Novel selection */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-800 dark:text-gray-200"><BookOpen size={16} className="mr-1 inline" /> 选择小说 ({selected.size}/{novels.length})</h3>
          <div className="flex gap-3">
            <button onClick={toggleAll} className="text-xs text-blue-600 hover:underline">{selected.size === novels.length ? '取消全选' : '全选'}</button>
            <button onClick={handleStartBatch} disabled={selected.size === 0 || running || !hasConfig} className="btn-primary text-sm">{running ? '分析中...' : `开始批量分析 (${selected.size}本)`}</button>
          </div>
        </div>
        {loadingNovels ? (<div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent" /></div>) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-64 overflow-y-auto custom-scrollbar p-1">
            {novels.map(novel => {
              const task = tasks.get(novel.id); const isSelected = selected.has(novel.id);
              return (<button key={novel.id} onClick={() => !running && toggleSelect(novel.id)} disabled={running} className={`text-left p-2.5 rounded-lg border text-sm transition-all ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'} ${running ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                <div className="flex items-start gap-2"><input type="checkbox" checked={isSelected} readOnly className="mt-0.5 rounded" />
                  <div className="min-w-0"><p className="text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-1">{novel.ai_title || novel.title}</p><p className="text-xs text-gray-400 mt-0.5">{novel.total_chapters}章</p>
                    {task && (<span className={`inline-block mt-1 px-1.5 py-0.5 text-xs rounded ${task.status === 'done' ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : task.status === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : task.status === 'streaming' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                      {task.status === 'done' ? <><Check size={10} /> 完成</> : task.status === 'error' ? <><X size={10} /> 失败</> : task.status === 'streaming' ? <><Circle size={10} fill="currentColor" /> 分析中</> : task.status === 'parsing' ? '解析中' : '等待'}</span>)}
                  </div></div></button>);
            })}
          </div>
        )}
      </div>

      {/* Results */}
      {tasks.size > 0 && (
        <div><h3 className="font-medium text-gray-800 dark:text-gray-200 mb-3"><BarChart3 size={16} className="mr-1 inline" /> 分析结果 ({Array.from(tasks.values()).filter(t => t.status === 'done').length}/{tasks.size})</h3>
          <div className="space-y-3">
            {Array.from(tasks.values()).map(task => (<div key={task.novelId} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b"><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{task.novelTitle}</span><span className={`text-xs px-2 py-0.5 rounded ${task.status === 'done' ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : task.status === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : task.status === 'streaming' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>{task.status === 'done' ? '完成' : task.status === 'error' ? '失败' : task.status === 'streaming' ? '接收中...' : '等待'}</span></div>
              <div className="p-4">
                {task.error ? <p className="text-sm text-red-600">{task.error}</p> : task.result ? (<div className="space-y-3"><div><span className="text-xs text-gray-400">标题</span><p className="text-sm font-medium text-gray-800 dark:text-gray-200">{task.result.title}</p></div><div><span className="text-xs text-gray-400">概要</span><p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{task.result.summary}</p></div>{task.result.tags.length > 0 && (<div><span className="text-xs text-gray-400">标签</span><div className="flex flex-wrap gap-1.5 mt-1">{task.result.tags.map((tag: string) => (<span key={tag} className="px-2 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">{tag}</span>))}</div></div>)}</div>) : task.streamText ? (<div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar font-mono text-xs">{task.streamText}{task.status === 'streaming' && <span className="animate-pulse text-blue-500">▊</span>}</div>) : null}
              </div></div>))}
          </div></div>
      )}
    </div>
  );
}

function processEvent(event: string, dataStr: string, setTasks: (updater: (prev: Map<string, AnalysisTask>) => Map<string, AnalysisTask>) => void) {
  let data: any; try { data = JSON.parse(dataStr); } catch { return; }
  const novelId = data.novel_id;
  switch (event) {
    case 'novel-start': setTasks(prev => { const next = new Map(prev); const t = next.get(novelId); if (t) { t.status = 'streaming'; t.streamText = ''; } return next; }); break;
    case 'novel-token': setTasks(prev => { const next = new Map(prev); const t = next.get(novelId); if (t) t.streamText += data.token || ''; return next; }); break;
    case 'novel-done': setTasks(prev => { const next = new Map(prev); const t = next.get(novelId); if (t) { t.status = 'done'; t.result = { title: data.title || t.novelTitle, summary: data.summary || '', tags: data.tags || [] }; } return next; }); break;
    case 'novel-error': setTasks(prev => { const next = new Map(prev); const t = next.get(novelId); if (t) { t.status = 'error'; t.error = data.message || '分析失败'; } return next; }); break;
  }
}

// ==================== Cover Panel (now uses image_configs) ====================

function CoverPanel({ imageConfigs, configs, configsLoaded }: {
  imageConfigs: ImageConfig[]; configs: AIConfig[]; configsLoaded: boolean;
}) {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [selectedNovelId, setSelectedNovelId] = useState('');
  const [selectedImageConfigId, setSelectedImageConfigId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [error, setError] = useState('');
  const [loadingNovels, setLoadingNovels] = useState(true);

  const selectedNovel = novels.find(n => n.id === selectedNovelId);
  const defaultTextConfig = configs.find(c => c.is_default) || configs[0];

  useEffect(() => { getNovels({ limit: 200 }).then(res => { setNovels(res.data); setLoadingNovels(false); }).catch(() => setLoadingNovels(false)); }, []);

  useEffect(() => {
    if (configsLoaded && !selectedImageConfigId && imageConfigs.length > 0) {
      setSelectedImageConfigId((imageConfigs.find(c => c.is_default) || imageConfigs[0]).id);
    }
  }, [configsLoaded, imageConfigs]);

  useEffect(() => { if (selectedNovel) { setCoverUrl(selectedNovel.cover_url || ''); setGeneratedPrompt(''); setError(''); } }, [selectedNovelId]);

  const handleGenerate = () => {
    if (!selectedNovelId || generating || !defaultTextConfig) return;
    setGenerating(true); setError(''); setStatusText('正在生成封面提示词...'); setGeneratedPrompt(''); setCoverUrl('');

    const token = localStorage.getItem('admin_token') || '';
    const params = new URLSearchParams({ novel_id: selectedNovelId, config_id: defaultTextConfig.id });
    const es = new EventSource(`/api/ai/generate-cover-stream?${params.toString()}&token=${token}`);

    es.addEventListener('status', (e: any) => { try { const d = JSON.parse(e.data); setStatusText(d.message || ''); if (d.phase === 'prompt-ready' && d.prompt) setGeneratedPrompt(d.prompt); } catch {} });
    es.addEventListener('done', (e: any) => { try { const d = JSON.parse(e.data); setCoverUrl(d.cover_url || ''); if (d.prompt) setGeneratedPrompt(d.prompt); setStatusText('封面生成完成'); } catch {} setGenerating(false); es.close(); });
    es.addEventListener('error', (e: any) => { let msg = '生成失败'; if (e.data) try { const d = JSON.parse(e.data); msg = d.message || msg; } catch {} setError(msg); setStatusText(''); setGenerating(false); es.close(); });
    es.onerror = () => {};
  };

  return (
    <div>
      {imageConfigs.length === 0 && configsLoaded && (
        <div className="p-6 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 text-center mb-6">
          <h3 className="font-medium text-amber-800 dark:text-amber-200 mb-2">尚未配置图片生成服务</h3>
          <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">请在"图片模型"中配置阿里云百炼 API Key 和模型</p>
        </div>
      )}
      {!defaultTextConfig && configsLoaded && (
        <div className="p-6 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 text-center mb-6">
          <h3 className="font-medium text-amber-800 dark:text-amber-200 mb-2">尚未配置文字 AI 服务</h3>
          <p className="text-sm text-amber-600 dark:text-amber-400">生成封面提示词需要文字 AI 模型</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border p-5 mb-4">
            <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4"><BookOpen size={16} className="mr-1 inline" /> 选择小说</h3>
            {loadingNovels ? (<div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent" /></div>) : (
              <select value={selectedNovelId} onChange={e => setSelectedNovelId(e.target.value)} className="input-field mb-3">
                <option value="">-- 请选择小说 --</option>
                {novels.map(n => (<option key={n.id} value={n.id}>{n.ai_title || n.title} ({n.total_chapters}章)</option>))}
              </select>
            )}
            {imageConfigs.length > 0 && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">图片模型</label>
                <select value={selectedImageConfigId} onChange={e => setSelectedImageConfigId(e.target.value)} className="input-field text-sm">
                  {imageConfigs.map(c => (<option key={c.id} value={c.id}>{c.name} · {c.model}</option>))}
                </select>
                <p className="text-xs text-gray-400 mt-1">当前: {imageConfigs.find(c => c.id === selectedImageConfigId)?.model || '未选择'}</p>
              </div>
            )}
          </div>
          {selectedNovel && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border p-5">
              <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-3"><Image size={16} className="mr-1 inline" /> 当前封面</h3>
              <div className="aspect-[3/4] w-full max-w-[240px] rounded-lg overflow-hidden bg-gradient-to-br from-blue-100 to-purple-100 dark:from-gray-800 dark:to-gray-700">
                {coverUrl ? (<img src={coverUrl} alt={selectedNovel.title} className="w-full h-full object-cover" />) : (<div className="w-full h-full flex items-center justify-center"><BookOpen size={48} className="text-gray-400" /></div>)}
              </div>
              <p className="text-xs text-gray-400 mt-2">{selectedNovel.ai_title || selectedNovel.title}</p>
            </div>
          )}
        </div>
        <div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border p-5 mb-4">
            <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4"><Rocket size={16} className="mr-1 inline" /> 生成封面</h3>
            <p className="text-sm text-gray-500 mb-4">使用 AI 根据小说信息自动生成封面图片</p>
            <button onClick={handleGenerate} disabled={!selectedNovelId || generating || imageConfigs.length === 0 || !defaultTextConfig} className="btn-primary w-full">{generating ? '生成中...' : <><Image size={16} className="mr-1 inline" /> 生成封面</>}</button>
            {generating && (<div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg"><div className="flex items-center gap-3"><div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" /><p className="text-sm text-blue-700 dark:text-blue-300">{statusText}</p></div></div>)}
            {error && (<div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg"><p className="text-sm text-red-600 dark:text-red-400">{error}</p></div>)}
          </div>
          {generatedPrompt && (<div className="bg-white dark:bg-gray-900 rounded-xl border p-5 mb-4"><h3 className="font-medium mb-2">提示词</h3><p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">{generatedPrompt}</p></div>)}
          {coverUrl && generatedPrompt && (<div className="bg-white dark:bg-gray-900 rounded-xl border p-5"><h3 className="font-medium mb-3"><BadgeCheck size={16} className="mr-1 inline text-green-500" /> 生成结果</h3><img src={coverUrl + '?t=' + Date.now()} alt="封面" className="w-full max-w-[300px] rounded-lg shadow-md" /><p className="text-xs text-gray-400 mt-2">封面已自动保存</p></div>)}
        </div>
      </div>
    </div>
  );
}

// ==================== Text Config Panel ====================

function TextConfigPanel({ configs, configsLoaded, onRefresh }: {
  configs: AIConfig[]; configsLoaded: boolean; onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AIConfig | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [showDeepSeek, setShowDeepSeek] = useState(false);
  const [dsStep, setDsStep] = useState<'key' | 'models' | 'confirm'>('key');
  const [dsApiKey, setDsApiKey] = useState('');
  const [dsModels, setDsModels] = useState<{ id: string; owned_by: string }[]>([]);
  const [dsSelectedModel, setDsSelectedModel] = useState('');
  const [dsFetchingModels, setDsFetchingModels] = useState(false);
  const [dsModelsError, setDsModelsError] = useState('');

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('deepseek-chat');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [isDefault, setIsDefault] = useState(false);

  const resetForm = () => { setName(''); setBaseUrl('https://api.deepseek.com/v1'); setApiKey(''); setModel('deepseek-chat'); setTemperature(0.7); setMaxTokens(4096); setIsDefault(false); setEditing(null); setShowForm(false); };

  const handleEdit = (config: AIConfig) => {
    setName(config.name); setBaseUrl(config.base_url); setApiKey(''); setModel(config.model);
    setTemperature(config.temperature); setMaxTokens(config.max_tokens); setIsDefault(!!config.is_default);
    setEditing(config); setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveAiConfig({ id: editing?.id, name: name || 'AI', base_url: baseUrl, api_key: apiKey || undefined, model, temperature, max_tokens: maxTokens, is_default: isDefault ? 1 : 0 });
      resetForm(); onRefresh();
    } catch (e: any) { alert('保存失败: ' + e.message); }
  };

  const handleDelete = async (id: string) => { if (!confirm('确定删除？')) return; try { await deleteAiConfig(id); onRefresh(); } catch (e: any) { alert('删除失败: ' + e.message); } };
  const handleTest = async (id: string) => { setTesting(id); setTestResult(null); try { const res = await testAiConnection(id); setTestResult({ id, ...res }); } catch (e: any) { setTestResult({ id, success: false, message: e.message }); } setTesting(null); };

  const openDsSetup = () => { setDsStep('key'); setDsApiKey(''); setDsModels([]); setDsSelectedModel(''); setDsModelsError(''); setShowDeepSeek(true); };
  const handleDsFetchModels = async () => {
    if (!dsApiKey.trim()) return; setDsFetchingModels(true); setDsModelsError('');
    try { const res = await fetchModels('https://api.deepseek.com/v1', dsApiKey.trim()); if (res.success && res.models) { setDsModels(res.models); setDsSelectedModel(res.models[0].id); setDsStep('models'); } else setDsModelsError(res.message || '未找到模型'); } catch (e: any) { setDsModelsError('获取失败: ' + e.message); }
    setDsFetchingModels(false);
  };
  const handleDsConfirm = async () => {
    if (!dsApiKey || !dsSelectedModel) return;
    try { await createDeepSeekPreset(dsApiKey.trim(), dsSelectedModel); setShowDeepSeek(false); onRefresh(); } catch (e: any) { alert('配置失败: ' + e.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">配置 OpenAI 兼容的文字 AI 服务商</p>
        <div className="flex gap-2">
          <button onClick={openDsSetup} className="px-3 py-2 text-sm font-medium bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 transition-all shadow-sm">🚀 一键配置 DeepSeek</button>
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary text-sm">+ 手动添加</button>
        </div>
      </div>

      {/* DeepSeek modal */}
      {showDeepSeek && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/50" onClick={() => setShowDeepSeek(false)} /><div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg p-6 z-10">{/* ... same steps ... */}
        <div className="flex items-center gap-2 mb-6">{[{ key: 'key' as const, label: 'Key', num: 1 }, { key: 'models' as const, label: '模型', num: 2 }, { key: 'confirm' as const, label: '确认', num: 3 }].map((step, i) => (<div key={step.key} className="flex items-center gap-2 flex-1"><div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${dsStep === step.key ? 'bg-blue-600 text-white' : (dsStep === 'models' && step.key === 'key') || (dsStep === 'confirm') ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>{(dsStep === 'models' && step.key === 'key') || (dsStep === 'confirm' && step.key !== 'confirm') ? <Check size={10} /> : step.num}</div><span className={`text-xs ${dsStep === step.key ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>{step.label}</span>{i < 2 && <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />}</div>))}</div>
        {dsStep === 'key' && (<><input type="password" value={dsApiKey} onChange={e => { setDsApiKey(e.target.value); setDsModelsError(''); }} onKeyDown={e => e.key === 'Enter' && handleDsFetchModels()} placeholder="sk-..." className="input-field mb-2" autoFocus /><p className="text-xs text-gray-400 mb-4"><a href="https://platform.deepseek.com/api_keys" target="_blank" className="text-blue-600 hover:underline">获取 Key →</a></p>{dsModelsError && <p className="text-xs text-red-500 mb-2">{dsModelsError}</p>}<div className="flex gap-3"><button onClick={handleDsFetchModels} disabled={dsFetchingModels || !dsApiKey.trim()} className="btn-primary flex-1 text-sm">{dsFetchingModels ? '获取中...' : '获取模型列表 →'}</button><button onClick={() => setShowDeepSeek(false)} className="btn-secondary text-sm">取消</button></div></>)}
        {dsStep === 'models' && (<><div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar mb-4">{dsModels.map(m => (<button key={m.id} onClick={() => setDsSelectedModel(m.id)} className={`w-full text-left p-3 rounded-lg border ${dsSelectedModel === m.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}><div className="flex items-center gap-3"><div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${dsSelectedModel === m.id ? 'border-blue-500' : 'border-gray-300'}`}>{dsSelectedModel === m.id && <div className="w-2 h-2 rounded-full bg-blue-500" />}</div><div><p className="text-sm font-medium">{m.id}</p>{m.owned_by && <p className="text-xs text-gray-400">{m.owned_by}</p>}</div></div></button>))}</div><div className="flex gap-3"><button onClick={() => setDsStep('key')} className="btn-secondary text-sm">← 返回</button><button onClick={() => setDsStep('confirm')} disabled={!dsSelectedModel} className="btn-primary flex-1 text-sm">下一步 →</button></div></>)}
        {dsStep === 'confirm' && (<><div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4 space-y-2 text-sm"><div className="flex justify-between"><span className="text-gray-500">服务商</span><span>DeepSeek</span></div><div className="flex justify-between"><span className="text-gray-500">Key</span><span className="font-mono">{dsApiKey.slice(0, 8)}••••</span></div><div className="flex justify-between"><span className="text-gray-500">模型</span><span className="text-blue-600 font-mono">{dsSelectedModel}</span></div></div><div className="flex gap-3"><button onClick={() => setDsStep('models')} className="btn-secondary text-sm">← 返回</button><button onClick={handleDsConfirm} className="btn-primary flex-1 text-sm"><BadgeCheck size={16} className="mr-1 inline" /> 确认</button></div></>)}
      </div></div>)}

      {/* Config list */}
      {!configsLoaded ? (<div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>)
       : configs.length === 0 ? (<div className="text-center py-12 text-gray-400"><p className="text-4xl mb-4"><Bot size={40} className="mx-auto" /></p><p>尚未配置文字 AI 服务</p></div>)
       : (<div className="grid gap-4 md:grid-cols-2">
          {configs.map(config => (<div key={config.id} className={`bg-white dark:bg-gray-900 rounded-xl shadow-sm border-2 p-5 ${config.is_default ? 'border-blue-300 dark:border-blue-700' : 'border-gray-200 dark:border-gray-800'}`}>
            <div className="flex items-start justify-between mb-3"><div><h3 className="font-medium text-gray-800 dark:text-gray-200">{config.name}{config.is_default ? <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 rounded">当前使用</span> : null}</h3><p className="text-xs text-gray-500 mt-0.5 font-mono">{config.base_url}</p></div><div className="flex gap-1"><button onClick={() => handleEdit(config)} className="text-xs text-gray-400 hover:text-blue-600 px-1">编辑</button><button onClick={() => handleDelete(config.id)} className="text-xs text-gray-400 hover:text-red-600 px-1">删除</button></div></div>
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1"><p>模型: <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">{config.model}</code></p><p>Temp: {config.temperature} · Max Tokens: {config.max_tokens}</p></div>
            <button onClick={() => handleTest(config.id)} disabled={testing === config.id} className="mt-3 text-sm text-blue-600 hover:underline">{testing === config.id ? '测试中...' : <><Link2 size={14} className="mr-1 inline" /> 测试连接</>}</button>
            {testResult?.id === config.id && (<div className={`mt-2 p-2 text-xs rounded ${testResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-600' : 'bg-red-50 dark:bg-red-900/20 text-red-600'}`}>{testResult.message}</div>)}
          </div>))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/50" onClick={resetForm} /><div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 z-10">
        <h3 className="text-lg font-medium mb-4">{editing ? '编辑文字模型' : '添加文字模型'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-xs text-gray-500 mb-1">名称</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="DeepSeek" required /></div>
          <div><label className="block text-xs text-gray-500 mb-1">API Base URL</label><input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className="input-field font-mono text-sm" required /></div>
          <div><label className="block text-xs text-gray-500 mb-1">API Key {editing && !apiKey ? '(留空不修改)' : ''}</label><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="input-field" required={!editing} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Model</label><input type="text" value={model} onChange={e => setModel(e.target.value)} className="input-field" required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-gray-500 mb-1">Temperature ({temperature})</label><input type="range" min="0" max="2" step="0.1" value={temperature} onChange={e => setTemperature(Number(e.target.value))} className="w-full accent-blue-600" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Max Tokens</label><input type="number" value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))} className="input-field" /></div>
          </div>
          <div className="flex items-center gap-2"><input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} id="td" /><label htmlFor="td" className="text-sm text-gray-700 dark:text-gray-300">设为默认</label></div>
          <div className="flex gap-3 pt-2"><button type="submit" className="btn-primary flex-1">保存</button><button type="button" onClick={resetForm} className="btn-secondary flex-1">取消</button></div>
        </form>
      </div></div>)}
    </div>
  );
}

// ==================== Image Config Panel ====================

function ImageConfigPanel({ configs, configsLoaded, onRefresh }: {
  configs: ImageConfig[]; configsLoaded: boolean; onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ImageConfig | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [imageModels, setImageModels] = useState<ImageModel[]>([]);

  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('wan2.7-image');
  const [size, setSize] = useState('2K');
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => { getImageModels().then(setImageModels).catch(() => {}); }, []);

  const availableSizes = imageModels.find(m => m.id === selectedModel)?.sizes || ['2K'];

  const resetForm = () => { setName(''); setApiKey(''); setSelectedModel('wan2.7-image'); setSize('2K'); setIsDefault(false); setEditing(null); setShowForm(false); };

  const handleEdit = (config: ImageConfig) => {
    setName(config.name); setApiKey(''); setSelectedModel(config.model); setSize(config.size); setIsDefault(!!config.is_default);
    setEditing(config); setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey && !editing) { alert('请输入 API Key'); return; }
    try {
      await saveImageConfig({ id: editing?.id, name: name || '图片配置', api_key: apiKey || undefined, model: selectedModel, size, is_default: isDefault ? 1 : 0 });
      resetForm(); onRefresh();
    } catch (e: any) { alert('保存失败: ' + e.message); }
  };

  const handleDelete = async (id: string) => { if (!confirm('确定删除？')) return; try { await deleteImageConfig(id); onRefresh(); } catch (e: any) { alert('删除失败: ' + e.message); } };
  const handleTest = async (id: string) => { setTesting(id); setTestResult(null); try { const res = await testImageConnection(id); setTestResult({ id, ...res }); } catch (e: any) { setTestResult({ id, success: false, message: e.message }); } setTesting(null); };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">配置阿里云百炼文生图 API（支持万相、千问、z-image-turbo）</p>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary text-sm"><Image size={16} className="mr-1 inline" /> + 添加图片配置</button>
      </div>

      {!configsLoaded ? (<div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>)
       : configs.length === 0 ? (<div className="text-center py-12 text-gray-400"><p className="text-4xl mb-4"><Image size={40} className="mx-auto" /></p><p>尚未配置图片生成服务</p><p className="text-sm mt-1">点击"添加图片配置"开始</p></div>)
       : (<div className="grid gap-4 md:grid-cols-2">
          {configs.map(config => (<div key={config.id} className={`bg-white dark:bg-gray-900 rounded-xl shadow-sm border-2 p-5 ${config.is_default ? 'border-purple-300 dark:border-purple-700' : 'border-gray-200 dark:border-gray-800'}`}>
            <div className="flex items-start justify-between mb-3"><div><h3 className="font-medium text-gray-800 dark:text-gray-200">{config.name}{config.is_default ? <span className="ml-2 px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-600 rounded">当前使用</span> : null}</h3><p className="text-xs text-gray-500 mt-0.5">{imageModels.find(m => m.id === config.model)?.name || config.model}</p></div><div className="flex gap-1"><button onClick={() => handleEdit(config)} className="text-xs text-gray-400 hover:text-blue-600 px-1">编辑</button><button onClick={() => handleDelete(config.id)} className="text-xs text-gray-400 hover:text-red-600 px-1">删除</button></div></div>
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <p>模型: <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">{config.model}</code></p>
              <p>尺寸: {config.size} · API Key: <code className="text-xs">{config.api_key}</code></p>
            </div>
            <button onClick={() => handleTest(config.id)} disabled={testing === config.id} className="mt-3 text-sm text-purple-600 hover:underline">{testing === config.id ? '测试中...' : <><Link2 size={14} className="mr-1 inline" /> 测试连接</>}</button>
            {testResult?.id === config.id && (<div className={`mt-2 p-2 text-xs rounded ${testResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-600' : 'bg-red-50 dark:bg-red-900/20 text-red-600'}`}>{testResult.message}</div>)}
          </div>))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/50" onClick={resetForm} /><div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 z-10 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-medium mb-4"><Image size={18} className="mr-1 inline" /> {editing ? '编辑图片配置' : '添加图片配置'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-xs text-gray-500 mb-1">名称</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="阿里云百炼" required /></div>
          <div><label className="block text-xs text-gray-500 mb-1">API Key（阿里云百炼）</label><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="input-field" placeholder="sk-..." required={!editing} /><p className="text-xs text-gray-400 mt-1">{editing ? '留空不修改' : '文字模型和图片模型的 Key 通用'}</p></div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">模型</label>
            <select value={selectedModel} onChange={e => { setSelectedModel(e.target.value); const m = imageModels.find(m => m.id === e.target.value); if (m) setSize(m.sizes[0]); }} className="input-field">
              <optgroup label="万相 (Wanxiang)">
                {imageModels.filter(m => m.id.startsWith('wan')).map(m => (<option key={m.id} value={m.id}>{m.name} — {m.desc}</option>))}
              </optgroup>
              <optgroup label="千问 (Qwen-Image)">
                {imageModels.filter(m => m.id.startsWith('qwen')).map(m => (<option key={m.id} value={m.id}>{m.name} — {m.desc}</option>))}
              </optgroup>
              <optgroup label="其他">
                {imageModels.filter(m => !m.id.startsWith('wan') && !m.id.startsWith('qwen')).map(m => (<option key={m.id} value={m.id}>{m.name} — {m.desc}</option>))}
              </optgroup>
            </select>
            <p className="text-xs text-gray-400 mt-1">{imageModels.find(m => m.id === selectedModel)?.desc}</p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">分辨率</label>
            <select value={size} onChange={e => setSize(e.target.value)} className="input-field">
              {availableSizes.map(s => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div className="flex items-center gap-2"><input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} id="idf" /><label htmlFor="idf" className="text-sm text-gray-700 dark:text-gray-300">设为默认</label></div>
          <div className="flex gap-3 pt-2"><button type="submit" className="btn-primary flex-1">保存</button><button type="button" onClick={resetForm} className="btn-secondary flex-1">取消</button></div>
        </form>
      </div></div>)}
    </div>
  );
}
