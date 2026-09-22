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

// The admin portal previously had no quick navigation on a phone at all: every
// move went through the hamburger, while the farmer portal had a tab bar. An
// administrator triaging claims on the move gets the same four-destination bar.
const bottomNav = [
  { to: '/admin', label: 'Dashboard', short: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/claims', label: 'Claim Verification', short: 'Claims', icon: ClipboardCheck },
  { to: '/admin/users', label: 'User Management', short: 'Farmers', icon: Users },
  { to: '/admin/policies', label: 'Policy Management', short: 'Policies', icon: FileText },
];

export default function AdminLayout() {
  const { user } = useAuth();

  return (
    <PortalLayout
      brandTitle="Admin Panel"
      brandSubtitle="PBI AgriInsure"
      navItems={navItems}
      footerLinks={footerLinks}
      bottomNav={bottomNav}
      identity={{
        name: user?.fullName || 'Administrator',
        detail: user?.phoneNumber ? `+91 ${user.phoneNumber}` : 'No number on file',
      }}
    />
  );
}
