"""Compara fila por fila el resultado del motor SQL (pricing_preview) contra el motor Python.
Tolerancia 0 en precio_neto y precio_bruto.
Uso: python tools/pricing_compare.py marcos_snapshot.json pricing_sql_output.json
"""
import json, sys
from decimal import Decimal as D, ROUND_CEILING, ROUND_HALF_UP

P = dict(fx_ref=D(950), fx_buffer=D('0.02'), iva=D('0.19'), arancel=D('0.06'), bu=D(11), bkg=D('1.7'),
         tf=D(4255), sl=D(23716), tn=D(23850), slc=1, tnc=1, slb=1, rec=1, qc=D(0),
         com=D('0.03'), merma=D('0.01'), gmin=D(12000))
TIERS = [(D(0), D('0.35')), (D(25), D('0.30')), (D(60), D('0.22')), (D(120), D('0.15'))]


def calc(usd):
    usd = D(str(usd)); fx = P['fx_ref'] * (1 + P['fx_buffer']); w = P['bkg'] / P['bu']
    fob = usd * fx; fl = w * (P['tf'] / P['bkg']); sv = w * (P['sl'] / P['bkg']) / (1 + P['iva'] * P['slc'])
    base = fob + fl + sv * P['slb']; ar = base * P['arancel']; ivi = (base + ar) * P['iva']
    tr = (P['tn'] / P['bu']) / (1 + P['iva'] * P['tnc'])
    cost = fob + fl + sv + ar + tr + P['qc'] + ivi * (1 - P['rec'])
    f = P['com'] * (1 + P['iva']) + P['merma']
    m = [t[1] for t in TIERS if t[0] <= usd][-1]
    raw = max(cost / (1 - m - f), (cost + P['gmin']) / (1 - f))
    pn = (raw / 100).to_integral_value(ROUND_CEILING) * 100
    pb = (pn * (1 + P['iva']) / 100).quantize(D(1), ROUND_HALF_UP) * 100
    return int(pn), int(pb)


def main(snap_path, sql_path):
    snap = json.load(open(snap_path, encoding='utf-8-sig'))
    raw = json.load(open(sql_path, encoding='utf-8-sig'))
    if isinstance(raw, list) and raw and isinstance(raw[0], list):   # export de SQL editor: [[{...}]]
        raw = raw[0]
    if isinstance(raw, list) and len(raw) == 1 and isinstance(raw[0], dict) and len(raw[0]) == 1:
        raw = list(raw[0].values())[0]                              # {"jsonb_agg":[...]}
    sql = {int(r['id']): r for r in raw}
    diffs, missing = [], []
    for r in snap:
        s = sql.get(int(r['id']))
        if s is None:
            missing.append(r['id']); continue
        pn, pb = calc(r['precio_usd'])
        if int(s['precio_neto']) != pn or int(s['precio_bruto']) != pb:
            diffs.append((r['id'], r['marca'], r['modelo'], r['precio_usd'], pn, pb, s['precio_neto'], s['precio_bruto']))
    extra = set(sql) - {int(r['id']) for r in snap}
    print(f"snapshot={len(snap)} sql={len(sql)} sin_resultado_sql={len(missing)} extra_en_sql={len(extra)} diferencias={len(diffs)}")
    for d in diffs[:100]:
        print('DIF id=%s %s %s usd=%s python=%s/%s sql=%s/%s' % d)
    sys.exit(0 if not diffs and not missing and not extra else 1)


if __name__ == '__main__':
    main(*sys.argv[1:3])
