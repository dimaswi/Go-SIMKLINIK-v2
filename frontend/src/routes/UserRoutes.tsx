import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute as PermissionGuard } from '@/components/protected-route';
import { lazy } from 'react';

// Lazy load components
const UsersIndex = lazy(() => import('@/pages/users/index'));
const UsersShow = lazy(() => import('@/pages/users/show'));
const UsersCreate = lazy(() => import('@/pages/users/create'));
const UsersEdit = lazy(() => import('@/pages/users/edit'));

export function UserRoutes() {
  return (
    <Routes>
      <Route path="/" element={<UsersIndex />} />
      <Route path="/create" element={
        <PermissionGuard permission="users.create">
          <UsersCreate />
        </PermissionGuard>
      } />
      <Route path="/:id" element={<UsersShow />} />
      <Route path="/:id/edit" element={
        <PermissionGuard permission="users.update">
          <UsersEdit />
        </PermissionGuard>
      } />
    </Routes>
  );
}