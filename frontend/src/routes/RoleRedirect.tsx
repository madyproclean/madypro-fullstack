import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';

export const RoleRedirect: React.FC = () => {
  const { user, token } = useAuthContext();
  if (!user || !token) {
    return <Navigate to="/login" replace />;
  }
  const role = user.role?.toUpperCase();
  if (role === 'SUPERVISOR') {
    return <Navigate to="/supervision/dashboard" replace />;
  }
  return <Navigate to="/dashboard" replace />;
};
