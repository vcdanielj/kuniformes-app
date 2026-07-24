import json,csv,re
from collections import defaultdict
base="/tmp/kclean"
skus=json.load(open(f"{base}/skus_detail.json"))[0]['results']
have=set((s['model_id'],s['color']) for s in skus)
tr=json.load(open("scripts/transcription.json"))
SIZE_IDX={"XS":0,"S":1,"M":2,"L":3,"XL":4,"2XL":5}
sheets={(s['model'],s['color']):s for s in tr['sheets']}
# gorros: sumar duplicados (sufijos _pN)
graw=json.load(open("scripts/gorros.json"))
gor=defaultdict(int); 
for k,v in graw.items(): gor[re.sub(r'_p\d+$','',k)]+=v
gor_codes_in_catalog=set(c for (m,c) in have if m=="22S")
gor_unmapped={k:v for k,v in gor.items() if k not in gor_codes_in_catalog}

final=[]   # (sku, new_stock)
for sk in skus:
    m,col,size=sk['model_id'],sk['color'],sk['size']
    new=0
    if m=="22S":
        new=gor.get(col,0)
    else:
        sh=sheets.get((m,col))
        if sh and size in SIZE_IDX:
            v=sh['sizes'][SIZE_IDX[size]]; new=v if v is not None else 0
    final.append((sk,new))

# SQL
admin="usr_admin"; reason="Sinceramiento de inventario 2026-06"
lines=["-- Sinceramiento de inventario 2026-06 (generado)"]
adj=0
for sk,new in final:
    cur=sk['stock']
    if new!=cur:
        d=new-cur
        lines.append(f"UPDATE skus SET stock={new} WHERE id={sk['sku_id']};")
        lines.append(f"INSERT INTO stock_adjustments (sku_id,quantity,reason,user_id) VALUES ({sk['sku_id']},{d},'{reason}','{admin}');")
        adj+=1
open("scripts/apply-sinceramiento.sql","w").write("\n".join(lines)+"\n")

# Resumen
agg=defaultdict(lambda:[0,0]) # act,new
for sk,new in final: agg[sk['model_id']][0]+=sk['stock']; agg[sk['model_id']][1]+=new
print(f"{'modelo':6} {'actual':>7} {'nuevo':>6} {'delta':>6}")
ta=tn=0
for m in sorted(agg):
    a,n=agg[m]; ta+=a; tn+=n; print(f"{m:6} {a:>7} {n:>6} {n-a:>6}")
print(f"{'TOTAL':6} {ta:>7} {tn:>6} {tn-ta:>6}")
print(f"\nSKUs a modificar: {adj}  ->  scripts/apply-sinceramiento.sql")
print(f"Gorros total contado: {sum(gor.values())}  (mapeados: {sum(v for k,v in gor.items() if k in gor_codes_in_catalog)})")
if gor_unmapped: print(f"Gorros con codigo NO en catalogo (no se cargan, {sum(gor_unmapped.values())} u): {gor_unmapped}")
