import { X, Sun, Moon } from 'lucide-react';
import { useThemeStore } from '../../stores/themeStore';

interface ReaderSettingsProps {
  onClose: () => void;
}

export default function ReaderSettings({ onClose }: ReaderSettingsProps) {
  const {
    mode, setMode, toggleMode,
    bgTheme, setBgTheme,
    fontSize, setFontSize,
    lineHeight, setLineHeight,
    letterSpacing, setLetterSpacing,
    marginWidth, setMarginWidth,
    fontFamily, setFontFamily,
    pageMode, setPageMode,
  } = useThemeStore();

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="absolute md:relative z-30 right-0 top-0 bottom-0 w-72 md:w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-lg overflow-y-auto custom-scrollbar">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="font-medium text-gray-800 dark:text-gray-200">阅读设置</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg"><X size={18} /></button>
      </div>

      <div className="p-4 space-y-5">
        {/* Theme mode */}
        <section>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">主题模式</h4>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('light')}
              className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                mode === 'light'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              <Sun size={16} className="mr-1 inline" /> 白天
            </button>
            <button
              onClick={() => setMode('dark')}
              className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                mode === 'dark'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              <Moon size={16} className="mr-1 inline" /> 夜间
            </button>
          </div>
        </section>

        {/* Background theme */}
        <section>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
            {mode === 'light' ? '背景颜色' : '夜间背景'}
          </h4>
          <div className="flex gap-2 flex-wrap">
            {mode === 'light' ? (
              <>
                {[
                  { key: 'parchment', label: '羊皮纸', color: '#F5F0E8' },
                  { key: 'white', label: '纯白', color: '#FFFFFF' },
                  { key: 'green', label: '护眼', color: '#E8F0E8' },
                ].map(bg => (
                  <button
                    key={bg.key}
                    onClick={() => setBgTheme(bg.key as any)}
                    className={`w-16 h-10 rounded border-2 text-xs transition-colors ${
                      bgTheme === bg.key ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    style={{ backgroundColor: bg.color }}
                    title={bg.label}
                  />
                ))}
              </>
            ) : (
              <>
                {[
                  { key: 'dark-gray', label: '深灰', color: '#1A1A1A' },
                  { key: 'dark-black', label: '纯黑', color: '#000000' },
                ].map(bg => (
                  <button
                    key={bg.key}
                    onClick={() => setBgTheme(bg.key as any)}
                    className={`w-16 h-10 rounded border-2 text-xs text-gray-300 transition-colors ${
                      bgTheme === bg.key ? 'border-blue-500' : 'border-gray-600'
                    }`}
                    style={{ backgroundColor: bg.color }}
                    title={bg.label}
                  />
                ))}
              </>
            )}
          </div>
        </section>

        {/* Font size */}
        <section>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
            字体大小 ({fontSize}px)
          </h4>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">A</span>
            <input
              type="range"
              min="12"
              max="24"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-600"
            />
            <span className="text-lg text-gray-600 dark:text-gray-300">A</span>
          </div>
        </section>

        {/* Line height */}
        <section>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
            行高 ({lineHeight})
          </h4>
          <input
            type="range"
            min="1.5"
            max="2.5"
            step="0.1"
            value={lineHeight}
            onChange={(e) => setLineHeight(Number(e.target.value))}
            className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-600"
          />
        </section>

        {/* Letter spacing */}
        <section>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">字间距</h4>
          <div className="flex gap-2">
            {[
              { key: 'compact', label: '紧凑' },
              { key: 'normal', label: '标准' },
              { key: 'wide', label: '宽松' },
            ].map(sp => (
              <button
                key={sp.key}
                onClick={() => setLetterSpacing(sp.key)}
                className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                  letterSpacing === sp.key
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {sp.label}
              </button>
            ))}
          </div>
        </section>

        {/* Page margin */}
        <section>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">页边距</h4>
          <div className="flex gap-2">
            {[
              { key: 'narrow', label: '窄' },
              { key: 'medium', label: '中' },
              { key: 'wide', label: '宽' },
            ].map(mg => (
              <button
                key={mg.key}
                onClick={() => setMarginWidth(mg.key)}
                className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                  marginWidth === mg.key
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {mg.label}
              </button>
            ))}
          </div>
        </section>

        {/* Font family */}
        <section>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">字体</h4>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'system', label: '系统默认' },
              { key: 'song', label: '思源宋体' },
              { key: 'wenkai', label: '霞鹜文楷' },
            ].map(ff => (
              <button
                key={ff.key}
                onClick={() => setFontFamily(ff.key)}
                className={`py-1.5 px-3 text-xs rounded-lg border transition-colors ${
                  fontFamily === ff.key
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {ff.label}
              </button>
            ))}
          </div>
        </section>

        {/* Page mode - only scroll for mobile */}
        {!isMobile && (
          <section>
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">翻页模式</h4>
            <div className="flex gap-2">
              {[
                { key: 'scroll', label: '滚动' },
                { key: 'pagination', label: '分页' },
                { key: 'swipe', label: '左右翻页' },
              ].map(pm => (
                <button
                  key={pm.key}
                  onClick={() => setPageMode(pm.key as any)}
                  className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                    pageMode === pm.key
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {pm.label}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
