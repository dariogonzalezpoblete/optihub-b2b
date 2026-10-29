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
  razon_social?: string;
  giro_comercial?: string;
  giro?: string;
  rut_empresa?: string;
  nombre_contacto?: string;
  telefono?: string;
  ciudad?: string;
  region?: string;
  comuna?: string;
  direccion?: string;
  rol?: string;
  verificado_b2b?: boolean;
  estado_verificacion?: 'pendiente' | 'verificado' | 'rechazado';
  fecha_solicitud?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isLoggedIn: boolean;
  isB2BApproved: boolean;
  isB2BPending: boolean;
  verificationStatus: 'pendiente' | 'verificado' | 'rechazado' | 'unauthenticated';
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
  isB2BApproved: false,
  isB2BPending: false,
  verificationStatus: 'unauthenticated',
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
          estado_verificacion: 'pendiente',
          verificado_b2b: false,
          fecha_solicitud: new Date().toISOString(),
        },
      },
    });

    // Sincronización transparente con public.profiles si existe sesión
    if (!error && data?.user?.id) {
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          first_name: metadata.nombre_contacto || null,
          phone: metadata.telefono || null,
          rut: metadata.rut_empresa || null,
          business_name: metadata.razon_social || metadata.nombre_optica || null,
          business_giro: metadata.giro_comercial || metadata.giro || null,
          region: metadata.region || null,
          commune: metadata.comuna || null,
          billing_address: `${metadata.comuna || ''}, ${metadata.region || ''}`,
          updated_at: new Date().toISOString(),
        });
      } catch (profileErr) {
        // En caso de confirmación de email pendiente, se sincronizará tras primer inicio
        console.warn('[AuthContext] Nota: Sincronización de perfil pendiente de activación.', profileErr);
      }
    }

    return { data, error };
  };

  const logout = async () => {
    clearRecoveryMode();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const resetPasswordForEmail = async (email: string, redirectTo?: string) => {
    const targetRedirect = resolveSafeRedirectUrl(redirectTo || process.env.NEXT_PUBLIC_SITE_URL);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: targetRedirect,
    });
    return { error };
  };

  const updatePassword = async (password: string) => {
    const validation = validatePasswordInput(password, password);
    if (!validation.valid) {
      return {
        error: {
          name: 'ValidationError',
          message: validation.error || 'La contraseña no cumple los requisitos mínimos de seguridad.',
        } as AuthError,
      };
    }

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

    const { error } = await supabase.auth.updateUser({
      password,
    });

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

  // Evaluación estricta de estado de verificación B2B
  const isAdmin = Boolean(
    user && (
      user.app_metadata?.role === 'admin' ||
      user.user_metadata?.role === 'admin' ||
      user.user_metadata?.is_admin === true ||
      ['multifocuslimitada@gmail.com', 'dario.joda.2007@gmail.com', 'contacto@optihub.cl', 'admin@optihub.cl'].includes(
        user.email?.toLowerCase().trim() || ''
      )
    )
  );

  const isB2BApproved = Boolean(
    user && (
      isAdmin ||
      user.app_metadata?.b2b_approved === true ||
      user.app_metadata?.b2b_status === 'approved' ||
      user.user_metadata?.verificado_b2b === true ||
      user.user_metadata?.estado_verificacion === 'verificado' ||
      user.user_metadata?.estado === 'activo'
    )
  );

  const verificationStatus: 'pendiente' | 'verificado' | 'rechazado' | 'unauthenticated' =
    !user
      ? 'unauthenticated'
      : isB2BApproved
      ? 'verificado'
      : user.user_metadata?.estado_verificacion === 'rechazado'
      ? 'rechazado'
      : 'pendiente';

  const isB2BPending = Boolean(user && !isB2BApproved && verificationStatus === 'pendiente');

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isLoggedIn: !!user,
        isB2BApproved,
        isB2BPending,
        verificationStatus,
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
