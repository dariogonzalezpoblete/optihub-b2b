const fs = require('fs');
let code = fs.readFileSync('frontend/components/Navbar.tsx', 'utf8');

const t1 = `                  <div className="flex items-center gap-3 bg-slate-900/50 pl-2 pr-3 py-1.5 rounded-2xl border border-slate-800/80">
                    <Link href="/mis-pedidos" className="flex items-center gap-3 group" title="Ver Mis Pedidos">
                      <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                        <Building2 className="w-4 h-4" />
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
                    <div className="w-px h-5 bg-slate-800 hidden lg:block"></div>
                    <button`;

code = code.replace(/<div className="flex items-center gap-3 bg-slate-900\/50 pl-2 pr-3 py-1\.5 rounded-2xl border border-slate-800\/80">[\s\S]*?<div className="hidden lg:flex flex-col text-left">[\s\S]*?Verificada[\s\S]*?<\/span>[\s\S]*?<\/div>[\s\S]*?<button/, t1);

fs.writeFileSync('frontend/components/Navbar.tsx', code, 'utf8');
console.log('Fixed profile link');
