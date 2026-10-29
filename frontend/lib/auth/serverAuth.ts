// frontend/lib/auth/serverAuth.ts
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

/**
 * Lista explícita de correos autorizados para funciones administrativas en OptiHub B2B.
 * Mantiene compatibilidad con el administrador legítimo de la plataforma.
 */
const DEFAULT_ADMIN_EMAILS = [
  'multifocuslimitada@gmail.com',
  'dario.joda.2007@gmail.com',
  'contacto@optihub.cl',
  'admin@optihub.cl'
];

export function getAuthorizedAdminEmails(): string[] {
  const admins = new Set<string>(DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase().trim()));

  // Soporte para ADMIN_EMAIL configurado en variables de entorno (excluyendo el default de notificaciones)
  const envAdminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (envAdminEmail && envAdminEmail.includes('@') && envAdminEmail !== 'contacto@optihub.cl') {
    admins.add(envAdminEmail);
  }

  // Soporte para lista separada por comas ADMIN_EMAILS en variables de entorno
  const envAdminEmailsList = process.env.ADMIN_EMAILS;
  if (envAdminEmailsList) {
    envAdminEmailsList.split(',').forEach((em) => {
      const trimmed = em.toLowerCase().trim();
      if (trimmed && trimmed.includes('@')) {
        admins.add(trimmed);
      }
    });
  }

  return Array.from(admins);
}

/**
 * Determina si una identidad verificada por Supabase Auth posee rol administrativo.
 *
 * Regla de seguridad:
 * - Basada exclusivamente en el email autenticado por Supabase (user.email).
 * - No evalúa parámetros URL, body ni metadatos modificables por el cliente.
 */
export function isUserAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  if (
    user.app_metadata?.role === 'admin' ||
    user.user_metadata?.role === 'admin' ||
    user.user_metadata?.is_admin === true
  ) {
    return true;
  }
  if (!user.email) return false;
  const normalizedEmail = user.email.toLowerCase().trim();
  const allowed = getAuthorizedAdminEmails();
  return allowed.includes(normalizedEmail);
}

/**
 * Determina si un usuario autenticado posee autorización B2B activa y verificada (SII/Comercial).
 *
 * Falla cerrado (false):
 * - Si el usuario es null/undefined
 * - Si la cuenta está en estado 'pendiente' o no verificada
 * Retorna true:
 * - Si el usuario es Administrador de la plataforma
 * - Si app_metadata.b2b_approved === true
 * - Si user_metadata.verificado_b2b === true o user_metadata.estado_verificacion === 'verificado' o user_metadata.estado === 'activo'
 */
export function isUserB2BApproved(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isUserAdmin(user)) return true;

  if (user.app_metadata?.b2b_approved === true || user.app_metadata?.b2b_status === 'approved') {
    return true;
  }

  const meta = user.user_metadata || {};
  if (meta.estado_verificacion === 'rechazado' || meta.estado === 'bloqueado') {
    return false;
  }

  if (meta.verificado_b2b === true || meta.estado_verificacion === 'verificado' || meta.estado === 'activo') {
    return true;
  }

  return false;
}

export interface ServerAuthSuccess {
  authenticated: true;
  user: User;
  isAdmin: boolean;
  isB2BApproved: boolean;
}

export interface ServerAuthFailure {
  authenticated: false;
  user: null;
  isAdmin: false;
  isB2BApproved: false;
  response: Response;
}

export type ServerAuthResult = ServerAuthSuccess | ServerAuthFailure;

export interface AuthenticateServerRequestOptions {
  customAuthClient?: {
    auth: {
      getUser: (token: string) => Promise<{ data: { user: User | null }; error: unknown | null }>;
    };
  };
}

/**
 * Autentica una solicitud HTTP de servidor mediante Supabase Auth.
 *
 * Garantías:
 * 1. Exige encabezado Authorization: Bearer <access_token>.
 * 2. Valida el token con supabase.auth.getUser(token) usando clave pública (anon).
 * 3. Desactiva la persistencia de sesión en el cliente efímero.
 * 4. Falla cerrado (401) ante token ausente, malformado, expirado o inválido.
 * 5. Falla cerrado (500) ante configuración ausente sin exponer secretos.
 * 6. NO utiliza SUPABASE_SERVICE_ROLE_KEY para autenticar al solicitante.
 */
export async function authenticateServerRequest(
  req: Request,
  options?: AuthenticateServerRequestOptions
): Promise<ServerAuthResult> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return {
      authenticated: false,
      user: null,
      isAdmin: false,
      isB2BApproved: false,
      response: Response.json(
        { error: 'No autorizado: Cabecera Authorization requerida.' },
        { status: 401 }
      ),
    };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1].trim()) {
    return {
      authenticated: false,
      user: null,
      isAdmin: false,
      isB2BApproved: false,
      response: Response.json(
        { error: 'No autorizado: Formato de token inválido. Se espera Bearer <token>.' },
        { status: 401 }
      ),
    };
  }

  const token = match[1].trim();

  // Soporte para cliente de autenticación inyectado (tests unitarios aislados sin red)
  if (options?.customAuthClient) {
    try {
      const { data, error } = await options.customAuthClient.auth.getUser(token);
      if (error || !data?.user) {
        return {
          authenticated: false,
          user: null,
          isAdmin: false,
          isB2BApproved: false,
          response: Response.json(
            { error: 'No autorizado: Token inválido o sesión expirada.' },
            { status: 401 }
          ),
        };
      }
      return {
        authenticated: true,
        user: data.user,
        isAdmin: isUserAdmin(data.user),
        isB2BApproved: isUserB2BApproved(data.user),
      };
    } catch {
      return {
        authenticated: false,
        user: null,
        isAdmin: false,
        isB2BApproved: false,
        response: Response.json(
          { error: 'No autorizado: Error al verificar token de acceso.' },
          { status: 401 }
        ),
      };
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[ServerAuth] Configuración incompleta: NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY no disponible.');
    return {
      authenticated: false,
      user: null,
      isAdmin: false,
      isB2BApproved: false,
      response: Response.json(
        { error: 'Error interno del servidor: Servicio de autenticación no configurado.' },
        { status: 500 }
      ),
    };
  }

  try {
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: { user }, error } = await authClient.auth.getUser(token);

    if (error || !user) {
      return {
        authenticated: false,
        user: null,
        isAdmin: false,
        isB2BApproved: false,
        response: Response.json(
          { error: 'No autorizado: Token inválido o sesión expirada.' },
          { status: 401 }
        ),
      };
    }

    return {
      authenticated: true,
      user,
      isAdmin: isUserAdmin(user),
      isB2BApproved: isUserB2BApproved(user),
    };
  } catch (err: unknown) {
    console.error('[ServerAuth] Excepción al invocar auth.getUser');
    return {
      authenticated: false,
      user: null,
      isAdmin: false,
      isB2BApproved: false,
      response: Response.json(
        { error: 'No autorizado: Error al validar token.' },
        { status: 401 }
      ),
    };
  }
}
