#!/usr/bin/env python3
"""Merge 2026 fantasy football rankings/projections from multiple platforms
into one synthesized dataset (data.js) for the draft app."""
import re, json, unicodedata, statistics as st

SRC = "/tmp/ff2"
F_FFTB_PPR = f"{SRC}/fftb_ppr.txt"
F_FFTB_STD = f"{SRC}/fftb_std.txt"
F_CBS_PPR  = f"{SRC}/cbs_ppr.txt"
F_CBS_STD  = f"{SRC}/cbs_std.txt"
F_FFC_PPR  = f"{SRC}/ffc_ppr.txt"
F_FFC_STD  = f"{SRC}/ffc_std.txt"

TEAM_FIX = {"LVR": "LV", "JAC": "JAX", "WSH": "WAS"}
POS_FIX = {"PK": "K", "DEF": "DST", "D/ST": "DST", "DEFENSE": "DST"}


def fixpos(p):
    p = (p or "").strip().upper()
    return POS_FIX.get(p, p)
SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b\.?", re.I)


def key(name: str) -> str:
    n = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    n = n.lower().replace("'", "").replace(".", "").replace("-", " ")
    n = SUFFIX.sub("", n)
    n = re.sub(r"[^a-z ]", "", n)
    return " ".join(n.split())


def num(s, default=None):
    try:
        return float(str(s).replace(",", "").replace("$", "").strip())
    except Exception:
        return default


# ---------------------------------------------------------------- FFToolbox
def parse_fftoolbox(path):
    out = {}
    for line in open(path, encoding="utf-8", errors="ignore"):
        if not re.match(r"^\|\s*\d+\s*\|", line):
            continue
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        if len(c) < 10:
            continue
        m = re.search(r"\[([^\]]+)\]\(https://fftoolbox[^)]*profile_display[^)]*\)", c[1])
        if not m:
            continue
        name = m.group(1).strip()
        mt = re.search(r"nfl_team=([A-Z]{2,3})", c[3])
        out[pkey(name, fixpos(c[2]), TEAM_FIX.get(mt.group(1), mt.group(1)) if mt else "")] = dict(
            name=name,
            pos=fixpos(c[2]),
            team=TEAM_FIX.get(mt.group(1), mt.group(1)) if mt else "",
            bye=num(c[4]),
            age=num(c[6]),
            rank=int(c[0]),
            adp=num(c[7]),
            auction=num(c[8]),
            proj=num(c[9]),
        )
    return out


# ------------------------------------------------- CBS Sports (draft ADP)
def parse_cbs(path):
    """CBS Sports Average Draft Position table (their own league host data)."""
    out = {}
    row = re.compile(r"^\|\s*(\d+)\s*\|(.*)$")
    # last cell group: | trend | ADP | high/low | pct drafted |
    for line in open(path, encoding="utf-8", errors="ignore"):
        m = row.match(line.strip())
        if not m:
            continue
        rk = int(m.group(1))
        cells = [x.strip() for x in line.strip().strip("|").split("|")]
        if len(cells) < 5:
            continue
        blob = cells[1]
        # the full name appears in the *second* anchor of the cell
        names = re.findall(
            r"\[([^\]]+)\]\(https://www\.cbssports\.com/nfl/players/\d+/[a-z0-9'-]+/fantasy/\)",
            blob)
        if not names:
            continue
        name = max(names, key=len)
        pm = re.search(r"fantasy/\)\s+([A-Z]{1,3})\s+([A-Z]{2,3})\b", blob)
        pos = fixpos(pm.group(1)) if pm else ""
        team = TEAM_FIX.get(pm.group(2), pm.group(2)) if pm else ""
        adp = num(cells[3])
        k = pkey(name, pos, team)
        if k in out:
            continue
        out[k] = dict(rank=rk, name=name, pos=pos, team=team, adp=adp)
    return out


# ------------------------------------------------- FantasyFootballCalculator
def parse_ffc(path):
    out = {}
    for line in open(path, encoding="utf-8", errors="ignore"):
        if not re.match(r"^\|\s*\d+\s*\|", line):
            continue
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        if len(c) < 10:
            continue
        m = re.search(r"\[([^\]]+)\]\(https://fantasyfootballcalculator", c[1])
        if not m:
            continue
        team = c[3].strip().upper()
        out[key(m.group(1))] = dict(
            name=m.group(1).strip(),
            pos=fixpos(c[2]),
            team=TEAM_FIX.get(team, team),
            bye=num(c[4]),
            rank=int(c[0]),
            adp=num(c[5]),
            sd=num(c[6]),
            n=num(c[9]),
        )
    return out


def pkey(name, pos, team):
    """DSTs are named differently by every source - key them by team."""
    if pos == "DST" and team:
        return "dst " + team
    return key(name)


fftb = {"PPR": parse_fftoolbox(F_FFTB_PPR), "STD": parse_fftoolbox(F_FFTB_STD)}
cbs = {"PPR": parse_cbs(F_CBS_PPR), "STD": parse_cbs(F_CBS_STD)}
ffc = {"PPR": parse_ffc(F_FFC_PPR), "STD": parse_ffc(F_FFC_STD)}

print({k: {s: len(v[s]) for s in v} for k, v in
       dict(fftoolbox=fftb, cbs=cbs, ffc=ffc).items()})

# ------------------------------------------------------------------- merge
# CBS slugs are the only name source for CBS; map them onto the union of the
# other two sources so abbreviated CBS names resolve to full names.
players = {}


def touch(k, name=None, pos=None, team=None, bye=None, age=None):
    p = players.setdefault(k, dict(key=k, name=name or k.title(), pos=pos or "",
                                   team=team or "", bye=bye, age=age,
                                   src={"PPR": {}, "STD": {}}))
    if name and (len(name) > len(p["name"]) or p["name"] == k.title()):
        p["name"] = name
    for f, v in (("pos", pos), ("team", team), ("bye", bye), ("age", age)):
        if v and not p.get(f):
            p[f] = v
    return p


for sc in ("PPR", "STD"):
    for k, r in fftb[sc].items():
        p = touch(k, r["name"], r["pos"], r["team"], r["bye"], r["age"])
        p["src"][sc]["fftoolbox"] = dict(rank=r["rank"], proj=r["proj"],
                                         auction=r["auction"], adp=r["adp"])
    for k, r in ffc[sc].items():
        p = touch(k, r["name"], r["pos"], r["team"], r["bye"])
        p["src"][sc]["ffc"] = dict(rank=r["rank"], adp=r["adp"], sd=r["sd"], n=r["n"])
    for k, r in cbs[sc].items():
        p = touch(k, r["name"], r["pos"], r["team"])
        p["src"][sc]["cbs"] = dict(rank=r["rank"], adp=r["adp"])

# ------------------------------------------------------------ synthesis
POOL = 12 * 16          # nominal draftable pool for a 12-team league
SOURCES = ["fftoolbox", "cbs", "ffc"]


def synth(sc):
    # 1. gather ranks; unranked by a source gets a soft penalty rank
    rows = []
    for p in players.values():
        s = p["src"][sc]
        ranks = {n: s[n]["rank"] for n in SOURCES if n in s and s[n].get("rank")}
        if not ranks:
            continue
        rows.append((p, ranks))
    if not rows:
        return
    worst = {n: max([r[n] for _, r in rows if n in r] or [POOL]) for n in SOURCES}
    for p, ranks in rows:
        vals = []
        for n in SOURCES:
            vals.append(ranks[n] if n in ranks else worst[n] + 25)
        p["src"][sc]["_avg"] = round(sum(vals) / len(vals), 2)
        p["src"][sc]["_spread"] = (max(ranks.values()) - min(ranks.values())
                                   if len(ranks) > 1 else None)
        p["src"][sc]["_n"] = len(ranks)
    order = sorted((p for p, _ in rows), key=lambda p: p["src"][sc]["_avg"])
    for i, p in enumerate(order, 1):
        p["src"][sc]["consensus"] = i

    # 2. projections: FFToolbox season points; back-fill missing players by
    #    interpolating that position's own consensus-rank -> points curve.
    curves = {}
    for p in order:
        f = p["src"][sc].get("fftoolbox", {})
        if f.get("proj"):
            curves.setdefault(p["pos"], []).append(
                (p["src"][sc]["consensus"], f["proj"]))
    for v in curves.values():
        v.sort()
    for p in order:
        if p["pos"] in ("K", "DST"):
            p["src"][sc]["proj"] = None
            continue
        f = p["src"][sc].get("fftoolbox", {})
        if f.get("proj"):
            p["src"][sc]["proj"] = f["proj"]
            continue
        curve = curves.get(p["pos"], [])
        if len(curve) < 3:
            p["src"][sc]["proj"] = None
            continue
        c = p["src"][sc]["consensus"]
        lo = max([x for x in curve if x[0] <= c], default=None)
        hi = min([x for x in curve if x[0] >= c], default=None)
        if lo and hi and hi[0] != lo[0]:
            t = (c - lo[0]) / (hi[0] - lo[0])
            v = lo[1] + t * (hi[1] - lo[1])
        elif lo:
            # past the end of the curve: continue the local decay, floor at 60%
            x1, y1 = curve[-2]
            x2, y2 = curve[-1]
            slope = (y2 - y1) / max(1, x2 - x1)
            v = max(y2 * 0.6, y2 + slope * (c - x2))
        elif hi:
            v = hi[1]
        else:
            v = None
        p["src"][sc]["proj"] = round(v, 1) if v else None
        p["src"][sc]["projEst"] = True

    # 3. positional rank + VOR (value over replacement) for a 12-team league
    BASE = {"QB": 14, "RB": 34, "WR": 40, "TE": 13, "K": 13, "DST": 13}
    bypos = {}
    for p in order:
        bypos.setdefault(p["pos"], []).append(p)
    repl = {}
    for pos, lst in bypos.items():
        lst.sort(key=lambda x: x["src"][sc]["consensus"])   # QB1/RB1 = consensus
        for i, p in enumerate(lst, 1):
            p["src"][sc]["posRank"] = i
        # replacement level uses the projection curve, not the consensus order
        proj = sorted((x["src"][sc].get("proj") or 0 for x in lst), reverse=True)
        idx = min(BASE.get(pos, 13), len(proj)) - 1
        repl[pos] = proj[idx] if idx >= 0 else 0
    for p in order:
        pr = p["src"][sc].get("proj")
        p["src"][sc]["vor"] = round(pr - repl.get(p["pos"], 0), 1) if pr else None

    # 4. tiers from consensus-rank gaps within each position
    for pos, lst in bypos.items():
        seq = sorted([x for x in lst if x["src"][sc].get("consensus")],
                     key=lambda x: x["src"][sc]["consensus"])
        tier, prev = 1, None
        for p in seq:
            c = p["src"][sc]["consensus"]
            if prev is not None and c - prev >= max(6, 0.10 * prev):
                tier += 1
            p["src"][sc]["tier"] = tier
            prev = c


for sc in ("PPR", "STD"):
    synth(sc)

out = []
for p in players.values():
    if not (p["src"]["PPR"].get("consensus") or p["src"]["STD"].get("consensus")):
        continue
    if not p["pos"]:
        continue
    out.append(p)
out.sort(key=lambda p: p["src"]["PPR"].get("consensus") or 999)

meta = dict(
    season=2026,
    generated="2026-09-05",
    league=dict(teams=12, rounds=16, snake=True),
    sources=[
        dict(id="fftoolbox", label="Fulltime Fantasy (FFToolbox)",
             kind="Expert rankings + season projections",
             url="https://fftoolbox.fulltimefantasy.com/football/rankings/",
             note="Top-200 board with projected season points and auction values."),
        dict(id="cbs", label="CBS Sports",
             kind="League-host draft ADP",
             url="https://www.cbssports.com/fantasy/football/draft/averages/ppr/both/h2h/all/",
             note="Average draft position across CBS Sports-hosted leagues."),
        dict(id="ffc", label="Fantasy Football Calculator",
             kind="Live 12-team ADP",
             url="https://fantasyfootballcalculator.com/adp/ppr/12-team/all",
             note="Market ADP from 7,430 12-team mock drafts, Aug 29 - Sep 5 2026."),
    ],
)
print("players:", len(out))
payload = json.dumps(dict(meta=meta, players=out), separators=(",", ":"))
open("/tmp/ff2/data.js", "w").write("window.FF_DATA=" + payload + ";")
print("data.js bytes:", len(payload))
for p in out[:12]:
    s = p["src"]["PPR"]
    print(s["consensus"], p["name"], p["pos"], p["team"], "avg=" + str(s["_avg"]),
          "proj=" + str(s.get("proj")), "vor=" + str(s.get("vor")),
          "T" + str(s.get("tier")), "n=" + str(s["_n"]))
print("done")
