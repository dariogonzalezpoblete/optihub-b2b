import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://127.0.0.1:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'stock-prices'; // 'stock-prices' or 'full-catalog'

    const endpoint = mode === 'full-catalog' ? '/api/sync/full-catalog' : '/api/sync/stock-prices';

    // Forward to FastAPI backend
    try {
      const res = await fetch(`${BACKEND_API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch (backendError) {
      return NextResponse.json(
        {
          error:
            'El backend de sincronización (FastAPI) no está respondiendo en el puerto 8000.',
          detail: (backendError as Error).message,
          suggestion: 'Asegúrate de ejecutar: npm run dev:backend o uvicorn app.main:app --app-dir backend --reload',
        },
        { status: 503 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Error en endpoint del scraper' },
      { status: 500 }
    );
  }
}
