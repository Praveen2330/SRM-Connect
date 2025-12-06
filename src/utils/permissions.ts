// src/utils/permissions.ts
import type { AdminRole } from "../types";

// Allow role to be missing / null while app is loading
type RoleInput = AdminRole | null | undefined;

export const permissions = {
  /** Anyone with any admin role can see the admin dashboard */
  canViewAdminDashboard(role: RoleInput): boolean {
    return role === "viewer" || role === "moderator" || role === "super_admin";
  },

  /** Moderators + Super Admins can manage users / reports / broadcasts */
  canManageUsers(role: RoleInput): boolean {
    return role === "moderator" || role === "super_admin";
  },

  canHandleReports(role: RoleInput): boolean {
    return role === "moderator" || role === "super_admin";
  },

  canSendBroadcasts(role: RoleInput): boolean {
    return role === "moderator" || role === "super_admin";
  },

  /** Only Super Admin can change platform-level settings */
  canManagePlatformSettings(role: RoleInput): boolean {
    return role === "super_admin";
  },

  /** Only Super Admin can add / remove / change other admins */
  canManageAdminAccess(role: RoleInput): boolean {
    return role === "super_admin";
  },
};