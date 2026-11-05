"""Verifica que STAGING == PRODUCCIÓN en ids y precio_usd (precondición para comparar contra el snapshot de prod).
Entrada: snapshot de producción y salida JSON de staging de:
  SELECT jsonb_agg(jsonb_build_object('id',id,'precio_usd',precio_usd) ORDER BY id) FROM public.marcos;
Uso: python tools/pricing_staging_parity.py marcos_snapshot.json staging_ids_usd.json
"""
import json, sys

def load(p):
    d = json.load(open(p, encoding='utf-8-sig'))
    if isinstance(d, list) and len(d) == 1 and isinstance(d[0], dict) and len(d[0]) == 1:
        d = list(d[0].values())[0]
    return d

prod = {int(r['id']): r for r in load(sys.argv[1])}
stg = {int(r['id']): r for r in load(sys.argv[2])}
only_p, only_s = sorted(set(prod) - set(stg)), sorted(set(stg) - set(prod))
usd = [i for i in prod.keys() & stg.keys()
       if prod[i]['precio_usd'] is None or stg[i]['precio_usd'] is None
       or abs(float(prod[i]['precio_usd']) - float(stg[i]['precio_usd'])) > 1e-9]
print(f"filas prod={len(prod)} staging={len(stg)} | solo_prod={len(only_p)} solo_staging={len(only_s)} | precio_usd distinto={len(usd)}")
for i in usd[:50]:
    print('USD DIF', i, prod[i]['precio_usd'], stg[i]['precio_usd'])
ok = not (only_p or only_s or usd)
print('PARIDAD OK: comparacion valida' if ok else 'PARIDAD NO CUMPLE: la comparacion contra el snapshot NO es valida')
sys.exit(0 if ok else 1)
