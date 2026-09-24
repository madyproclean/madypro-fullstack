import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useAuthContext();

  useEffect(() => {
    const timers = toasts.map((toast) =>
      setTimeout(() => removeToast(toast.id), 3500)
    );
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [toasts, removeToast]);

  if (!toasts.length) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.type ?? 'success'}`}>
          {toast.message}
          <button type="button" onClick={() => removeToast(toast.id)} aria-label="Fermer">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
};
