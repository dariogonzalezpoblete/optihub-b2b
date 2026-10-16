'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { resolveSafeRedirectUrl, validatePasswordInput } from '@/lib/auth/passwordRecovery';
import {
  clearRecoveryProof,
  consumeRecoveryProof,
  verifyRecoveryAuthorization,
} from '@/lib/auth/recoveryProof';

export interface OpticaMetadata {
  nombre_optica?: string;
  rut_empresa?: string;
  nombre_contacto?: string;
  telefono?: string;
  ciudad?: string;
  direccion?: string;
  giro?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isLoggedIn: boolean;
  isRecoveryMode: boolean;
  recoveryUserId: string | null;
  opticaData: OpticaMetadata | null;
  login: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  register: (
    email: string,
    password: string,
    metadata: OpticaMetadata
  ) => Promise<{ error: AuthError | null; data: any }>;
  logout: () => Promise<void>;
  resetPasswordForEmail: (email: string, redirectTo?: string) => Promise<{ error: AuthError | null }>;
  updatePassword: (password: string) => Promise<{ error: AuthError | null }>;
  clearRecoveryMode: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isLoggedIn: false,
  isRecoveryMode: false,
  recoveryUserId: null,
  opticaData: null,
  login: async () => ({ error: null }),
  register: async () => ({ error: null, data: null }),
  logout: async () => {},
  resetPasswordForEmail: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  clearRecoveryMode: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [recoveryUserId, setRecoveryUserId] = useState<string | null>(null);

  useEffect(() => {
    // 1. Obtener la sesión inicial almacenada
    const initializeAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const activeSession = data.session;
        setSession(activeSession);
        setUser(activeSession?.user ?? null);

        // Limpieza defensiva única de claves heredadas de versiones anteriores (ya no se usan)
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.removeItem('optihub_recovery_in_progress');
            sessionStorage.removeItem('optihub_recovery_user_id');
          } catch {
            // ignorar
          }
        }
      } catch (err) {
        console.error('Error al inicializar sesión:', err);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // 2. Suscribirse a cambios de estado de autenticación.
    // isRecoveryMode es SOLO informativo: la autorización vive en recoveryProof (memoria).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
        setRecoveryUserId(currentSession?.user?.id || null);
      } else if (event === 'SIGNED_OUT') {
        setIsRecoveryMode(false);
        setRecoveryUserId(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const clearRecoveryMode = () => {
    setIsRecoveryMode(false);
    setRecoveryUserId(null);
  };

  const login = async (email: string, password: string) => {
    // Al iniciar sesión manual, limpiar siempre cualquier flag residual de recuperación previa
    clearRecoveryMode();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const register = async (email: string, password: string, metadata: OpticaMetadata) => {
    clearRecoveryMode();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          ...metadata,
          rol: 'optica',
        },
      },
    });
    return { data, error };
  };

  const logout = async () => {
    clearRecoveryMode();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const resetPasswordForEmail = async (email: string, redirectTo?: string) => {
    // Validar siempre a través de resolveSafeRedirectUrl para evitar manipulación o open redirects (ARG-07)
    const targetRedirect = resolveSafeRedirectUrl(redirectTo || process.env.NEXT_PUBLIC_SITE_URL);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: targetRedirect,
    });
    return { error };
  };

  const updatePassword = async (password: string) => {
    // 1. Validación defensiva de formato de contraseña (ARG-06)
    const validation = validatePasswordInput(password, password);
    if (!validation.valid) {
      return {
        error: {
          name: 'ValidationError',
          message: validation.error || 'La contraseña no cumple los requisitos mínimos de seguridad.',
        } as AuthError,
      };
    }

    // 2-3. Verificar sesión + prueba de recuperación en memoria (claims verificados por el SDK).
    // Control de UI: el servidor no garantiza "solo recuperación".
    const decision = await verifyRecoveryAuthorization(supabase);
    if (!decision.authorized) {
      return {
        error: {
          name: 'UnauthorizedRecoveryError',
          message:
            decision.reason === 'no_session'
              ? 'No hay una sesión activa para actualizar la contraseña.'
              : 'La sesión actual no está autorizada para cambiar la contraseña. Solicita un nuevo enlace de recuperación.',
        } as AuthError,
      };
    }

    // 4. Invocar actualización en Supabase Auth
    const { error } = await supabase.auth.updateUser({
      password,
    });

    // 5. Tras el cambio exitoso: consumir la prueba y cerrar la sesión local (nunca falla el éxito)
    if (!error) {
      consumeRecoveryProof();
      clearRecoveryProof();
      clearRecoveryMode();
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (err) {
        console.error('No se pudo cerrar la sesión local tras el cambio de contraseña:', err);
      }
      setUser(null);
      setSession(null);
    }

    return { error };
  };

  const opticaData: OpticaMetadata | null = user?.user_metadata
    ? (user.user_metadata as OpticaMetadata)
    : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isLoggedIn: !!user,
        isRecoveryMode,
        recoveryUserId,
        opticaData,
        login,
        register,
        logout,
        resetPasswordForEmail,
        updatePassword,
        clearRecoveryMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
