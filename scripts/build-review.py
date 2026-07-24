import json, csv
from collections import defaultdict
base="/tmp/kclean"
skus=json.load(open(f"{base}/skus_detail.json"))[0]['results']
models={m['id']:m['name'] for m in json.load(open(f"{base}/models.json"))[0]['results']}
colors={c['code']:c['name'] for c in json.load(open(f"{base}/colors.json"))[0]['results']}
tr=json.load(open("scripts/transcription.json"))
SIZE_IDX={"XS":0,"S":1,"M":2,"L":3,"XL":4,"2XL":5}
have=set((s['model_id'],s['color']) for s in skus)
sheets={(s['model'],s['color']):s for s in tr['sheets']}
totals=tr['model_totals_anotados']

rows=[]
for sk in skus:
    m,col,size=sk['model_id'],sk['color'],sk['size']
    sh=sheets.get((m,col)); prop=0; contado="no(0)"; nota=""; conf=""
    if m!="22S" and sh:
        nota=sh.get('note',''); conf=sh.get('conf','')
        if size in SIZE_IDX:
            v=sh['sizes'][SIZE_IDX[size]]
            if v is None: prop=0; contado="tapado->0"
            else: prop=v; contado="contado"
    elif m=="22S":
        contado="gorros->0"; nota="sin conteo de gorros"
    rows.append(dict(modelo=m,modelo_nombre=models.get(m,""),color=col,color_nombre=colors.get(col,""),
        talla=size or "",composite_code=sk['composite_code'],stock_actual=sk['stock'],
        propuesto=prop,contado=contado,confianza=conf,nota=nota))

with open("scripts/inventario-review.csv","w",newline="") as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)

print("RESUMEN FINAL (regla: tapado/no listado = 0):")
print(f"{'modelo':6} {'skus':>4} {'stk_act':>7} {'PROPUESTO':>9} {'delta':>6} {'anotado':>7}")
agg=defaultdict(lambda:{"sku":0,"act":0,"prop":0})
for r in rows:
    a=agg[r['modelo']]; a['sku']+=1; a['act']+=r['stock_actual']; a['prop']+=r['propuesto']
tp=ta=0
for m in sorted(agg):
    a=agg[m]; ta+=a['act']; tp+=a['prop']
    print(f"{m:6} {a['sku']:>4} {a['act']:>7} {a['prop']:>9} {a['prop']-a['act']:>6} {str(totals.get(m,'-')):>7}")
print(f"{'TOTAL':6} {'':>4} {ta:>7} {tp:>9} {tp-ta:>6}")
