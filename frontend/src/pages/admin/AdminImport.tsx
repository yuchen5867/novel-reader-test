import { useState, useRef } from 'react';
import { Download } from 'lucide-react';
import { importNovel, batchImportNovels } from '../../utils/api';

interface ImportTask {
  id: string;
  filename: string;
  status: 'waiting' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  novelId?: string;
  result?: any;
}

export default function AdminImport() {
  const [tasks, setTasks] = useState<ImportTask[]>([]);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSingleImport = async (file: File) => {
    setImporting(true);
    setResult(null);
    try {
      const res = await importNovel(file);
      setResult(res);
      setTasks([{
        id: res.id,
        filename: file.name,
        status: 'completed',
        progress: 100,
        novelId: res.id,
        result: res,
      }]);
    } catch (e: any) {
      setTasks([{
        id: 'error',
        filename: file.name,
        status: 'failed',
        progress: 0,
        error: e.message,
      }]);
    }
    setImporting(false);
  };

  const handleBatchImport = async (files: File[]) => {
    setImporting(true);
    setResult(null);
    try {
      const res = await batchImportNovels(files);
      setTasks(res.tasks);
    } catch (e: any) {
      alert('批量导入失败: ' + e.message);
    }
    setImporting(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (files.length === 1 && files[0].name.endsWith('.txt')) {
      handleSingleImport(files[0]);
    } else {
      handleBatchImport(files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.name.endsWith('.txt') || f.name.endsWith('.zip')
    );
    if (files.length === 0) return;
    if (files.length === 1 && files[0].name.endsWith('.txt')) {
      handleSingleImport(files[0]);
    } else {
      handleBatchImport(files);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6">导入小说</h2>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 md:p-12 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.zip"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="text-4xl mb-4"><Download size={40} className="mx-auto" /></div>
        <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">
          拖拽文件到此处，或点击选择
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          支持 .txt 文件（UTF-8/GBK/GB2312）和 .zip 压缩包
        </p>
        <p className="text-xs text-gray-400 mt-2">
          单次批量导入最多 50 个文件
        </p>
      </div>

      {/* Import result */}
      {result && (
        <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <h3 className="font-medium text-green-700 dark:text-green-300 mb-2">导入成功</h3>
          <div className="text-sm text-green-600 dark:text-green-400 space-y-1">
            <p>书名: {result.title}</p>
            <p>章节数: {result.totalChapters}</p>
            <p>总字数: {result.totalWords?.toLocaleString()}</p>
          </div>
          {result.chapterList && (
            <div className="mt-3">
              <p className="text-xs text-green-500 mb-1">章节预览:</p>
              <div className="max-h-40 overflow-y-auto text-xs text-green-600 space-y-0.5">
                {result.chapterList.slice(0, 10).map((ch: any, i: number) => (
                  <div key={i}>{ch.chapterNumber}. {ch.title} ({ch.type})</div>
                ))}
                {result.chapterList.length > 10 && (
                  <p>... 共 {result.chapterList.length} 章</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Batch task list */}
      {tasks.length > 0 && !result && (
        <div className="mt-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="font-medium text-gray-800 dark:text-gray-200">导入队列 ({tasks.length})</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto">
            {tasks.map(task => (
              <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm flex-1 truncate">{task.filename}</span>
                {task.status === 'waiting' && (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">等待中</span>
                )}
                {task.status === 'processing' && (
                  <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded">处理中</span>
                )}
                {task.status === 'completed' && (
                  <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 rounded">完成</span>
                )}
                {task.status === 'failed' && (
                  <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 rounded" title={task.error}>
                    失败: {task.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">导入说明</h3>
        <ul className="text-sm text-blue-600 dark:text-blue-400 space-y-1 list-disc list-inside">
          <li>系统自动识别中文编码（UTF-8、GBK、GB2312）</li>
          <li>自动识别章节标题（支持"第X章"、"Chapter X"等多种格式）</li>
          <li>智能合并过短章节（少于100字）</li>
          <li>自动标记楔子、前言、番外等特殊章节</li>
          <li>ZIP 压缩包会自动解压并识别内部的所有 .txt 文件</li>
          <li>导入后可在小说管理页面编辑章节和标签</li>
        </ul>
      </div>
    </div>
  );
}
