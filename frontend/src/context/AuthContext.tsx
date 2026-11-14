import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  ApiError,
  api,
  clearAuthTokens,
  getAuthToken,
  getRefreshToken,
  setAuthTokens,
  setTokensRefreshedHandler,
  setUnauthorizedHandler,
} from '../services/api';
import { AuthSessionPayload, AuthUser, Permission, RoleDefinition } from '../types';
import { AppTab, canAccessTab, hasAnyPermission, hasPermission } from '../utils/rbac';
import { useToast } from '../components/Toast';

interface AuthContextValue {
  user: AuthUser | null;
  permissions: Permission[];
  roles: RoleDefinition[];
  isAuthenticated: boolean;
  isHydrating: boolean;
  hydrationError: string | null;
  login: (identifier: string, password: string) => Promise<AuthSessionPayload>;
  logout: (options?: { allDevices?: boolean; silent?: boolean }) => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshRoles: () => Promise<RoleDefinition[]>;
  retryHydration: () => Promise<void>;
  applyAuthSession: (session: AuthSessionPayload) => void;
  updateLocalUser: (updatedUser: AuthUser) => void;
  can: (permission: Permission) => boolean;
  canAny: (permissions: readonly Permission[]) => boolean;
  canAccess: (tab: AppTab) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showToast } = useToast();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [isHydrating, setIsHydrating] = useState<boolean>(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);

  const resetSessionState = useCallback(() => {
    clearAuthTokens();
    setUser(null);
    setPermissions([]);
    setRoles([]);
    setHydrationError(null);
  }, []);

  const refreshRoles = useCallback(async (): Promise<RoleDefinition[]> => {
    try {
      const data = await api.getRoles();
      setRoles(data || []);
      return data || [];
    } catch {
      return [];
    }
  }, []);

  const applyAuthSession = useCallback((session: AuthSessionPayload) => {
    setAuthTokens(session.access_token, session.refresh_token);
    setUser(session.user);
    setPermissions(session.permissions);
    setHydrationError(null);
  }, []);

  const hydrateSession = useCallback(async () => {
    const accessToken = getAuthToken();
    const refreshToken = getRefreshToken();

    if (!accessToken && !refreshToken) {
      resetSessionState();
      setIsHydrating(false);
      return;
    }

    setIsHydrating(true);
    setHydrationError(null);

    try {
      if (accessToken) {
        const me = await api.getMe();
        setUser(me.user);
        setPermissions(me.permissions);
        try {
          const rolesData = await api.getRoles();
          setRoles(rolesData || []);
        } catch {
          // ignore if user lacks permission to list roles
        }
      } else if (refreshToken) {
        const refreshed = await api.refresh(refreshToken);
        applyAuthSession(refreshed);
        try {
          const rolesData = await api.getRoles();
          setRoles(rolesData || []);
        } catch {
          // ignore
        }
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        resetSessionState();
      } else {
        const message =
          err instanceof Error
            ? err.message
            : 'Tidak dapat terhubung ke server untuk memverifikasi sesi.';
        setHydrationError(message);
      }
    } finally {
      setIsHydrating(false);
    }
  }, [applyAuthSession, resetSessionState]);

  useEffect(() => {
    setTokensRefreshedHandler((session) => {
      setUser(session.user);
      setPermissions(session.permissions);
    });

    setUnauthorizedHandler((message) => {
      setUser(null);
      setPermissions([]);
      setRoles([]);
      setHydrationError(null);
      showToast(message || 'Sesi Anda telah berakhir. Silakan login kembali.', 'error');
    });

    return () => {
      setTokensRefreshedHandler(null);
      setUnauthorizedHandler(null);
    };
  }, [showToast]);

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);

  const login = useCallback(
    async (identifier: string, password: string): Promise<AuthSessionPayload> => {
      const session = await api.login({ identifier, password });
      applyAuthSession(session);
      try {
        const rolesData = await api.getRoles();
        setRoles(rolesData || []);
      } catch {
        // ignore
      }
      return session;
    },
    [applyAuthSession]
  );

  const logout = useCallback(
    async (options?: { allDevices?: boolean; silent?: boolean }) => {
      try {
        if (getAuthToken()) {
          if (options?.allDevices) {
            await api.logoutAll();
          } else {
            await api.logout();
          }
        }
      } catch {
        // Best-effort revocation; always clear local session even if token already expired
      } finally {
        resetSessionState();
        if (!options?.silent) {
          showToast(
            options?.allDevices
              ? 'Berhasil keluar dari semua perangkat'
              : 'Anda telah keluar dari sistem',
            'info'
          );
        }
      }
    },
    [resetSessionState, showToast]
  );

  const refreshUser = useCallback(async () => {
    const me = await api.getMe();
    setUser(me.user);
    setPermissions(me.permissions);
    try {
      const rolesData = await api.getRoles();
      setRoles(rolesData || []);
    } catch {
      // ignore
    }
  }, []);

  const updateLocalUser = useCallback((updatedUser: AuthUser) => {
    setUser(updatedUser);
  }, []);

  const can = useCallback(
    (permission: Permission) => hasPermission(permissions, user?.role, permission),
    [permissions, user?.role]
  );

  const canAny = useCallback(
    (perms: readonly Permission[]) => hasAnyPermission(permissions, user?.role, perms),
    [permissions, user?.role]
  );

  const canAccess = useCallback(
    (tab: AppTab) => canAccessTab(permissions, user?.role, tab),
    [permissions, user?.role]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        roles,
        isAuthenticated: Boolean(user),
        isHydrating,
        hydrationError,
        login,
        logout,
        refreshUser,
        refreshRoles,
        retryHydration: hydrateSession,
        applyAuthSession,
        updateLocalUser,
        can,
        canAny,
        canAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
