// frontend/app/api/inventory/check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkStockAvailability } from '@/lib/inventory/inventoryService';
import { formatInventoryErrorResponse } from '@/lib/inventory/errors';
import { authenticateServerRequest } from '@/lib/auth/serverAuth';
import type { AuthenticateServerRequestOptions } from '@/lib/auth/serverAuth';

export const dynamic = 'force-dynamic';

const MAX_PRODUCT_IDS = 50;
// Formato de id_ext (p. ej. "GG1319O-001"): alfanumérico con separadores simples.
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9._\-+/ ]{1,64}$/;

interface CheckHandlerOptions {
  customAuthClient?: AuthenticateServerRequestOptions['customAuthClient'];
  customInventoryService?: {
    checkStockAvailability: typeof checkStockAvailability;
  };
}

function badRequest(code: string, error: string) {
  return NextResponse.json(
    { error, code, statusCode: 400, timestamp: new Date().toISOString() },
    { status: 400 }
  );
}

/**
 * Valida y normaliza la lista de identificadores. Devuelve null si el formato es inválido.
 */
function normalizeProductIds(raw: unknown[]): string[] | null {
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') return null;
    const id = value.trim();
    if (!id) continue;
    if (!PRODUCT_ID_PATTERN.test(id)) return null;
    ids.push(id);
  }
  const unique = Array.from(new Set(ids));
  if (unique.length > MAX_PRODUCT_IDS) return null;
  return unique;
}

/**
 * Núcleo compartido por GET y POST.
 * Autoriza en servidor (Bearer verificado por Supabase Auth, cliente B2B aprobado o admin) y devuelve
 * únicamente productId, availableStock e isAvailable: sin precios, marca, modelo ni existencia interna.
 */
async function handleCheck(
  req: Request,
  extractIds: () => Promise<{ ids?: unknown[]; errorResponse?: Response }>,
  options?: CheckHandlerOptions
) {
  try {
    const auth = await authenticateServerRequest(req, {
      customAuthClient: options?.customAuthClient,
    });
    if (!auth.authenticated) {
      return auth.response;
    }

    if (!auth.isB2BApproved) {
      return NextResponse.json(
        {
          error: 'Acceso denegado. Se requiere una cuenta B2B verificada para consultar disponibilidad.',
          code: 'FORBIDDEN',
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      );
    }

    const extracted = await extractIds();
    if (extracted.errorResponse) return extracted.errorResponse;

    const productIds = normalizeProductIds(extracted.ids || []);
    if (productIds === null) {
      return badRequest(
        'INVALID_PRODUCT_IDS',
        `Identificadores inválidos. Máximo ${MAX_PRODUCT_IDS} ids alfanuméricos de hasta 64 caracteres.`
      );
    }
    if (productIds.length === 0) {
      return badRequest(
        'MISSING_PRODUCT_IDS',
        'Debe especificar al menos un producto (parámetro "ids" o arreglo "productIds").'
      );
    }

    const service = options?.customInventoryService?.checkStockAvailability || checkStockAvailability;
    const rows = await service(productIds);

    const items = rows.map((row) => ({
      productId: row.productId,
      availableStock: row.availableStock,
      isAvailable: row.isAvailable,
    }));

    return NextResponse.json({ items }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: unknown) {
    return formatInventoryErrorResponse(error);
  }
}

/**
 * GET /api/inventory/check?ids=prod1,prod2
 * POST /api/inventory/check { productIds: ['prod1', 'prod2'] }
 * Checks real-time stock levels for specified products (B2B approved clients only).
 */
export async function handleCheckStockGet(req: Request, options?: CheckHandlerOptions) {
  return handleCheck(
    req,
    async () => {
      const { searchParams } = new URL(req.url);
      const idsParam = searchParams.get('ids') || searchParams.get('productIds') || '';
      return { ids: idsParam.split(',') };
    },
    options
  );
}

export async function handleCheckStockPost(req: Request, options?: CheckHandlerOptions) {
  return handleCheck(
    req,
    async () => {
      let body: { productIds?: unknown };
      try {
        body = await req.json();
      } catch {
        return {
          errorResponse: badRequest('INVALID_JSON_BODY', 'Cuerpo de solicitud inválido. Se espera formato JSON.'),
        };
      }
      if (!Array.isArray(body?.productIds)) {
        return { ids: [] };
      }
      return { ids: body.productIds };
    },
    options
  );
}

export async function GET(req: NextRequest) {
  return handleCheckStockGet(req);
}

export async function POST(req: NextRequest) {
  return handleCheckStockPost(req);
}
