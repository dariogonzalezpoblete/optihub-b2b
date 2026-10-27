import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://127.0.0.1:8000';
const REPORT_FILE_PATH = path.resolve(process.cwd(), '..', 'backend', 'scraper', 'sync_report_latest.json');

export async function GET() {
  try {
    // 1. Try to contact FastAPI backend if available
    try {
      const res = await fetch(`${BACKEND_API_URL}/api/sync/status`, {
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {
      // Backend not running on port 8000, fallback to direct file check
    }

    // 2. Fallback: check local report file
    if (fs.existsSync(REPORT_FILE_PATH)) {
      const content = fs.readFileSync(REPORT_FILE_PATH, 'utf-8');
      const summary = JSON.parse(content);
      return NextResponse.json({
        is_running: false,
        has_last_summary: true,
        latest_summary: summary,
      });
    }

    return NextResponse.json({
      is_running: false,
      has_last_summary: false,
      latest_summary: null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Error consultando estado de sincronización' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Proxy request to FastAPI backend
    try {
      const res = await fetch(`${BACKEND_API_URL}/api/sync/stock-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch (err) {
      return NextResponse.json(
        {
          error:
            'No se pudo conectar con el backend de FastAPI (puerto 8000). Asegúrate de iniciar el backend con: uvicorn app.main:app --reload',
          detail: (err as Error).message,
        },
        { status: 503 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Error procesando sincronización' },
      { status: 500 }
    );
  }
}
