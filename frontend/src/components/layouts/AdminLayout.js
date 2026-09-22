import React from 'react';
import {
  LayoutDashboard, Users, FileText, ClipboardCheck, Activity, ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import PortalLayout from './PortalLayout';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'User Management', icon: Users },
  { to: '/admin/policies', label: 'Policy Management', icon: FileText },
  { to: '/admin/claims', label: 'Claim Verification', icon: ClipboardCheck },
  { to: '/admin/activity-logs', label: 'Activity Logs', icon: Activity },
];

const footerLinks = [{ to: '/dashboard', label: 'Farmer View', icon: ExternalLink }];

export default function AdminLayout() {
  const { user } = useAuth();

  return (
    <PortalLayout
      brandTitle="Admin Panel"
      brandSubtitle="PBI AgriInsure"
      navItems={navItems}
      footerLinks={footerLinks}
      identity={{
        name: user?.fullName || 'Administrator',
        detail: user?.phoneNumber ? `+91 ${user.phoneNumber}` : 'No number on file',
      }}
    />
  );
}
