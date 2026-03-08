import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import ThemeSwitcher from '../ThemeSwitcher';
import {
  LayoutDashboard, Users, FileText, ClipboardCheck, Activity,
  LogOut, Menu, X, ExternalLink, ShieldAlert
} from 'lucide-react';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'User Management', icon: Users },
  { to: '/admin/policies', label: 'Policy Management', icon: FileText },
  { to: '/admin/claims', label: 'Claim Verification', icon: ClipboardCheck },
  { to: '/admin/activity-logs', label: 'Activity Logs', icon: Activity },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/'); };

  const SidebarContent = () => (
    <>
      <div className="p-5 border-b border-base-300">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-secondary-content" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-base-content">Admin Panel</h1>
            <p className="text-xs text-base-content/50">PBI AgriInsure</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-secondary text-secondary-content' : 'text-base-content/70 hover:bg-base-300'
              }`
            }
            onClick={() => setSidebarOpen(false)}
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {item.label}
          </NavLink>
        ))}
        <div className="pt-4 mt-4 border-t border-base-300">
          <NavLink to="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-base-content/50 hover:bg-base-300">
            <ExternalLink className="w-5 h-5" /> Farmer View
          </NavLink>
        </div>
      </nav>

      <div className="p-4 border-t border-base-300">
        <div className="flex items-center gap-3 mb-3">
          <div className="avatar placeholder">
            <div className="bg-secondary text-secondary-content w-9 rounded-full">
              <span className="text-sm">{user?.phoneNumber?.slice(-2) || 'A'}</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-base-content truncate">Admin</p>
            <p className="text-xs text-base-content/50">+91 {user?.phoneNumber || 'N/A'}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="btn btn-ghost btn-sm btn-block text-error gap-2 justify-start">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-base-200">
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-base-100 border-r border-base-300 fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed inset-y-0 left-0 w-72 bg-base-100 shadow-xl flex flex-col z-50">
            <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 btn btn-ghost btn-sm btn-circle">
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}
      <div className="flex-1 lg:ml-64">
        <header className="lg:hidden navbar bg-base-100 border-b border-base-300 sticky top-0 z-20 px-4">
          <div className="flex-none">
            <button onClick={() => setSidebarOpen(true)} className="btn btn-ghost btn-sm btn-circle">
              <Menu className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 text-center">
            <span className="text-lg font-bold text-base-content">Admin Panel</span>
          </div>
          <div className="flex-none gap-1">
            <ThemeSwitcher compact />
            <div className="avatar placeholder">
              <div className="bg-secondary text-secondary-content w-8 rounded-full">
                <span className="text-xs">A</span>
              </div>
            </div>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
