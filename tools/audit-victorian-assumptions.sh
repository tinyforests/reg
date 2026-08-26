#!/usr/bin/env bash
# Audit Victorian-specific assumptions embedded in REG.
#
#   cd ~/Projects/reg && bash /path/to/audit-victorian-assumptions.sh
#
# Writes AUDIT-VIC-ASSUMPTIONS.txt. Every hit is a decision, not a defect —
# some Victorian references are correct (a Victorian garden's stored EVC is
# Victorian data and should stay that way). What matters is which layer the
# hit is in.

set -uo pipefail
OUT="AUDIT-VIC-ASSUMPTIONS.txt"
: > "$OUT"

section () { printf '\n\n===== %s =====\n\n' "$1" >> "$OUT"; }
# --exclude the output file itself: OUT lives in the repo, so scanning '.' would
# otherwise read grep's own growing output recursively (it once reached 16 GB and
# filled the disk). Also skip AUDIT-* generally.
scan () { grep -rniI --exclude-dir={.git,node_modules,data/private} --exclude="$OUT" --exclude='AUDIT-*' -e "$1" . >> "$OUT" 2>/dev/null || true; }

section "TIER 1 — CORE LOGIC (must be jurisdiction-neutral)"
echo "Scoring engine and sync pipeline. Any hit here is a blocker." >> "$OUT"
grep -rniI -e 'evc' -e 'naturekit' -e 'vicmap' -e 'habitat.value' -e 'deeca' -e 'delwp' \
  js/reg-score.js scripts/ 2>/dev/null >> "$OUT" || echo "(none)" >> "$OUT"

section "TIER 2 — SCHEMA AND STORED RECORDS"
echo "Garden JSON keys. 'evc' as a top-level key is the main migration target." >> "$OUT"
grep -rhoiI '"[a-z_]*evc[a-z_]*"' data/*.json 2>/dev/null | sort | uniq -c | sort -rn >> "$OUT" || true

section "TIER 3 — VICTORIAN TERMINOLOGY ANYWHERE"
for term in 'EVC' 'NatureKit' 'Vicmap' 'NV2005' 'NV1750' 'EVCBCS' 'Bioregional Conservation Status' \
            'DEECA' 'DELWP' 'Ecological Vegetation Class' 'Victoria' 'Victorian'; do
  printf '\n--- %s ---\n' "$term" >> "$OUT"
  scan "$term"
done

section "TIER 4 — HARD-CODED SERVICE ENDPOINTS"
scan 'arcgis/rest/services'
scan 'vic\.gov\.au'

section "TIER 5 — REGISTRY ID FORMAT"
echo "ER-[STATE]-... is already jurisdiction-parameterised. Confirm nothing" >> "$OUT"
echo "hard-codes the VIC segment." >> "$OUT"
scan 'ER-AU-'

section "TIER 6 — COORDINATES REACHING A LOOKUP"
echo "Any client-side lookup that needs precise lat/lng is a privacy regression" >> "$OUT"
echo "against the 15 Aug coordinate build. These must run at sync time." >> "$OUT"
scan 'coords\.json'
scan 'display_lat'

section "COUNTS"
{
  printf 'files containing "EVC": '
  grep -rliI --exclude-dir={.git,node_modules} 'evc' . 2>/dev/null | wc -l
  printf 'total EVC references:   '
  grep -rniI --exclude-dir={.git,node_modules} 'evc' . 2>/dev/null | wc -l
} >> "$OUT"

echo "Written to $OUT"
