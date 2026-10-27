import { NextRequest, NextResponse } from 'next/server';

const BACKEND_API_URL = process.env.BACKEND_API_URL;

export async function POST(req: NextRequest) {
  try {
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
