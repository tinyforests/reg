"""
reg_opportunities.py
Ecological Registry - Opportunity Engine (Python parity port) · v1.1

Faithful port of js/reg-opportunities.js. The JS module is the source of truth
used by the site; this port exists so the opportunity logic can be cross-checked
the same way reg_score.py cross-checks reg-score.js. Point values are computed by
applying each candidate change to a copy of the record and re-running
score_ecological_registry(), so opportunities can never drift from the score.

Mirrors the three-path delivery model: every opportunity carries delivery_options
(a list of {path, cost}); designer_install options are stripped unless the garden
carries managed_by.type == 'designer'.

Run parity:  python scripts/test_opportunities_parity.py
"""

import copy

try:
    from reg_score import score_ecological_registry
except ImportError:  # when imported from repo root
    from scripts.reg_score import score_ecological_registry


WEIGHTS = {
    'effort': {'quick': 1.25, 'moderate': 1.0, 'project': 0.7},
    'weakPillarBoost': 0.6,
    'tierProximityBonus': 4,
    'tierProximityWindow': 12,
}

DELIVERY_PATH_LABEL = {
    'diy': 'DIY', 'plants_of_place': 'Plants of Place', 'gs_install': 'G&S install',
    'designer_install': 'Designer install', 'tend': 'Tend', 'verification': 'Verification',
}

PILLAR_MAX = {'biodiversity': 25, 'soil_water': 20, 'habitat': 20, 'connectivity': 20, 'evidence': 15}
PILLAR_LABEL = {
    'biodiversity': 'Biodiversity Structure', 'soil_water': 'Soil & Water',
    'habitat': 'Habitat Complexity', 'connectivity': 'Connectivity', 'evidence': 'Evidence & Verification',
}
TIERS = [
    (21, 'Habitat Garden'), (41, 'Ecological Garden'), (61, 'Registered Ecological Garden'),
    (81, 'High Habitat Garden'), (91, 'Urban Biodiversity Node'),
]


def _group_of(pillar, delivery_options):
    if pillar == 'evidence':
        return 'record'
    if len(delivery_options) == 1 and delivery_options[0]['path'] == 'verification':
        return 'record'
    return 'ecological'


def _total(record):
    return score_ecological_registry(record)['total']


def _next_threshold(val, steps):
    for s in steps:
        if val < s:
            return s
    return None


def _next_tier(score):
    for minv, name in TIERS:
        if score < minv:
            return {'name': name, 'target': minv, 'gap': minv - score}
    return None


def _catalogue(record):
    b = record.get('biodiversity', {}); sw = record.get('soil_water', {})
    h = record.get('habitat', {}); c = record.get('connectivity', {}); e = record.get('evidence', {})
    evc = record.get('evc', {})
    species_target = b.get('indigenous_species_target') or 40
    canopy_target = b.get('canopy_cover_pct_target') or 50
    C = []

    # --- Biodiversity ---
    sp_next = _next_threshold(b.get('indigenous_species_current', 0), [6, 12, 20, 30])
    if sp_next is not None and b.get('indigenous_species_current', 0) < species_target:
        add_n = sp_next - (b.get('indigenous_species_current', 0))
        C.append({
            'id': 'species_to_%d' % sp_next, 'pillar': 'biodiversity',
            'label': 'Add %d indigenous species (to %d)' % (add_n, sp_next),
            'effort': 'moderate',
            'delivery_options': [{'path': 'plants_of_place', 'cost': '$$'}],
            'mutate': lambda r, v=sp_next: r['biodiversity'].__setitem__('indigenous_species_current', v)})
    if not b.get('indigenous_dominant'):
        C.append({
            'id': 'indigenous_dominant', 'pillar': 'biodiversity', 'effort': 'project',
            'delivery_options': [{'path': 'gs_install', 'cost': '$$'}, {'path': 'designer_install', 'cost': '$$'}],
            'mutate': lambda r: r['biodiversity'].__setitem__('indigenous_dominant', True)})
    ly_next = _next_threshold(b.get('structural_layers_current', 0), [2, 3, 4, 5])
    if ly_next is not None:
        C.append({
            'id': 'layers_to_%d' % ly_next, 'pillar': 'biodiversity', 'effort': 'project',
            'delivery_options': [{'path': 'diy', 'cost': '$'}, {'path': 'gs_install', 'cost': '$$'}, {'path': 'designer_install', 'cost': '$$'}],
            'mutate': lambda r, v=ly_next: r['biodiversity'].__setitem__('structural_layers_current', v)})
    ca_next = _next_threshold(b.get('canopy_cover_pct_current', 0), [5, 15, 30, 50])
    if ca_next is not None and ca_next <= canopy_target + 5:
        C.append({
            'id': 'canopy_to_%d' % ca_next, 'pillar': 'biodiversity', 'effort': 'project', 'season': 'Autumn–winter planting',
            'delivery_options': [{'path': 'diy', 'cost': '$'}, {'path': 'gs_install', 'cost': '$$$'}, {'path': 'designer_install', 'cost': '$$$'}],
            'mutate': lambda r, v=ca_next: r['biodiversity'].__setitem__('canopy_cover_pct_current', v)})

    # --- Soil & Water ---
    if sw.get('soil_health_score', 0) < (sw.get('soil_health_max') or 5):
        C.append({
            'id': 'soil_health_up', 'pillar': 'soil_water', 'effort': 'moderate',
            'delivery_options': [{'path': 'diy', 'cost': '$'}, {'path': 'tend', 'cost': '$$'}],
            'mutate': lambda r: r['soil_water'].__setitem__('soil_health_score', (r['soil_water'].get('soil_health_score', 0)) + 1)})
    if sw.get('water_function_score', 0) < (sw.get('water_function_max') or 5):
        C.append({
            'id': 'water_function_up', 'pillar': 'soil_water', 'effort': 'moderate',
            'delivery_options': [{'path': 'diy', 'cost': '$'}, {'path': 'gs_install', 'cost': '$$'}, {'path': 'designer_install', 'cost': '$$'}],
            'mutate': lambda r: r['soil_water'].__setitem__('water_function_score', (r['soil_water'].get('water_function_score', 0)) + 1)})
    if not sw.get('has_moisture_basin'):
        C.append({'id': 'moisture_basin', 'pillar': 'soil_water', 'effort': 'moderate',
                  'delivery_options': [{'path': 'diy', 'cost': '$'}, {'path': 'gs_install', 'cost': '$$'}, {'path': 'designer_install', 'cost': '$$'}],
                  'mutate': lambda r: r['soil_water'].__setitem__('has_moisture_basin', True)})
    if not sw.get('has_rainwater_system'):
        C.append({'id': 'rainwater', 'pillar': 'soil_water', 'effort': 'moderate',
                  'delivery_options': [{'path': 'diy', 'cost': '$'}, {'path': 'gs_install', 'cost': '$$'}, {'path': 'designer_install', 'cost': '$$'}],
                  'mutate': lambda r: r['soil_water'].__setitem__('has_rainwater_system', True)})
    if not sw.get('has_swale'):
        C.append({'id': 'swale', 'pillar': 'soil_water', 'effort': 'moderate',
                  'delivery_options': [{'path': 'diy', 'cost': '$'}, {'path': 'gs_install', 'cost': '$$'}, {'path': 'designer_install', 'cost': '$$'}],
                  'mutate': lambda r: r['soil_water'].__setitem__('has_swale', True)})

    # --- Habitat ---
    nd_next = _next_threshold(h.get('habitat_nodes', 0), [1, 3, 5])
    if nd_next is not None:
        C.append({'id': 'nodes_to_%d' % nd_next, 'pillar': 'habitat', 'effort': 'quick',
                  'delivery_options': [{'path': 'gs_install', 'cost': '$'}, {'path': 'designer_install', 'cost': '$'}],
                  'mutate': lambda r, v=nd_next: r['habitat'].__setitem__('habitat_nodes', v)})
    if not h.get('has_embedded_logs'):
        C.append({'id': 'logs', 'pillar': 'habitat', 'effort': 'quick',
                  'delivery_options': [{'path': 'diy', 'cost': '$'}, {'path': 'gs_install', 'cost': '$'}, {'path': 'designer_install', 'cost': '$'}],
                  'mutate': lambda r: r['habitat'].__setitem__('has_embedded_logs', True)})
    if not h.get('has_water_feature'):
        C.append({'id': 'water_feature', 'pillar': 'habitat', 'effort': 'quick',
                  'delivery_options': [{'path': 'diy', 'cost': '$'}, {'path': 'gs_install', 'cost': '$'}, {'path': 'designer_install', 'cost': '$'}],
                  'mutate': lambda r: r['habitat'].__setitem__('has_water_feature', True)})
    if not h.get('has_rock_refuges'):
        C.append({'id': 'rocks', 'pillar': 'habitat', 'effort': 'quick',
                  'delivery_options': [{'path': 'diy', 'cost': '$'}, {'path': 'gs_install', 'cost': '$'}, {'path': 'designer_install', 'cost': '$'}],
                  'mutate': lambda r: r['habitat'].__setitem__('has_rock_refuges', True)})
    if not h.get('has_nest_boxes'):
        C.append({'id': 'nest_boxes', 'pillar': 'habitat', 'effort': 'quick',
                  'delivery_options': [{'path': 'gs_install', 'cost': '$'}, {'path': 'designer_install', 'cost': '$'}],
                  'mutate': lambda r: r['habitat'].__setitem__('has_nest_boxes', True)})
    fauna_verified = len([s for s in (h.get('fauna_sightings') or []) if s.get('verified')])
    if fauna_verified < 1:
        C.append({'id': 'fauna_first', 'pillar': 'habitat', 'effort': 'quick',
                  'delivery_options': [{'path': 'diy', 'cost': '—'}],
                  'mutate': lambda r: r['habitat'].__setitem__('fauna_sightings', (r['habitat'].get('fauna_sightings') or []) + [{'verified': True}])})

    # --- Connectivity ---
    adj = len([g for g in (c.get('adjacent_registered_gardens') or []) if g.get('verified')])
    in_corridor = (c.get('adjacent_park') and (c.get('park_distance_m') or 9999) <= 500) or adj >= 1
    if not c.get('corridor_node_confirmed') and in_corridor:
        C.append({'id': 'corridor_node', 'pillar': 'connectivity', 'effort': 'moderate',
                  'delivery_options': [{'path': 'verification', 'cost': '$$'}],
                  'mutate': lambda r: r['connectivity'].__setitem__('corridor_node_confirmed', True)})
    adj_next = _next_threshold(adj, [1, 2, 3])
    if adj_next is not None:
        C.append({'id': 'adjacent_%d' % adj_next, 'pillar': 'connectivity', 'effort': 'moderate',
                  'delivery_options': [{'path': 'diy', 'cost': '—'}],
                  'mutate': lambda r: r['connectivity'].__setitem__('adjacent_registered_gardens',
                            (r['connectivity'].get('adjacent_registered_gardens') or []) + [{'verified': True}])})

    # --- Evidence & Verification ---
    for key, oid in [('has_species_list', 'species_list'), ('has_photos', 'photos'),
                     ('has_field_notes', 'field_notes'), ('has_fauna_record', 'fauna_record')]:
        if not e.get(key):
            C.append({'id': oid, 'pillar': 'evidence', 'effort': 'quick',
                      'delivery_options': [{'path': 'diy', 'cost': '—'}],
                      'mutate': (lambda k: (lambda r: r['evidence'].__setitem__(k, True)))(key)})
    if not e.get('has_professional_assessment'):
        C.append({'id': 'assessment', 'pillar': 'evidence', 'effort': 'moderate',
                  'delivery_options': [{'path': 'verification', 'cost': '$$'}],
                  'mutate': lambda r: r['evidence'].__setitem__('has_professional_assessment', True)})
    vl = e.get('verification_level') or 'self_reported'
    vl_next = {'self_reported': 'photo_verified', 'photo_verified': 'site_visit',
               'site_visit': 'gardener_and_son_verified'}.get(vl)
    if vl_next:
        C.append({'id': 'verify_%s' % vl_next, 'pillar': 'evidence', 'effort': 'moderate',
                  'delivery_options': [{'path': 'verification', 'cost': '$$'}],
                  'mutate': (lambda nv: (lambda r: r['evidence'].__setitem__('verification_level', nv)))(vl_next)})

    return C


def build_opportunities(record, opts=None):
    is_designer = bool(record.get('managed_by') and record['managed_by'].get('type') == 'designer')
    base = score_ecological_registry(record)
    base_total = base['total']
    tier = _next_tier(base_total)

    urgency = {p: 1 - (base.get(p, 0) / mx) for p, mx in PILLAR_MAX.items()}

    opps = []
    for o in _catalogue(record):
        mutated = copy.deepcopy(record)
        for sec in ('biodiversity', 'soil_water', 'habitat', 'connectivity', 'evidence'):
            mutated.setdefault(sec, {})
        o['mutate'](mutated)
        points = _total(mutated) - base_total
        if points <= 0:
            continue
        delivery_options = [d for d in o['delivery_options']
                            if d['path'] != 'designer_install' or is_designer]
        effort_mult = WEIGHTS['effort'].get(o['effort'], 1)
        weak_boost = 1 + WEIGHTS['weakPillarBoost'] * urgency[o['pillar']]
        priority = points * effort_mult * weak_boost
        if tier and tier['gap'] <= WEIGHTS['tierProximityWindow']:
            priority += WEIGHTS['tierProximityBonus'] * (points / max(tier['gap'], 1))
        opps.append({
            'id': o['id'], 'pillar': o['pillar'], 'pillarLabel': PILLAR_LABEL[o['pillar']],
            'group': _group_of(o['pillar'], delivery_options),
            'action': o.get('label'), 'points': points, 'effort': o['effort'],
            'delivery_options': delivery_options, 'season': o.get('season'),
            'priority': round(priority, 2),
        })
    opps.sort(key=lambda x: -x['priority'])

    path = []
    if tier:
        def roi(o):
            return o['points'] * WEIGHTS['effort'].get(o['effort'], 1)
        eco = sorted([o for o in opps if o['group'] == 'ecological'], key=lambda o: -roi(o))
        rec = sorted([o for o in opps if o['group'] == 'record'], key=lambda o: -roi(o))
        acc = 0
        for o in eco:
            if acc >= tier['gap']:
                break
            path.append(o); acc += o['points']
        for o in rec:
            if acc >= tier['gap']:
                break
            path.append(o); acc += o['points']

    by_pillar = {}
    for p, mx in PILLAR_MAX.items():
        got = base.get(p, 0)
        by_pillar[p] = {'label': PILLAR_LABEL[p], 'score': got, 'max': mx,
                        'headroom': mx - got,
                        'opportunities': [o for o in opps if o['pillar'] == p]}

    return {
        'summary': {
            'score': base_total,
            'tier': next((name for minv, name in reversed(TIERS) if base_total >= minv), 'Basic Garden'),
            'nextTier': tier,
            'totalPointsAvailable': sum(o['points'] for o in opps),
            'pathPointsToTier': sum(o['points'] for o in path),
        },
        'opportunities': opps,
        'byPillar': by_pillar,
        'path': path,
    }


if __name__ == '__main__':
    import json, sys
    with open(sys.argv[1]) as f:
        rec = json.load(f)
    print(json.dumps(build_opportunities(rec)['opportunities'], indent=2, ensure_ascii=False))
