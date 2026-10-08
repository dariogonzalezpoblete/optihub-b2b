const fs = require('fs');
let code = fs.readFileSync('frontend/components/Navbar.tsx', 'utf8');

const replacement = `                <div className="flex items-center gap-2.5 bg-slate-900/70 border border-slate-800/80 rounded-2xl px-3 py-1.5 shadow-sm group hover:border-emerald-500/30 transition-all">
                  <Link href="/mis-pedidos" className="flex items-center gap-2.5" title="Ver Historial de Pedidos">
                    <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
                      <Building2 className="w-3.5 h-3.5" />
                    </div>
                    <div className="hidden lg:flex flex-col text-left">
                      <span className="text-xs font-bold text-slate-200 max-w-[120px] truncate leading-tight group-hover:text-emerald-400 transition-colors">
                        {nombreMostrar}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-medium leading-none">
                        Mis Pedidos
                      </span>
                    </div>
                  </Link>
                  <div className="w-px h-5 bg-slate-800 mx-1 hidden lg:block"></div>`;

code = code.replace(/<div className="flex items-center gap-2\.5 bg-slate-900\/70 border border-slate-800\/80 rounded-2xl px-3 py-1\.5 shadow-sm">[\s\S]*?<div className="hidden lg:flex flex-col text-left">[\s\S]*?Verificada[\s\S]*?<\/span>\s*<\/div>/, replacement);

fs.writeFileSync('frontend/components/Navbar.tsx', code, 'utf8');
console.log('Fixed profile link');
