import { useEffect, useState } from 'react';
import { Download, Lock } from 'lucide-react';
import { getSettings, updateSettings, getBackupUrl, changePassword } from '../../utils/api';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function AdminSettings() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  useEffect(() => {
    getSettings().then(data => {
      setSettings(data);
      setLoading(false);
    }).catch(e => {
      console.error(e);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings(settings);
      alert('设置保存成功');
    } catch (e: any) {
      alert('保存失败: ' + e.message);
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 3) {
      setPasswordMsg('密码至少3位');
      return;
    }
    try {
      await changePassword(newPassword);
      setPasswordMsg('密码修改成功，请重新登录');
      setNewPassword('');
      setTimeout(() => {
        logout();
        navigate('/login');
      }, 1500);
    } catch (e: any) {
      setPasswordMsg('修改失败: ' + e.message);
    }
  };

  const handleBackup = () => {
    const url = getBackupUrl();
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6">系统设置</h2>

      <div className="space-y-8">
        {/* Basic settings */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">基础设置</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">网站名称</label>
              <input
                type="text"
                value={settings.site_name || ''}
                onChange={e => setSettings({ ...settings, site_name: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">默认主题</label>
              <select
                value={settings.default_theme || 'light'}
                onChange={e => setSettings({ ...settings, default_theme: e.target.value })}
                className="input-field"
              >
                <option value="light">白天模式</option>
                <option value="dark">夜间模式</option>
                <option value="auto">自动切换</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">每页显示数量</label>
              <input
                type="number"
                value={settings.page_size || 20}
                onChange={e => setSettings({ ...settings, page_size: Number(e.target.value) })}
                className="input-field w-32"
              />
            </div>
          </div>
        </section>

        {/* Reading defaults */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">阅读默认设置</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">默认字号</label>
              <input
                type="number"
                value={settings.default_font_size || 16}
                onChange={e => setSettings({ ...settings, default_font_size: Number(e.target.value) })}
                className="input-field"
                min={12}
                max={24}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">默认行高</label>
              <input
                type="number"
                step="0.1"
                value={settings.default_line_height || 1.8}
                onChange={e => setSettings({ ...settings, default_line_height: Number(e.target.value) })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">默认字体</label>
              <select
                value={settings.default_font_family || 'system'}
                onChange={e => setSettings({ ...settings, default_font_family: e.target.value })}
                className="input-field"
              >
                <option value="system">系统默认</option>
                <option value="song">思源宋体</option>
                <option value="wenkai">霞鹜文楷</option>
              </select>
            </div>
          </div>
        </section>

        {/* Upload settings */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">上传设置</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">最大上传文件大小 (MB)</label>
              <input
                type="number"
                value={settings.max_upload_size_mb || 50}
                onChange={e => setSettings({ ...settings, max_upload_size_mb: Number(e.target.value) })}
                className="input-field w-32"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">允许的文件格式</label>
              <input
                type="text"
                value={(settings.allowed_formats || ['.txt']).join(', ')}
                onChange={e => setSettings({ ...settings, allowed_formats: e.target.value.split(',').map((s: string) => s.trim()) })}
                className="input-field"
              />
            </div>
          </div>
        </section>

        {/* AI settings */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">AI 设置</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.auto_ai_analysis || false}
                onChange={e => setSettings({ ...settings, auto_ai_analysis: e.target.checked })}
              />
              <label className="text-sm text-gray-600 dark:text-gray-400">导入后自动触发 AI 分析</label>
            </div>
          </div>
        </section>

        {/* Admin password */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">修改管理员密码</h3>
          <div className="flex gap-3">
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="新密码"
              className="input-field w-48"
            />
            <button onClick={handleChangePassword} className="btn-primary text-sm whitespace-nowrap">
              修改密码
            </button>
          </div>
          {passwordMsg && (
            <p className={`text-sm mt-2 ${passwordMsg.includes('成功') ? 'text-green-600' : 'text-red-600'}`}>
              {passwordMsg}
            </p>
          )}
        </section>

        {/* Frontend access password */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">
            <Lock size={16} className="mr-1 inline" /> 前台访问控制
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            设置前台访问密码，留空则不限制访问。设置后访客需输入密码才能查看书架和阅读内容。
          </p>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">访问密码</label>
            <input
              type="text"
              value={settings.access_password || ''}
              onChange={e => setSettings({ ...settings, access_password: e.target.value })}
              placeholder="留空则不限制访问"
              className="input-field w-48"
            />
          </div>
        </section>

        {/* Backup & Restore */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">备份与恢复</h3>
          <div className="flex gap-3">
            <button onClick={handleBackup} className="btn-secondary text-sm">
              <Download size={16} className="mr-1 inline" /> 导出备份
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            备份文件包含数据库和小说源文件。恢复功能暂不支持通过网页操作，请使用手动方式恢复。
          </p>
        </section>

        {/* Save button */}
        <div className="pt-4">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? '保存中...' : '保存所有设置'}
          </button>
        </div>
      </div>
    </div>
  );
}
