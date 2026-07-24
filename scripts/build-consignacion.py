import json, csv
skus=json.load(open("/tmp/kclean/skus_detail.json"))[0]['results']
colors={c['code']:c['name'] for c in json.load(open("/tmp/kclean/colors.json"))[0]['results']}
comp={s['composite_code']:s for s in skus}
by_mc={}
for s in skus: by_mc.setdefault((s['model_id'],s['color']),set()).add(s['size'])

# (consignee, qty, color_raw, model_raw, size)
MELSY=[
 ("Amarillo","Bola campana","XL"),("Amarillo","Bola campana","L"),("Amarillo","Bola campana","S"),("Amarillo","Bola campana","S"),
 ("Azul Rey","Joger cuello Mao","XS"),("Azul Rey","Bola recta","2XL"),("Azul Rey","Bola recta","2XL"),("Azul Rey","Bola recta","XL"),("Azul Rey","Bola recta","L"),
 ("Rojo 42168","Joger cuello V","M"),("Rojo Joger","Joger cuello V","M"),("Rojo 42168","Bola recta","S"),
 ("Morado","Bola campana","M"),("Verde agua","Bola campana","S"),("Marron","Bola recta","S"),("Verde Pizarra","Bola recta","S"),
 ("Gris","Bola recta","S"),("Lila","Bola recta","XS"),("Beis","Bola recta","S"),("Azul Romulo","Bola recta","S"),
 ("Naranja cuello Mao","Joger","S"),("Degradado Fucsia Morado","Joger","S"),("Degradado Morado Fucsia","Joger","S"),
 ("Fucsia","Bola recta","M"),("negro Joger","Joger cuello Mao","XS"),("negro cuello V","Bola recta","S"),
 ("Aguamarina Z2","Bola recta Hombre","L"),
 ("Gris","caballero","2XL"),("Marron","Bola recta","2XL"),  # tras "Faltan 3 que tiene Melsy"
]
MAGLLY=[
 (2,"Marron","Bota Recta","S"),(1,"Negro","Bota Ancha","S"),(1,"Azul cielo","Bota Ancha","S"),(1,"Azul oscuro","Bota Recta","S"),
 (1,"fucsia","Bota Recta","M"),(1,"Amarillo","Bota Ancha","M"),(1,"Beige","Bota Recta","M"),(1,"Azul Electrico","Bota Recta","M"),
 (1,"Vinotinto","Bota Recta","M"),(1,"Vino Morado","Bota Recta Cierre","M"),(1,"Gris","Bota Recta","M"),(1,"Menta","Bota Recta","M"),
 (1,"Rojo","Bota Recta 42168","M"),(1,"Marron","Bota Recta","M"),(2,"Negro","Bota Ancha","M"),(1,"Azul cielo","Bota Recta","M"),
 (1,"Gris","Bota Recta","L"),(1,"Vinotinto","Bota Recta","L"),(1,"Rojo","Bota Recta","L"),(2,"Marron","Bota Recta","L"),
 (1,"Negro","Bota Ancha","L"),(1,"Negro","Bota Recta","L"),(1,"Negro","Bota Recta","XL"),(1,"Vinotinto","Bota Recta","XL"),
]
COLOR={"amarillo":"Z32","azul rey":"Z22","rojo":"Z40","morado":"Z20","verde agua":"Z31","marron":"Z1","verde pizarra":"Z29",
 "gris":"Z27","lila":"Z15","beis":"Z25","beige":"Z25","azul romulo":"Z26","naranja":"Z13","fucsia":"Z3","negro":"Z21",
 "aguamarina":"Z2","azul cielo":"Z2","azul oscuro":"Z9","azul electrico":"Z22","vinotinto":"Z8","vino morado":"Z17","menta":"Z11"}
AMBIG_COLOR={"marron":"Z1/Z35","gris":"Z27/Z34","azul electrico":"Z22/Z2","menta":"Z11/Z31","azul oscuro":"Z9/Z22"}

def map_color(raw):
    r=raw.lower()
    if "degradado" in r: return None,"DEGRADADO A-E (definir)"
    if "rojo 42168" in r or r.startswith("rojo"): return "Z40",AMBIG_COLOR.get("rojo","")
    for k in sorted(COLOR,key=len,reverse=True):
        if k in r: return COLOR[k],AMBIG_COLOR.get(k,"")
    return None,"color no mapeado"

def map_model(raw):
    r=raw.lower()
    if "cierre" in r: return "42108",""
    if "campana" in r or "ancha" in r: return "42342",""
    if "hombre" in r or "caballero" in r: return "42019",""
    if "cuello v" in r: return "42122",""
    if "degradado" in r: return "42187",""
    if "mao" in r: return "42015",""
    if "42168" in r: return "42168",""
    if "joger" in r or "jogger" in r: return "42015","joger? (42015/42122)"
    if "recta" in r: return "42168",""
    return None,"modelo?"

rows=[]
def proc(consignee,qty,craw,mraw,size):
    mc,mflag=map_model(mraw); cc,cflag=map_color(craw)
    if "degradado" in mraw.lower() or "degradado" in craw.lower(): mc="42187"
    comp_code=f"{mc}-{cc}-{size}" if mc and cc else ""
    exists = comp_code in comp
    flags=" | ".join(x for x in [mflag,cflag,("" if exists else "SKU no existe")] if x)
    rows.append(dict(consignatario=consignee,qty=qty,color_raw=craw,modelo_raw=mraw,talla=size,
        modelo=mc or "",color=cc or "",color_nombre=colors.get(cc,""),composite_code=comp_code,
        existe="si" if exists else "NO",flags=flags))

for craw,mraw,size in MELSY: proc("Melsy",1,craw,mraw,size)
for qty,craw,mraw,size in MAGLLY: proc("Maglly",qty,craw,mraw,size)

with open("scripts/consignacion-review.csv","w",newline="") as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)

mel=sum(1 for r in rows if r['consignatario']=='Melsy')
mag=sum(r['qty'] for r in rows if r['consignatario']=='Maglly')
ok=sum(1 for r in rows if r['existe']=='si'); bad=[r for r in rows if r['existe']=='NO']
print(f"Melsy: {mel} u  |  Maglly: {mag} u  |  lineas: {len(rows)}")
print(f"SKU valido: {ok}/{len(rows)} lineas")
print(f"\nLineas con SKU inexistente / a confirmar ({len(bad)}):")
for r in bad: print(f"  [{r['consignatario']}] {r['qty']}x {r['color_raw']} / {r['modelo_raw']} / {r['talla']} -> {r['composite_code'] or '??'}  ({r['flags']})")
print("\nCSV -> scripts/consignacion-review.csv")
