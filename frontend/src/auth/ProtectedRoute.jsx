// ProtectedRoute — wraps routes that require auth.
// Optionally restricts to specific roles.
// Note: this is UX, not security. The backend enforces RBAC on every endpoint.

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  if (!user) {
    // Send them to login, remember where they wanted to go.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role && user.role !== role) {
    // Logged in but wrong role — bounce to home.
    return <Navigate to="/" replace />;
  }

  return children;
}
