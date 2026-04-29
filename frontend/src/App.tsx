import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import AccessGate from './components/AccessGate';

const Bookshelf = lazy(() => import('./pages/bookshelf/Bookshelf'));
const NovelDetail = lazy(() => import('./pages/bookshelf/NovelDetail'));
const Reader = lazy(() => import('./pages/reader/Reader'));
const Admin = lazy(() => import('./pages/admin/Admin'));
const AdminNovels = lazy(() => import('./pages/admin/AdminNovels'));
const AdminNovelDetail = lazy(() => import('./pages/admin/AdminNovelDetail'));
const AdminImport = lazy(() => import('./pages/admin/AdminImport'));
const AdminAI = lazy(() => import('./pages/admin/AdminAI'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const Login = lazy(() => import('./pages/admin/Login'));

function PageLoader() {
  return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <div className="min-h-screen transition-theme">
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<AccessGate><Bookshelf /></AccessGate>} />
          <Route path="/novel/:novelId" element={<AccessGate><NovelDetail /></AccessGate>} />
          <Route path="/reader/:novelId" element={<AccessGate><Reader /></AccessGate>} />
          <Route path="/reader/:novelId/:chapterId" element={<AccessGate><Reader /></AccessGate>} />
          <Route path="/login" element={<Login />} />

          <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>}>
            <Route index element={<Navigate to="/admin/novels" replace />} />
            <Route path="novels" element={<AdminNovels />} />
            <Route path="novels/:id" element={<AdminNovelDetail />} />
            <Route path="import" element={<AdminImport />} />
            <Route path="ai" element={<AdminAI />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
        </Routes>
      </Suspense>
    </div>
  );
}
