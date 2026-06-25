#!/bin/bash
# Smoke test — self-contained, fetches tokens at runtime
API="http://localhost:3001/api"

echo "═══════════════════════════════════════════"
echo "  SMOKE TEST — GreenLeaf POS Phase 1"
echo "═══════════════════════════════════════════"

# ── Login and capture tokens + IDs ──
BUD=$(curl -s $API/auth/login -H 'Content-Type: application/json' -d '{"email":"sipho@greenleaf.co.za","password":"password123"}')
BT=$(echo "$BUD" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
BUD_ID=$(echo "$BUD" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")
LOC_ID=$(echo "$BUD" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['locationId'])")

MAN=$(curl -s $API/auth/login -H 'Content-Type: application/json' -d '{"email":"thandi@greenleaf.co.za","password":"password123"}')
MT=$(echo "$MAN" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
MAN_ID=$(echo "$MAN" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")

echo "1. AUTH: Budtender=$(echo "$BUD" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['fullName'])") | Manager=$(echo "$MAN" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['fullName'])")"
echo "   Location: $LOC_ID"

# ── 2. Search ──
echo ""; echo "2. SEARCH"
S1=$(curl -s "$API/search/products?q=wed+cake&locationId=$LOC_ID" -H "Authorization: Bearer $BT")
echo "   'wed cake': $(echo "$S1" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('results',[]); print(f'{len(r)} results') if r else print('NO RESULTS - response:'); print(json.dumps(d)[:200])")"

S2=$(curl -s "$API/search/products?q=gsc&locationId=$LOC_ID" -H "Authorization: Bearer $BT")
echo "   'gsc': $(echo "$S2" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('results',[]); print(f'{len(r)} results') if r else print(f'KEYS: {list(d.keys())}')")"

S3=$(curl -s "$API/search/products?q=blue+d&locationId=$LOC_ID" -H "Authorization: Bearer $BT")
echo "   'blue d': $(echo "$S3" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('results',[]); print(f'{len(r)} results')")"

# ── 3. Products ──
echo ""; echo "3. PRODUCTS"
PRODS=$(curl -s "$API/products?limit=2" -H "Authorization: Bearer $BT")
P1_ID=$(echo "$PRODS" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])")
P2_ID=$(echo "$PRODS" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][1]['id'])")
echo "   P1: $(echo "$PRODS" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['name'])") ($P1_ID)"
echo "   P2: $(echo "$PRODS" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][1]['name'])") ($P2_ID)"

# Stock before
STOCK_BEFORE=$(curl -s "$API/inventory/$P1_ID?locationId=$LOC_ID" -H "Authorization: Bearer $BT")
QTY_BEFORE=$(echo "$STOCK_BEFORE" | python3 -c "import sys,json; print(json.load(sys.stdin)['quantity'])")
echo "   P1 stock: $QTY_BEFORE"

# ── 4. Cash drawer ──
echo ""; echo "4. CASH DRAWER"
DR=$(curl -s $API/cash-drawer/open -H "Authorization: Bearer $BT" -H 'Content-Type: application/json' -d '{"openingAmount":500}')
DR_ID=$(echo "$DR" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   Opened: $DR_ID (R500)"

# ── 5. CREATE SALE ──
echo ""; echo "5. CREATE SALE"
SALE=$(curl -s $API/transactions -H "Authorization: Bearer $BT" -H 'Content-Type: application/json' -d "{\"locationId\":\"$LOC_ID\",\"budtenderId\":\"$BUD_ID\",\"items\":[{\"productId\":\"$P1_ID\",\"quantity\":1,\"unitPrice\":350.00},{\"productId\":\"$P2_ID\",\"quantity\":2,\"unitPrice\":100.00}],\"discountTotal\":10.00,\"idVerified\":true,\"paymentMethod\":\"cash\",\"cashTendered\":600.00}")
SALE_ID=$(echo "$SALE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
SALE_NUM=$(echo "$SALE" | python3 -c "import sys,json; print(json.load(sys.stdin)['transactionNum'])")
echo "   Sale #$SALE_NUM: $SALE_ID"

# ── 6. Stock decreased ──
STOCK_AFTER=$(curl -s "$API/inventory/$P1_ID?locationId=$LOC_ID" -H "Authorization: Bearer $BT")
QTY_AFTER=$(echo "$STOCK_AFTER" | python3 -c "import sys,json; print(json.load(sys.stdin)['quantity'])")
echo ""; echo "6. STOCK: $QTY_BEFORE → $QTY_AFTER (expected: $(($QTY_BEFORE - 1)))"

# ── 7. Batch trace ──
echo ""; echo "7. BATCH TRACE"
TX_DETAIL=$(curl -s "$API/transactions/$SALE_ID" -H "Authorization: Bearer $BT")
echo "$TX_DETAIL" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'   Status: {d[\"status\"]} | Items: {len(d[\"items\"])}')
for item in d['items']:
    print(f'   Item: {item[\"product\"][\"name\"][:30]} batch={item[\"batch\"][\"lotNumber\"]}')"

# ── 8. VOID ──
echo ""; echo "8. VOID"
VOID=$(curl -s -X POST "$API/transactions/$SALE_ID/void" -H "Authorization: Bearer $BT" -H 'Content-Type: application/json' -d "{\"reason\":\"customer_change\",\"approvedBy\":\"$MAN_ID\"}")
echo "   Result: $(echo "$VOID" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")"

# ── 9. Stock returned ──
STOCK_RETURN=$(curl -s "$API/inventory/$P1_ID?locationId=$LOC_ID" -H "Authorization: Bearer $BT")
QTY_RETURN=$(echo "$STOCK_RETURN" | python3 -c "import sys,json; print(json.load(sys.stdin)['quantity'])")
echo ""; echo "9. STOCK AFTER VOID: $QTY_RETURN (expect: $QTY_BEFORE)"

# ── 10. REFUND ──
echo ""; echo "10. REFUND"
SALE2=$(curl -s $API/transactions -H "Authorization: Bearer $BT" -H 'Content-Type: application/json' -d "{\"locationId\":\"$LOC_ID\",\"budtenderId\":\"$BUD_ID\",\"items\":[{\"productId\":\"$P1_ID\",\"quantity\":1,\"unitPrice\":350.00}],\"discountTotal\":0,\"idVerified\":true,\"paymentMethod\":\"card\",\"cardLastFour\":\"4242\"}")
SALE2_ID=$(echo "$SALE2" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   Sale2: $SALE2_ID"

REFUND=$(curl -s -X POST "$API/transactions/$SALE2_ID/refund" -H "Authorization: Bearer $MT" -H 'Content-Type: application/json' -d '{"reason":"product_issue"}')
echo "   Status: $(echo "$REFUND" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")"

# ── 11. Adjustments (all reason codes) ──
echo ""; echo "11. INVENTORY ADJUSTMENTS"
for reason in damaged gifted internal_use theft expired; do
  ADJ=$(curl -s $API/inventory/adjust -H "Authorization: Bearer $BT" -H 'Content-Type: application/json' -d "{\"productId\":\"$P1_ID\",\"locationId\":\"$LOC_ID\",\"quantity\":-1,\"reasonCode\":\"$reason\",\"notes\":\"Smoke test: $reason\"}")
  echo "   $reason (-1): $(echo "$ADJ" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'ok qty={d.get(\"quantity\",\"ERROR\")}')" 2>&1)"
done
# Correction: positive
CORR=$(curl -s $API/inventory/adjust -H "Authorization: Bearer $BT" -H 'Content-Type: application/json' -d "{\"productId\":\"$P1_ID\",\"locationId\":\"$LOC_ID\",\"quantity\":2,\"reasonCode\":\"correction\",\"notes\":\"Smoke test: correction found stock\"}")
echo "   correction (+2): $(echo "$CORR" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'ok qty={d.get(\"quantity\",\"ERROR\")}')" 2>&1)"

# ── 12. SHRINKAGE REPORT ──
echo ""; echo "12. SHRINKAGE REPORT"
TODAY=$(date -u +%Y-%m-%d)
SHRINK=$(curl -s "$API/reports/shrinkage?from=$TODAY&to=$TODAY&locationId=$LOC_ID" -H "Authorization: Bearer $MT")
echo "$SHRINK" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'   Summary: {d[\"summary\"][\"totalAdjustments\"]} adjustments, {d[\"summary\"][\"totalUnits\"]} units, R{d[\"summary\"][\"totalLossValue\"]:.2f} loss')
for r in d.get('byReason',[]):
    print(f'     {r[\"reasonCode\"]:15s}: {r[\"adjustmentCount\"]} adj, {r[\"totalUnits\"]} units, R{r[\"estimatedLossValue\"]:.2f}')
c=d.get('corrections',{})
print(f'   Corrections: found={c.get(\"unitsFound\",0)}, lost={c.get(\"unitsLost\",0)}, net={c.get(\"netUnits\",0)} units, R{c.get(\"netValue\",0):.2f}')"

# ── 13. Verify correction NOT in byReason ──
echo ""; echo "13. CORRECTION EXCLUDED FROM LOSS"
echo "$SHRINK" | python3 -c "
import sys,json
d=json.load(sys.stdin)
reasons=[r['reasonCode'] for r in d.get('byReason',[])]
print(f'   Loss reasons: {reasons}')
print(f'   correction in loss: {\"correction\" in reasons}')"

# ── 14. Daily sales ──
echo ""; echo "14. DAILY SALES"
DAILY=$(curl -s "$API/reports/daily-sales?date=$TODAY&locationId=$LOC_ID" -H "Authorization: Bearer $MT")
echo "$DAILY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
s=d['summary']
print(f'   Txns: {s[\"totalTransactions\"]} | Gross: R{s[\"grossSales\"]:.2f} | Tax: R{s[\"totalTax\"]:.2f} | Net: R{s[\"netSales\"]:.2f}')"

# ── 15. Voids/refunds ──
echo ""; echo "15. VOID & REFUND LOG"
VOIDS=$(curl -s "$API/reports/voids-refunds?from=$TODAY&to=$TODAY&locationId=$LOC_ID" -H "Authorization: Bearer $MT")
echo "$VOIDS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'   Total: {d[\"total\"]}')
for item in d.get('items',[]):
    print(f'   #{item[\"transactionNum\"]} {item[\"status\"]:15s} R{item[\"grandTotal\"]:.2f} — {item[\"voidReason\"]}')"

# ── 16. Close drawer ──
echo ""; echo "16. CLOSE DRAWER"
CLOSE=$(curl -s -X POST "$API/cash-drawer/$DR_ID/close" -H "Authorization: Bearer $BT" -H 'Content-Type: application/json' -d '{"closingAmount":490}')
echo "$CLOSE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'   Expected: R{d[\"expectedAmount\"]} | Actual: R{d[\"closingAmount\"]} | Diff: R{d[\"difference\"]}')"

echo ""; echo "═══════════════════════════════════════════"
echo "  SMOKE TEST COMPLETE"
echo "═══════════════════════════════════════════"
