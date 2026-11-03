import { NextRequest, NextResponse } from 'next/server';
import { authenticateServerRequest } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

const BACKEND_API_URL = process.env.BACKEND_API_URL;

export async function handleScraper(req: NextRequest | Request, options?: { customAuthClient?: any }) {
  try {
    // 1. Validar autenticación de administrador
    const auth = await authenticateServerRequest(req, options);
    if (!auth.authenticated) {
      return auth.response;
    }
    if (!auth.isAdmin) {
      return NextResponse.json(
        { error: 'Acceso denegado: Se requieren permisos de administrador.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'full-catalog';
    const endpoint = mode === 'full-catalog' ? '/api/sync/full-catalog' : '/api/sync/stock-prices';

    if (BACKEND_API_URL) {
      try {
        const res = await fetch(`${BACKEND_API_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
      } catch (backendError) {
        // Fall through to friendly guidance below
      }
    }

    return NextResponse.json({
      status: 'info',
      message:
        '💡 La extracción completa con Playwright (fotos WebP y navegación web) se ejecuta directamente en tu máquina local o servidor con navegador. Abre una terminal en tu proyecto y ejecuta: npm run scraper:all (o npm run sync:fast).',
      command: 'npm run scraper:all',
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Error en endpoint del scraper' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return handleScraper(req);
}

