import React from 'react';
import {
  LayoutDashboard, FileText, ClipboardList, Bell, User, Settings, Download,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import PortalLayout from './PortalLayout';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/dashboard/policies', label: 'Insurance Policies', icon: FileText },
  { to: '/dashboard/claims', label: 'My Claims', icon: ClipboardList },
  { to: '/dashboard/notifications', label: 'Notifications', icon: Bell },
  { to: '/dashboard/profile', label: 'Profile', icon: User },
  { to: '/dashboard/settings', label: 'Settings', icon: Settings },
  { to: '/dashboard/install-app', label: 'Install App', icon: Download },
];

// The four destinations a farmer actually moves between while filing and
// tracking a claim, kept within thumb reach on a phone.
const bottomNav = [
  { to: '/dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true },
  { to: '/dashboard/policies', label: 'Policies', short: 'Policies', icon: FileText },
  { to: '/dashboard/claims', label: 'My Claims', short: 'Claims', icon: ClipboardList },
  { to: '/dashboard/notifications', label: 'Notifications', short: 'Alerts', icon: Bell },
];

export default function UserLayout() {
  const { user } = useAuth();

  return (
    <PortalLayout
      brandTitle="PBI AgriInsure"
      brandSubtitle="Farmer Portal"
      navItems={navItems}
      bottomNav={bottomNav}
      identity={{
        name: user?.fullName || 'Farmer',
        detail: user?.phoneNumber ? `+91 ${user.phoneNumber}` : 'No number on file',
      }}
    />
  );
}
