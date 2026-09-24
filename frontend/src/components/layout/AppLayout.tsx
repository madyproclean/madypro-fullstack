import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ToastContainer } from '../ui/ToastContainer';

export const AppLayout: React.FC = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className={`app-shell${isSidebarOpen ? ' app-shell--sidebar-open' : ''}`}>
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
      {isSidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}
      <div className="app-shell__content">
        <Topbar onMenuToggle={toggleSidebar} />
        <main className="app-shell__main" key={location.pathname}>
          <Outlet />
        </main>
        <ToastContainer />
      </div>
    </div>
  );
};
