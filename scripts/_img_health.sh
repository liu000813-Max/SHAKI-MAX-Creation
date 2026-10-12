#!/usr/bin/env bash
# How much of the detail-image library actually exists, and does it carry specs?
#
# Two numbers decide whether vision enrichment is worth anything:
#   - reachability: a 404 image cannot be read by any model, so it is not data;
#   - we cannot measure "has specs" by URL, so this reports coverage per product and leaves the
#     content judgement to the samples already inspected by eye.
set -u
BASE="https://www.shaki.com"
IDS="${IDS:-1417 1418 1419 1420 1421 1422 1424 1430 1431 1443 1457}"
total=0; ok=0
for id in $IDS; do
  page=$(curl -s -m 25 "$BASE/products/detail?id=$id")
  title=$(printf '%s' "$page" | grep -o '<title>[^<]*' | head -1 | sed 's/<title>//' | cut -c1-28)
  imgs=$(printf '%s' "$page" | grep -o 'uploads/albums/[0-9]*/[A-Za-z0-9_.-]*' | grep -Ei '\.(jpg|jpeg|png|gif|webp)$' | sort -u)
  n=0; g=0
  for i in $imgs; do
    n=$((n+1))
    code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' "$BASE/$i")
    if [ "$code" = "200" ]; then g=$((g+1)); fi
  done
  total=$((total+n)); ok=$((ok+g))
  printf "%-6s %-30s images %2s  alive %2s\n" "$id" "$title" "$n" "$g"
done
alive_pct=$(awk "BEGIN{printf \"%.0f\", $ok*100/$total}")
printf "\nTOTAL images %s | alive %s | dead %s (%s%% alive)\n" "$total" "$ok" "$((total-ok))" "$alive_pct"