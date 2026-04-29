import { useEffect, useState } from 'react';
import { useAccessStore } from '../stores/accessStore';
import { Key } from 'lucide-react';

interface AccessGateProps {
  children: React.ReactNode;
}

export default function AccessGate({ children }: AccessGateProps) {
  const { isVerified, checking, needsPassword, error, verifyPassword, checkAccess } = useAccessStore();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    checkAccess();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setSubmitting(true);
    try {
      await verifyPassword(password.trim());
    } catch {
      // error is set in store
    }
    setSubmitting(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!isVerified && needsPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <Key size={40} className="mx-auto mb-3 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">请输入访问密码</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">此网站已设置访问密码</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-4">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入访问密码"
              className="input-field text-center text-lg"
              autoFocus
            />
            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting || !password.trim()}
              className="btn-primary w-full"
            >
              {submitting ? '验证中...' : '进入阅读'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
