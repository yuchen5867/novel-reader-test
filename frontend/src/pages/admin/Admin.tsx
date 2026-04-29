import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Download, Bot, Settings, Home, Moon, Sun, LogOut, X, Menu } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';

const navItems = [
  { path: '/admin/novels', label: '小说管理', icon: BookOpen },
  { path: '/admin/import', label: '导入小说', icon: Download },
  { path: '/admin/ai', label: 'AI 配置', icon: Bot },
  { path: '/admin/settings', label: '系统设置', icon: Settings },
];

export default function Admin() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const { mode, toggleMode } = useThemeStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-56 lg:w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <Link to="/" className="text-lg font-bold text-gray-800 dark:text-gray-100">
            <BookOpen size={22} className="mr-2 inline" /> 阅读器管理
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                location.pathname.startsWith(item.path)
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <span><item.icon size={18} /></span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
          <Link to="/" className="flex items-center gap-3 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <Home size={18} className="mr-2 inline" /> 回到前台
          </Link>
          <button onClick={toggleMode} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            {mode === 'light' ? <Moon size={18} className="mr-2 inline" /> : <Sun size={18} className="mr-2 inline" />} 切换主题
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg">
            <LogOut size={18} className="mr-2 inline" /> 退出登录
          </button>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 bg-white dark:bg-gray-900 h-full overflow-y-auto z-10">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <span className="font-bold text-gray-800 dark:text-gray-100"><BookOpen size={18} className="mr-1 inline" /> 管理</span>
              <button onClick={() => setSidebarOpen(false)} className="text-gray-400"><X size={18} /></button>
            </div>
            <nav className="p-3 space-y-1">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                    location.pathname.startsWith(item.path)
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
              <Link to="/" className="block px-3 py-2 text-sm text-gray-600 dark:text-gray-400"><Home size={16} className="mr-1 inline" /> 回到前台</Link>
              <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-sm text-red-600"><LogOut size={16} className="mr-1 inline" /> 退出登录</button>
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-600 dark:text-gray-300 text-lg">
            <Menu size={20} />
          </button>
          <h1 className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {navItems.find(i => location.pathname.startsWith(i.path))?.label || '管理'}
          </h1>
          <button onClick={toggleMode} className="text-gray-600 dark:text-gray-300">
            {mode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
