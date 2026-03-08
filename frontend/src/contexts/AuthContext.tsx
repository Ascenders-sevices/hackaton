import React, { createContext, useContext, useEffect, useState } from "react";
import {
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
  getCurrentUser,
  fetchUserAttributes,
  type AuthUser,
} from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { resetApiAuthCache } from "@/lib/api";

const LOCAL_DEV = import.meta.env.VITE_LOCAL_DEV === "true";
const LOCAL_USER = {
  userId: "local-dev-user",
  username: "dev@airbee.local",
} as AuthUser;
const LOCAL_PROFILE = {
  id: "local-dev-user",
  tenant_id: "00000000-0000-0000-0000-000000000001",
  full_name: "Dev User",
  phone: null,
  avatar_url: null,
};

interface Profile {
  id: string;
  tenant_id: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  profile: Profile | null;
  tenantId: string | null;
  isLoading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (role: "owner" | "staff" | "guest") => boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = async () => {
    // ── Local dev: skip Cognito entirely ──────────────────────
    if (LOCAL_DEV) {
      setUser(LOCAL_USER);
      setProfile(LOCAL_PROFILE);
      setTenantId(LOCAL_PROFILE.tenant_id);
      setIsLoading(false);
      return;
    }
    // ──────────────────────────────────────────────────────────

    try {
      resetApiAuthCache();
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      const attrs = await fetchUserAttributes();
      const tid = attrs["custom:tenant_id"] ?? null;
      setTenantId(tid);
      setProfile({
        id: currentUser.userId,
        tenant_id: tid,
        full_name: attrs.name ?? attrs.email?.split("@")[0] ?? null,
        phone: attrs.phone_number ?? null,
        avatar_url: attrs.picture ?? null,
      });
    } catch {
      setUser(null);
      setProfile(null);
      setTenantId(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
    if (LOCAL_DEV) return; // No Hub listener needed in local dev
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedIn") {
        resetApiAuthCache();
        loadUser();
      }
      if (payload.event === "signedOut") {
        resetApiAuthCache();
        setUser(null);
        setProfile(null);
        setTenantId(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    if (LOCAL_DEV) return; // no-op in local dev
    await amplifySignUp({
      username: email,
      password,
      options: { userAttributes: { email, name: fullName } },
    });
    // Cognito sends a verification email — caller must handle "CHECK_EMAIL" flow
    throw new Error("CHECK_EMAIL");
  };

  const signIn = async (email: string, password: string) => {
    if (LOCAL_DEV) return; // already signed in
    await amplifySignIn({ username: email, password });
    await loadUser();
  };

  const signOut = async () => {
    if (LOCAL_DEV) return; // no-op in local dev
    await amplifySignOut();
    resetApiAuthCache();
  };

  // All self-registered users are owners of their own tenant
  const hasRole = (_role: "owner" | "staff" | "guest") => !!user;

  return (
    <AuthContext.Provider
      value={{ user, profile, tenantId, isLoading, signUp, signIn, signOut, hasRole }}
    >
      {children}
    </AuthContext.Provider>
  );
};
