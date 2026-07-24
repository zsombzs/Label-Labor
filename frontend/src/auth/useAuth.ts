import { useCallback, useSyncExternalStore } from "react";
import { api, clearToken, getToken, setToken } from "../api/client";
import type { LoginRequest, LoginResponse } from "../types/api";

// Egyszerű külső store, hogy a token-változás minden komponenst frissítsen.
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface AuthState {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<LoginResponse>;
  logout: () => void;
}

export function useAuth(): AuthState {
  const token = useSyncExternalStore(subscribe, getToken);

  const login = useCallback(async (username: string, password: string) => {
    const body: LoginRequest = { username, password };
    const data = await api.post<LoginResponse>("/api/login", body, false);
    setToken(data.token);
    notify();
    return data;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    notify();
  }, []);

  return { isAuthenticated: token !== null, login, logout };
}
