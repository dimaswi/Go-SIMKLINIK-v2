import { Navigate } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermission';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission: string | string[];
  fallback?: React.ReactNode;
}

export function ProtectedRoute({ children, permission, fallback }: ProtectedRouteProps) {
  const { hasAnyPermission, hasPermission } = usePermission();

  const allowed = Array.isArray(permission)
    ? hasAnyPermission(permission)
    : hasPermission(permission);

  if (!allowed) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
