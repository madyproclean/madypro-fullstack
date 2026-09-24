import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthRoutes } from './routes/AuthRoutes';
import { AdminRoutes } from './routes/AdminRoutes';
import { SupervisionRoutes } from './routes/SupervisionRoutes';
import { RoleRedirect } from './routes/RoleRedirect';
import './styles/index.scss';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleRedirect />} />
        {AuthRoutes()}
        {AdminRoutes()}
        {SupervisionRoutes()}
      </Routes>
    </BrowserRouter>
  );
};

export default App;
