import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ClaimProvider } from './contexts/ClaimContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Public Pages
import Landing from './pages/Landing';
import Login from './pages/auth/Login';

// Layouts
import UserLayout from './components/layouts/UserLayout';
import AdminLayout from './components/layouts/AdminLayout';

// User Pages
import UserDashboard from './pages/user/Dashboard';
import Policies from './pages/user/Policies';
import SubmitClaim from './pages/user/SubmitClaim';
import MediaCapture from './pages/user/MediaCapture';
import ClaimStatus from './pages/user/ClaimStatus';
import ClaimResults from './pages/user/ClaimResults';
import Notifications from './pages/user/Notifications';
import Profile from './pages/user/Profile';
import Settings from './pages/user/Settings';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import PolicyManagement from './pages/admin/PolicyManagement';
import ClaimVerification from './pages/admin/ClaimVerification';
import ActivityLogs from './pages/admin/ActivityLogs';

/* ─── Protected Route with Role Check ─── */
function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="text-base-content/60 text-lg mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  }

  return children;
}

/* ─── App Routes ─── */
function AppRoutes() {
  const { user, isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* ── Public Routes ── */}
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

      {/* ── Farmer Dashboard Routes ── */}
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
      </Route>

      {/* ── Admin Panel Routes ── */}
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

      {/* ── Catch-all → Landing ── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ClaimProvider>
          <Router>
            <AppRoutes />
          </Router>
        </ClaimProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
