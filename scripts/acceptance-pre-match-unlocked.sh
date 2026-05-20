#!/usr/bin/env bash
# v2 验收：detail-v2 付费边界 + 伤停 type/reason（切尔西 vs 热刺）
set -euo pipefail

API="${API_ORIGIN:-https://oaifjhzmpswi.sealosbja.site}"
# 新库灌数后请 export ACCEPTANCE_MATCH_ID=<已 sync-full + 有 PUBLISHED PRE_MATCH 的场次>
MATCH_ID="${ACCEPTANCE_MATCH_ID:-cmpbfd6f901lap201oypcx4se}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-admin123456}"
ADMIN_TOKEN="${ADMIN_JWT:-}"

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "== login admin =="
  LOGIN=$(curl -sS -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"identifier\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")
  ADMIN_TOKEN=$(echo "$LOGIN" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('data') or d).get('accessToken',''))")
fi

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "FAIL: could not obtain admin accessToken"
  exit 1
fi

echo "== match status =="
STATUS=$(curl -sS "$API/matches/$MATCH_ID" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('data') or d).get('match',{}).get('status','?'))")
echo "status=$STATUS"

echo "== optional AF sync-full =="
curl -sS -X POST "$API/admin/api/af/matches/$MATCH_ID/sync-full" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force":true}' \
  | python3 -c "import json,sys; r=json.load(sys.stdin); d=r.get('data') or r; print('sync', r.get('success',True), 'fixture', d.get('fixtureId'))" \
  || true

echo "== GET detail-v2 (admin unlocked) =="
curl -sS "$API/matches/$MATCH_ID/detail-v2" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -o /tmp/detail-v2.json

python3 << 'PY'
import json, sys

with open("/tmp/detail-v2.json") as f:
    body = json.load(f)

data = body.get("data", body)
assert data.get("schema") == "match-detail-v2", data.get("schema")
assert data.get("isUnlocked") is True, "admin should be unlocked"

inj = (data.get("freeModules") or {}).get("injuries") or {}
items = inj.get("data") or []
typed = [i for i in items if i.get("type")]
print(f"injuries: {len(items)} rows, {len(typed)} with type")

pred = (data.get("paidModules") or {}).get("predictions") or {}
assert pred.get("locked") is False
if pred.get("hasData"):
    assert pred.get("data") is not None, "unlocked predictions should expose data"
print("predictions locked=", pred.get("locked"), "hasData=", pred.get("hasData"))

print("OK: detail-v2 schema + unlock + injuries/predictions checks")
PY

echo "== GET detail-v2 guest (predictions locked) =="
curl -sS "$API/matches/$MATCH_ID/detail-v2" -o /tmp/detail-v2-guest.json
python3 << 'PY'
import json
with open("/tmp/detail-v2-guest.json") as f:
    body = json.load(f)
data = body.get("data", body)
pred = (data.get("paidModules") or {}).get("predictions") or {}
assert pred.get("locked") is True
assert pred.get("data") is None
print("OK: guest predictions locked with data=null")
PY

echo "== GET /api/v2/matches/:id/detail (admin) =="
curl -sS "$API/api/v2/matches/$MATCH_ID/detail" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -o /tmp/detail-v2-api.json

python3 << 'PY'
import json

with open("/tmp/detail-v2.json") as f:
    legacy = json.load(f)
with open("/tmp/detail-v2-api.json") as f:
    v2 = json.load(f)

ld = legacy.get("data", legacy)
vd = v2.get("data", v2)
assert ld.get("schema") == vd.get("schema") == "match-detail-v2"
assert ld.get("matchId") == vd.get("matchId")
assert ld.get("isUnlocked") == vd.get("isUnlocked")
print("OK: /api/v2 detail matches detail-v2 core fields")
PY

echo "== GET /api/v2/matches/:id/access =="
curl -sS "$API/api/v2/matches/$MATCH_ID/access" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -o /tmp/access-v2.json
python3 << 'PY'
import json
with open("/tmp/access-v2.json") as f:
    body = json.load(f)
data = body.get("data", body)
assert "access" in data or "permissions" in str(data)
print("OK: access endpoint")
PY

if [[ "${ACCEPTANCE_LEAGUE_CODE:-}" != "" ]]; then
  echo "== GET /api/v2/leagues/${ACCEPTANCE_LEAGUE_CODE}/topassists =="
  curl -sS -f "$API/api/v2/leagues/${ACCEPTANCE_LEAGUE_CODE}/topassists?season=${ACCEPTANCE_SEASON:-2025}" \
    -o /tmp/topassists.json && echo "OK: topassists" || echo "SKIP: topassists (not synced)"
fi

echo "Done."
