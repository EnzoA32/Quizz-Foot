"""Télécharge le dataset ouvert dcaribou/transfermarkt-datasets (CC0) et produit data/db.json.
Usage : python scripts/build-data.py   (TM_BASE=... pour une autre source)
Affiche les colonnes réelles de chaque fichier pour pouvoir ajuster si besoin."""
import csv, gzip, io, json, os, sys, urllib.request, datetime, collections
B = os.environ.get("TM_BASE", "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/")
csv.field_size_limit(10**7)

def rows(name):
    with urllib.request.urlopen(B + name + ".csv.gz") as r:
        t = io.TextIOWrapper(gzip.GzipFile(fileobj=r), encoding="utf-8", newline="")
        rd = csv.DictReader(t)
        print(name, "colonnes:", rd.fieldnames, file=sys.stderr)
        for x in rd:
            yield x

def g(r, *keys):
    for k in keys:
        v = r.get(k)
        if v not in (None, "", "NA"):
            return v
    return None

def num(v):
    try: return float(v)
    except Exception: return None

clubs = {}
for r in rows("clubs"):
    i, n = g(r, "club_id"), g(r, "name", "club_name")
    if i and n: clubs[i] = n

players, links = {}, collections.defaultdict(set)
for r in rows("players"):
    i = g(r, "player_id")
    if not i: continue
    mv = num(g(r, "highest_market_value_in_eur", "market_value_in_eur")) or 0
    players[i] = [g(r, "name", "player_name") or "", g(r, "position", "sub_position") or "",
                  g(r, "country_of_citizenship", "citizenship") or "", [], round(mv / 1e6, 1)]
    c = g(r, "current_club_id")
    if c:
        links[i].add(c)
        n = g(r, "current_club_name")
        if n and c not in clubs: clubs[c] = n

tr = []
for r in rows("transfers"):
    p, f, t = g(r, "player_id"), g(r, "from_club_id"), g(r, "to_club_id")
    if not p: continue
    for cid, nm in ((f, g(r, "from_club_name")), (t, g(r, "to_club_name"))):
        if cid:
            links[p].add(cid)
            if nm and cid not in clubs: clubs[cid] = nm
    fee = num(g(r, "transfer_fee"))
    if fee and fee > 0 and f and t:
        tr.append([p, f, t, (g(r, "transfer_date") or "")[:4], round(fee / 1e6, 2)])

st = {}
miss = False
for r in rows("appearances"):
    p, c = g(r, "player_id"), g(r, "player_club_id", "club_id")
    if not c:
        miss = True; continue
    k = p + ":" + c
    v = st.setdefault(k, [0, 0, 0])
    v[0] += int(num(g(r, "goals")) or 0); v[1] += int(num(g(r, "assists")) or 0); v[2] += 1
if miss: print("ATTENTION : colonne du club introuvable dans appearances", file=sys.stderr)
st = {k: v for k, v in st.items() if v[0] or v[1]}

for i, s in links.items():
    if i in players: players[i][3] = sorted(s)
players = {i: p for i, p in players.items() if p[0]}
used = {c for p in players.values() for c in p[3]} | {x for t in tr for x in t[1:3]} | {k.split(":")[1] for k in st}
out = {"built": datetime.date.today().isoformat(), "clubs": {c: n for c, n in clubs.items() if c in used},
       "players": players, "tr": tr, "st": st}
os.makedirs("data", exist_ok=True)
with open("data/db.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("OK", len(players), "joueurs", len(tr), "transferts payants", len(st), "stats", file=sys.stderr)
