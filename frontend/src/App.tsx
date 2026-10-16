import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthRoutes } from './routes/AuthRoutes';
import { AdminRoutes } from './routes/AdminRoutes';
import { SupervisionRoutes } from './routes/SupervisionRoutes';
import { RoleRedirect } from './routes/RoleRedirect';
import { ClientPortalPage } from './pages/portal/ClientPortalPage';
import './styles/index.scss';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleRedirect />} />
        <Route path="/portail/:token" element={<ClientPortalPage />} />
        {AuthRoutes()}
        {AdminRoutes()}
        {SupervisionRoutes()}
      </Routes>
    </BrowserRouter>
  );
};

export default App;
