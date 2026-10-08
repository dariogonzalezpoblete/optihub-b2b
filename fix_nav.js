const fs = require('fs');
let code = fs.readFileSync('frontend/components/Navbar.tsx', 'utf8');

const t1 = `            </Link>
            <Link
              href="/seguimiento"
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-all"
            >
              Seguimiento
            </Link>
          </nav>`;

code = code.replace('            </Link>\r\n          </nav>', t1);
code = code.replace('            </Link>\n          </nav>', t1);

fs.writeFileSync('frontend/components/Navbar.tsx', code, 'utf8');
console.log('Fixed Navbar');
