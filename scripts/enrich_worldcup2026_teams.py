#!/usr/bin/env python3
"""
Rebuild worldcup2026_teams.json with FIFA ranking, World Football Elo, and
recent men's A-internationals from the FIFA public calendar API.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "worldcup2026_teams.json"
WORLD_TSV = "http://www.eloratings.net/World.tsv"

WC_CODES = [
    "MEX",
    "RSA",
    "KOR",
    "CZE",
    "CAN",
    "BIH",
    "QAT",
    "SUI",
    "BRA",
    "MAR",
    "HAI",
    "SCO",
    "USA",
    "PAR",
    "AUS",
    "TUR",
    "GER",
    "CUW",
    "CIV",
    "ECU",
    "NED",
    "JPN",
    "SWE",
    "TUN",
    "BEL",
    "EGY",
    "IRN",
    "NZL",
    "ESP",
    "CPV",
    "KSA",
    "URU",
    "FRA",
    "SEN",
    "IRQ",
    "NOR",
    "ARG",
    "ALG",
    "AUT",
    "JOR",
    "POR",
    "COD",
    "UZB",
    "COL",
    "ENG",
    "CRO",
    "GHA",
    "PAN",
]

# eloratings.net 2-letter code in World.tsv → FIFA TLA (WC2026 list)
ELO2_FIFA: dict[str, str] = {
    "MX": "MEX",
    "ZA": "RSA",
    "KR": "KOR",
    "CZ": "CZE",
    "CA": "CAN",
    "BA": "BIH",
    "QA": "QAT",
    "CH": "SUI",
    "BR": "BRA",
    "MA": "MAR",
    "HT": "HAI",
    "SC": "SCO",
    "US": "USA",
    "PY": "PAR",
    "AU": "AUS",
    "TR": "TUR",
    "DE": "GER",
    "CU": "CUW",
    "CI": "CIV",
    "EC": "ECU",
    "NL": "NED",
    "JP": "JPN",
    "SE": "SWE",
    "TN": "TUN",
    "BE": "BEL",
    "EG": "EGY",
    "IR": "IRN",
    "NZ": "NZL",
    "ES": "ESP",
    "CV": "CPV",
    "SA": "KSA",
    "UY": "URU",
    "FR": "FRA",
    "SN": "SEN",
    "IQ": "IRQ",
    "NO": "NOR",
    "AR": "ARG",
    "DZ": "ALG",
    "AT": "AUT",
    "JO": "JOR",
    "PT": "POR",
    "CD": "COD",
    "UZ": "UZB",
    "CO": "COL",
    "EN": "ENG",
    "HR": "CRO",
    "GH": "GHA",
    "PA": "PAN",
}

# FIFA world rank (Apr 2026 ordering — ESPN / press tables).
FIFA_RANK: dict[str, int] = {
    "FRA": 1,
    "ESP": 2,
    "ARG": 3,
    "ENG": 4,
    "POR": 5,
    "BRA": 6,
    "NED": 7,
    "MAR": 8,
    "BEL": 9,
    "GER": 10,
    "CRO": 11,
    "COL": 13,
    "SEN": 14,
    "MEX": 15,
    "USA": 16,
    "URU": 17,
    "JPN": 18,
    "SUI": 19,
    "IRN": 21,
    "TUR": 22,
    "ECU": 23,
    "AUT": 24,
    "KOR": 25,
    "AUS": 27,
    "ALG": 28,
    "EGY": 29,
    "CAN": 30,
    "NOR": 31,
    "PAN": 33,
    "CIV": 34,
    "SWE": 38,
    "PAR": 40,
    "CZE": 41,
    "SCO": 43,
    "TUN": 44,
    "COD": 46,
    "UZB": 50,
    "QAT": 55,
    "IRQ": 57,
    "RSA": 60,
    "KSA": 61,
    "JOR": 63,
    "BIH": 65,
    "CPV": 69,
    "GHA": 74,
    "CUW": 82,
    "HAI": 83,
    "NZL": 85,
}

FIFA_POINTS_EXACT: dict[str, float] = {
    "FRA": 1877.32,
    "ESP": 1876.4,
    "ARG": 1874.81,
    "ENG": 1825.97,
    "POR": 1763.83,
    "BRA": 1761.16,
    "NED": 1757.87,
    "MAR": 1755.87,
    "BEL": 1734.71,
    "GER": 1730.37,
    "CRO": 1717.07,
    "COL": 1693.09,
    "SEN": 1688.99,
    "MEX": 1681.03,
    "USA": 1673.13,
    "URU": 1673.07,
    "JPN": 1660.43,
    "SUI": 1649.4,
}


def fifa_points_for_rank(rank: int) -> float:
    """Linear segments between published-style anchors (rank 20 / 50 / 85)."""
    r20, p20 = 20, 1620.81
    r50, p50 = 50, 1408.0
    r85, p85 = 85, 1163.0
    if rank <= r20:
        return round(p20 - (r20 - rank) * 8.5, 2)
    if rank <= r50:
        t = (rank - r20) / (r50 - r20)
        return round(p20 + t * (p50 - p20), 2)
    if rank <= r85:
        t = (rank - r50) / (r85 - r50)
        return round(p50 + t * (p85 - p50), 2)
    return round(p85 - (rank - r85) * 4.0, 2)


def fifa_points(code: str) -> float:
    if code in FIFA_POINTS_EXACT:
        return FIFA_POINTS_EXACT[code]
    return fifa_points_for_rank(FIFA_RANK[code])


def load_elo() -> dict[str, tuple[int, int]]:
    req = urllib.request.Request(WORLD_TSV, headers={"User-Agent": "wc2026-enrich/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        lines = r.read().decode("utf-8", errors="replace").strip().splitlines()
    out: dict[str, tuple[int, int]] = {}
    for line in lines:
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        try:
            wr = int(parts[0])
            elo = int(parts[3])
        except ValueError:
            continue
        elc = parts[2].strip().upper()
        tla = ELO2_FIFA.get(elc)
        if tla and tla in FIFA_RANK:
            out[tla] = (wr, elo)
    return out


def fetch_fifa_day(day: str, max_pages: int = 60) -> list[dict]:
    """One calendar day; continuation tokens repeat the same slice — stop when no new IdMatch."""
    next_day = (date.fromisoformat(day) + timedelta(days=1)).isoformat()
    rows: list[dict] = []
    seen: set[str] = set()
    token: str | None = None
    for _ in range(max_pages):
        q: dict[str, str] = {"from": day, "to": next_day, "language": "en"}
        if token:
            q["ContinuationToken"] = token
        url = "https://api.fifa.com/api/v3/calendar/matches?" + urlencode(q)
        req = urllib.request.Request(url, headers={"User-Agent": "wc2026-enrich/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read().decode())
        new = 0
        for m in data.get("Results") or []:
            mid = m.get("IdMatch")
            if mid and mid not in seen:
                seen.add(mid)
                rows.append(m)
                new += 1
        token = data.get("ContinuationToken")
        if not token or new == 0:
            break
    return rows


def fetch_fifa_calendar(date_from: str, date_to: str) -> list[dict]:
    d0 = date.fromisoformat(date_from)
    d1 = date.fromisoformat(date_to)
    merged: list[dict] = []
    seen: set[str] = set()
    d = d0
    while d <= d1:
        ds = d.isoformat()
        for m in fetch_fifa_day(ds):
            mid = m.get("IdMatch")
            if mid and mid not in seen:
                seen.add(mid)
                merged.append(m)
        d += timedelta(days=1)
        time.sleep(0.04)
    return merged


def norm_comp(cn: list | None) -> str:
    if not cn:
        return ""
    x = cn[0]
    return (x.get("Description") if isinstance(x, dict) else "") or ""


def build_matches(raw: list[dict], wc: set[str], date_from: str, date_to: str) -> dict[str, list[dict]]:
    seen: set[str] = set()
    by_team: dict[str, list[dict]] = defaultdict(list)

    for m in raw:
        mid = m.get("IdMatch")
        if not mid or mid in seen:
            continue
        h, a = m.get("Home"), m.get("Away")
        if not h or not a:
            continue
        if h.get("TeamType") != 1 or a.get("TeamType") != 1:
            continue
        if h.get("Gender") != 1 or a.get("Gender") != 1:
            continue
        hc, ac = h.get("IdCountry"), a.get("IdCountry")
        if not hc or not ac or hc == ac:
            continue
        if hc not in wc and ac not in wc:
            continue
        dt = (m.get("Date") or "")[:10]
        if dt < date_from or dt > date_to:
            continue
        seen.add(mid)
        comp = norm_comp(m.get("CompetitionName")).strip()
        hn = (h.get("TeamName") or [{}])[0].get("Description", hc)
        an = (a.get("TeamName") or [{}])[0].get("Description", ac)
        sh, sa = m.get("HomeTeamScore"), m.get("AwayTeamScore")

        def one(code: str, opp: str, role: str, on: str) -> dict:
            return {
                "date": dt,
                "competition": comp,
                "role": role,
                "opponent": {"code": opp, "nameEn": on},
                "score": {"for": sh if role == "home" else sa, "against": sa if role == "home" else sh},
                "fifaMatchId": mid,
            }

        if hc in wc:
            by_team[hc].append(one(hc, ac, "home", an))
        if ac in wc:
            by_team[ac].append(one(ac, hc, "away", hn))

    for tla in by_team:
        by_team[tla].sort(key=lambda x: x["date"], reverse=True)
    return by_team


def summarize(ms: list[dict]) -> dict:
    p = w = d = l = gf = ga = 0
    for m in ms:
        sf, sa = m["score"]["for"], m["score"]["against"]
        if sf is None or sa is None:
            continue
        p += 1
        gf += sf
        ga += sa
        if sf > sa:
            w += 1
        elif sf == sa:
            d += 1
        else:
            l += 1
    return {"played": p, "wins": w, "draws": d, "losses": l, "goalsFor": gf, "goalsAgainst": ga}


def main() -> None:
    date_from = "2025-11-03"
    date_to = "2026-05-03"
    wc = set(WC_CODES)

    print("Loading Elo…", file=sys.stderr)
    elo_map = load_elo()

    print("Fetching FIFA calendar (daily slices, ~3 min)…", file=sys.stderr)
    try:
        raw = fetch_fifa_calendar(date_from, date_to)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"FIFA fetch failed: {e}", file=sys.stderr)
        raw = []

    by_team = build_matches(raw, wc, date_from, date_to)

    cur = json.loads(OUT.read_text(encoding="utf-8"))
    by_code = {t["code"]: t for t in cur["teams"]}
    merged = []
    for code in WC_CODES:
        base = dict(by_code[code])
        fr = FIFA_RANK[code]
        fp = fifa_points(code)
        er, elo = elo_map.get(code, (None, None))
        ms = by_team.get(code, [])
        summ = summarize(ms)
        fr_entry: dict = {"worldRank": fr, "points": fp, "asOf": "2026-04-01"}
        if code not in FIFA_POINTS_EXACT:
            fr_entry["pointsNote"] = "interpolated from FIFA anchor ranks; verify on fifa.com"
        base["fifaRanking"] = fr_entry
        if er is not None:
            base["worldFootballElo"] = {
                "worldRank": er,
                "rating": elo,
                "asOf": date_to,
                "source": "eloratings.net/World.tsv",
            }
        base["recentInternational"] = {
            "window": {"from": date_from, "to": date_to},
            "summary": summ,
            "matches": ms[:24],
            "source": "api.fifa.com/api/v3/calendar/matches",
        }
        merged.append(base)

    meta = dict(cur["meta"])
    meta["generated"] = date_to
    meta["fifaRankingAsOf"] = "2026-04-01"
    meta["internationalWindow"] = {"from": date_from, "to": date_to}
    meta["sourceNote"] = (
        "抽签分组参考维基/FIFA 小组赛表。"
        "FIFA 名次为 2026-04-01 周期公开报道次序；积分数维基已公布的队伍用官方值，其余按名次锚点插值，正式用途请以 fifa.com 为准。"
        "Elo 为世界足球等级分（eloratings）。"
        "比赛为 FIFA 公开日历接口内、窗口期内、双方 IdCountry 不同的男足成年队场次（不含俱乐部联赛）；可能仍有遗漏赛事。"
    )

    OUT.write_text(json.dumps({"meta": meta, "teams": merged}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({len(merged)} teams, {len(raw)} FIFA calendar rows)")


if __name__ == "__main__":
    main()
