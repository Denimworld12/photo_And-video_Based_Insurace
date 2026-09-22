import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { LoadingState } from './components/ui/States';

// Public Pages
import Landing from './pages/Landing';
import Login from './pages/auth/Login';

// Layouts
import UserLayout from './components/layouts/UserLayout';
import AdminLayout from './components/layouts/AdminLayout';

// Farmer Pages
import UserDashboard from './pages/user/Dashboard';
import Policies from './pages/user/Policies';
import SubmitClaim from './pages/user/SubmitClaim';
import MediaCapture from './pages/user/MediaCapture';
import ClaimStatus from './pages/user/ClaimStatus';
import ClaimResults from './pages/user/ClaimResults';
import Notifications from './pages/user/Notifications';
import Profile from './pages/user/Profile';
import Settings from './pages/user/Settings';
import AppInstallGuide from './pages/user/AppInstallGuide';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import PolicyManagement from './pages/admin/PolicyManagement';
import ClaimVerification from './pages/admin/ClaimVerification';
import ActivityLogs from './pages/admin/ActivityLogs';

function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-parchment">
        <LoadingState label="Checking your session…" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  }

  return children;
}

function AppRoutes() {
  const { user, isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} replace />
          ) : (
            <Login />
          )
        }
      />

      {/* Farmer portal */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <UserLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<UserDashboard />} />
        <Route path="policies" element={<Policies />} />
        <Route path="submit-claim/:insuranceId" element={<SubmitClaim />} />
        <Route path="media-capture/:documentId" element={<MediaCapture />} />
        <Route path="claims" element={<ClaimStatus />} />
        <Route path="claim-results/:documentId" element={<ClaimResults />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="install-app" element={<AppInstallGuide />} />
      </Route>

      {/* Admin portal */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="policies" element={<PolicyManagement />} />
        <Route path="claims" element={<ClaimVerification />} />
        <Route path="activity-logs" element={<ActivityLogs />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ToastProvider>
  );
}
