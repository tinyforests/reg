"""
reg_score.py
Ecological Registry Scoring Engine -- Gardener & Son v1.0

Python port of js/reg-score.js. Logic must remain identical.
If this file and reg-score.js drift, reg-score.js wins and this file is re-synced.

Five pillars, 100 points total:
  Biodiversity Structure   25 pts
  Soil & Water Function    20 pts
  Habitat Complexity       20 pts
  Connectivity             20 pts
  Evidence & Verification  15 pts

Usage:
  python reg_score.py <garden.json>
"""

import json
import math
import sys


def _js_round(x):
    """Match JavaScript Math.round (round half toward +infinity)."""
    return math.floor(x + 0.5)


def score_biodiversity(record):
    b = record.get('biodiversity') or {}
    score = 0

    sp = b.get('indigenous_species_current') or 0
    if sp >= 30:      score += 10
    elif sp >= 20:    score += 8
    elif sp >= 12:    score += 6
    elif sp >= 6:     score += 4
    elif sp >= 1:     score += 2

    if b.get('indigenous_dominant'):
        score += 4

    ly = b.get('structural_layers_current') or 0
    if ly >= 5:       score += 6
    elif ly >= 4:     score += 5
    elif ly >= 3:     score += 3
    elif ly >= 2:     score += 1

    ca = b.get('canopy_cover_pct_current') or 0
    if ca >= 50:      score += 5
    elif ca >= 30:    score += 4
    elif ca >= 15:    score += 2
    elif ca >= 5:     score += 1

    return min(score, 25)


def score_soil_water(record):
    sw = record.get('soil_water') or {}
    score = 0

    soil = sw.get('soil_health_score') or 0
    score += _js_round((soil / 5) * 8)

    water = sw.get('water_function_score') or 0
    score += _js_round((water / 5) * 7)

    if sw.get('has_rainwater_system'):  score += 2
    if sw.get('has_moisture_basin'):    score += 2
    if sw.get('has_swale'):             score += 1

    return min(score, 20)


def score_habitat(record):
    h = record.get('habitat') or {}
    score = 0

    nd = h.get('habitat_nodes') or 0
    if nd >= 5:       score += 6
    elif nd >= 3:     score += 4
    elif nd >= 1:     score += 2

    if h.get('has_embedded_logs'):  score += 3
    if h.get('has_rock_refuges'):   score += 2
    if h.get('has_water_feature'):  score += 3
    if h.get('has_nest_boxes'):     score += 2

    sightings = h.get('fauna_sightings') or []
    fauna = sum(1 for s in sightings if s.get('verified'))
    if fauna >= 3:    score += 4
    elif fauna >= 1:  score += 3

    return min(score, 20)


def score_connectivity(record):
    c = record.get('connectivity') or {}
    score = 0

    if c.get('adjacent_park'):
        dist = c.get('park_distance_m') or 999
        if dist <= 50:      score += 6
        elif dist <= 150:   score += 4
        elif dist <= 300:   score += 2

    adj_gardens = c.get('adjacent_registered_gardens') or []
    adj = sum(1 for g in adj_gardens if g.get('verified'))
    if adj >= 3:      score += 6
    elif adj >= 2:    score += 4
    elif adj >= 1:    score += 3

    if c.get('corridor_node_confirmed'):
        score += 5

    cluster_ha = c.get('cluster_area_ha') or 0
    if cluster_ha >= 2:     score += 3
    elif cluster_ha >= 1:   score += 1

    return min(score, 20)


def score_evidence(record):
    e = record.get('evidence') or {}
    score = 0

    if e.get('has_photos'):                  score += 2
    if e.get('has_field_notes'):             score += 2
    if e.get('has_species_list'):            score += 2
    if e.get('has_fauna_record'):            score += 2
    if e.get('has_professional_assessment'): score += 3

    vl = e.get('verification_level') or ''
    if vl == 'gardener_and_son_verified':   score += 4
    elif vl == 'site_visit':                score += 3
    elif vl == 'photo_verified':            score += 1

    return min(score, 15)


def score_ecological_registry(record):
    bio = score_biodiversity(record)
    sw  = score_soil_water(record)
    hab = score_habitat(record)
    con = score_connectivity(record)
    ev  = score_evidence(record)
    return {
        'total':        bio + sw + hab + con + ev,
        'biodiversity': bio,
        'soil_water':   sw,
        'habitat':      hab,
        'connectivity': con,
        'evidence':     ev,
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python reg_score.py <garden.json>', file=sys.stderr)
        sys.exit(1)
    with open(sys.argv[1]) as f:
        record = json.load(f)
    print(json.dumps(score_ecological_registry(record)))
