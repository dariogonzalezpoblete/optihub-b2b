const fs = require('fs');
let code = fs.readFileSync('frontend/app/checkout/page.tsx', 'utf8');

// 1. Add state for terms modal
code = code.replace(
  'const [loading, setLoading] = useState(false);',
  'const [loading, setLoading] = useState(false);\n  const [showTerms, setShowTerms] = useState(false);\n  const [acceptTerms, setAcceptTerms] = useState(false);'
);

// 2. Add terms checkbox and update button disabled state
const checkboxHTML = `
            {/* TERMINOS Y CONDICIONES */}
            <div className="pt-2 pb-2">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                  <input
                    type="checkbox"
                    required
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="w-5 h-5 border-2 border-slate-600 rounded bg-slate-900 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all"></div>
                  <Check className="absolute w-3.5 h-3.5 text-slate-950 opacity-0 peer-checked:opacity-100 transition-opacity" />
                </div>
                <div className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors leading-relaxed">
                  Acepto los <button type="button" onClick={() => setShowTerms(true)} className="text-emerald-400 hover:underline font-bold">términos y condiciones de importación directa</button> (plazos de 10 a 15 días hábiles y valores más IVA).
                </div>
              </label>
            </div>

            {/* BOTÓN MERCADO PAGO */}
`;
code = code.replace(/\{\/\* BOT.N MERCADO PAGO \*\/\}/, checkboxHTML);
code = code.replace('disabled={loading}', 'disabled={loading || !acceptTerms}');

// 3. Add Modal at the end
const modalHTML = `
      {/* MODAL TÉRMINOS Y CONDICIONES */}
      {showTerms && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowTerms(false)}></div>
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Términos de Importación Directa</h3>
              <button type="button" onClick={() => setShowTerms(false)} className="text-slate-400 hover:text-white">
                Cerrar
              </button>
            </div>
            <div className="overflow-y-auto custom-scrollbar flex-grow text-sm text-slate-300 space-y-4 pr-2">
              <p><strong>1. Tiempos de Entrega:</strong> Al ser productos de importación directa desde nuestra bodega en Miami, EE.UU., el plazo de entrega estimado es de 10 a 15 días hábiles desde la confirmación del pago.</p>
              <p><strong>2. Valores e Impuestos:</strong> Los valores expresados en la plataforma corresponden al precio neto. El IVA (19%) ha sido calculado y agregado en el resumen final de la compra para la emisión de su Factura Electrónica.</p>
              <p><strong>3. Políticas de Garantía:</strong> Todos los armazones cuentan con garantía por defectos de fábrica válida por 3 meses. Los reclamos deben estar respaldados por evidencia fotográfica.</p>
              <p><strong>4. Consolidación de Pedidos:</strong> Si el pedido supera los volúmenes estándar o incluye marcas que requieren verificación aduanera especial, OptiHub se reserva el derecho de contactar a la óptica para coordinar la mejor vía de despacho.</p>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-800 text-right">
              <button type="button" onClick={() => setShowTerms(false)} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl transition">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
`;

code = code.replace(/    <\/div>\s*  \);\s*}\s*$/, modalHTML);

fs.writeFileSync('frontend/app/checkout/page.tsx', code, 'utf8');
console.log('Checkout terms updated');
