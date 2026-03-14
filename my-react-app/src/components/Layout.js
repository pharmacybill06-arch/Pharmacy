import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, ScanLine, FileText, Package, Truck,
  Receipt, Warehouse, User, LogOut, Menu, X, Pill, Clock, Mail
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/scan', icon: ScanLine, label: 'Scan Bill' },
  { to: '/email-bills', icon: Mail, label: 'Email Bills' },
  { to: '/bills', icon: FileText, label: 'Purchase Bills' },
  { to: '/drafts', icon: Clock, label: 'Drafts' },
  { to: '/products', icon: Package, label: 'Products' },
  { to: '/distributors', icon: Truck, label: 'Distributors' },
  { to: '/invoices', icon: Receipt, label: 'Sales Invoices' },
  { to: '/inventory', icon: Warehouse, label: 'Inventory' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 45 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1><Pill size={22} /> PharmaBill</h1>
          <p>{user?.shopName || 'Pharmacy Management'}</p>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <NavLink
            to="/profile"
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            <User size={18} />
            {user?.name || 'Profile'}
          </NavLink>
          <button className="sidebar-nav-item" onClick={handleLogout}>
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="page-header">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div />
        </div>
        <div className="page-body">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
