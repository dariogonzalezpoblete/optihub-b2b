import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

// Token de acceso de Mercado Pago (Sandbox o Producción)
const accessToken = process.env.MP_ACCESS_TOKEN || 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000';

export const mpClient = new MercadoPagoConfig({
  accessToken: accessToken,
  options: { timeout: 7000 },
});

export const preferenceClient = new Preference(mpClient);
export const paymentClient = new Payment(mpClient);
