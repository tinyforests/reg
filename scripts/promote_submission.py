"""
promote_submission.py
Bridge a verified self-enrolment submission into the registry — the codified
version of the manual steps used for the first self-enrolment (Harry Street).

Given a submission_id, it reads the public Submissions CSV, maps the (now
site-verified) enrolment answers into the registry's canonical input fields,
assigns a garden_id, and writes:
  - data/private/coords.json   (precise coords + address — PII, git-ignored)
  - data/<slug>.json           (canonical record; band-derived values flagged)
  - data/registry.json         (new entry; sync recomputes derived fields)
  - gardens/<slug>/index.html  (profile page from the template)

then runs sync_registry.py so the EVC/ecological-context/score are resolved.

Guardrails:
  - Refuses unless review_status == 'verified' (use --allow-provisional to
    register a provisional/self-reported entry instead).
  - Refuses if consent_record is not TRUE, or if consent_public_score is not
    TRUE (score would be public) unless --no-public-score.
  - Never writes steward email / street address into the public repo.

The ramp answers are POINTS per question, not raw figures, so several canonical
values are mid-band approximations — every approximated field is listed in the
record's `notes` as TO CONFIRM. Confirm against the site visit before relying
on the score.

Usage:
  python scripts/promote_submission.py SUB-... --suburb Thornbury
  python scripts/promote_submission.py SUB-... --check          # dry run
  python scripts/promote_submission.py --self-test              # verify mapping
"""

import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(REPO_ROOT, 'data', 'registry.json')
COORDS = os.path.join(REPO_ROOT, 'data', 'private', 'coords.json')
GARDENS_DIR = os.path.join(REPO_ROOT, 'gardens')
PROFILE_TEMPLATE = os.path.join(GARDENS_DIR, 'montalbert', 'index.html')

PROV_CSV = (
    'https://docs.google.com/spreadsheets/d/e/'
    '2PACX-1vS-v90MASzlma0rqxLApLTlMqi1NVHXgfg8AmKy80yXOlogICKA-JGSDxrS_'
    'EqnWSCb_QziixcPJHlW/pub?gid=0&single=true&output=csv'
)

C = {  # column indices, mirror Code.gs appendRow
    'timestamp': 0, 'submission_id': 1, 'steward_name': 2, 'steward_email': 3,
    'garden_address': 4, 'bio_q1': 5, 'bio_q2': 6, 'bio_q3': 7, 'bio_q4': 8,
    'soil_q1': 9, 'soil_q2': 10, 'soil_q3': 11, 'hab_q1': 12, 'hab_q2': 13,
    'hab_q3': 14, 'conn_q1': 15, 'evid_q1': 16, 'score': 17, 'tier': 18,
    'consent_record': 19, 'consent_public_score': 20, 'review_status': 23,
    'published_garden_id': 25, 'evc_code': 26, 'evc_name': 27, 'country': 28,
    'region': 29, 'garden_name': 30, 'garden_suburb': 31, 'garden_lat': 32,
    'garden_lng': 33, 'area_sqm': 38,
}


# ---- ramp answer (points) -> canonical field mapping ------------------------
# Point values come from the ramp option tables in
# docs/self-enrolment-ramp-prototype.html. Where an answer is a band, we take
# the mid-band; where it is a multi-select the decomposition is best-effort.

def map_answers(a):
    """a: dict of the 12 integer point values. Returns canonical sub-blocks."""
    g = a.get
    indi = {0: 0, 2: 3, 4: 8, 6: 15, 8: 24, 10: 30}.get(g('bio_q1', 0), 0)
    canopy = {0: 2, 1: 10, 2: 20, 4: 40, 5: 60}.get(g('bio_q4', 0), 0)
    soil = {2: 1, 3: 2, 5: 4, 8: 5}.get(g('soil_q1', 0), 0)
    water = {1: 1, 3: 2, 6: 4, 7: 5}.get(g('soil_q2', 0), 0)
    nodes = {0: 0, 2: 2, 4: 3, 6: 5}.get(g('hab_q1', 0), 0)
    swf = g('soil_q3', 0)
    hf = g('hab_q2', 0)
    park = g('conn_q1', 0)

    biodiversity = {
        'indigenous_species_current': indi,
        'indigenous_dominant': g('bio_q2', 0) >= 4,
        'structural_layers_current': min(g('bio_q3', 0), 5),
        'canopy_cover_pct_current': canopy,
    }
    soil_water = {
        'soil_health_score': soil,
        'water_function_score': water,
        'has_rainwater_system': swf >= 2,
        'has_moisture_basin': swf >= 4,
        'has_swale': swf in (1, 3, 5),
        'mulch_depth_mm': 75 if g('soil_q1', 0) >= 5 else 0,
    }
    habitat = {
        'habitat_nodes': nodes,
        'has_embedded_logs': hf >= 10 or hf == 3 or hf >= 6,
        'has_rock_refuges': hf >= 10 or hf == 2 or hf >= 5,
        'has_water_feature': hf >= 10 or hf >= 6,
        'has_nest_boxes': hf >= 10 or hf == 2 or hf in (4, 7, 9),
    }
    connectivity = {
        'adjacent_park': park >= 2,
        'park_distance_m': {2: 300, 4: 150, 6: 50}.get(park, 0),
    }
    return biodiversity, soil_water, habitat, connectivity


def self_test():
    # Harry Street's verified answers must reproduce the committed canonical values.
    a = {'bio_q1': 4, 'bio_q2': 4, 'bio_q3': 4, 'bio_q4': 2, 'soil_q1': 8,
         'soil_q2': 7, 'soil_q3': 0, 'hab_q1': 4, 'hab_q2': 10, 'hab_q3': 2,
         'conn_q1': 0, 'evid_q1': 2}
    bio, sw, hab, conn = map_answers(a)
    assert bio['indigenous_species_current'] == 8, bio
    assert bio['indigenous_dominant'] is True
    assert bio['structural_layers_current'] == 4
    assert bio['canopy_cover_pct_current'] == 20
    assert sw['soil_health_score'] == 5 and sw['water_function_score'] == 5
    assert not any([sw['has_rainwater_system'], sw['has_moisture_basin'], sw['has_swale']])
    assert sw['mulch_depth_mm'] == 75
    assert hab['habitat_nodes'] == 3
    assert all([hab['has_embedded_logs'], hab['has_rock_refuges'],
                hab['has_water_feature'], hab['has_nest_boxes']])
    assert conn['adjacent_park'] is False
    print('self-test OK — Harry Street answers reproduce committed canonical values.')


# ---- helpers ----------------------------------------------------------------

def fetch_row(submission_id):
    import csv
    import io
    req = urllib.request.Request(PROV_CSV, headers={'User-Agent': 'promote/1.0',
                                                    'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=60) as resp:
        rows = list(csv.reader(io.StringIO(resp.read().decode('utf-8'))))
    for row in rows[1:]:
        if len(row) > C['submission_id'] and row[C['submission_id']].strip() == submission_id:
            return row
    return None


def cell(row, key):
    i = C[key]
    return row[i].strip() if i < len(row) and row[i] else ''


def geocode(address, suburb):
    q = ', '.join(x for x in [address, suburb, 'Victoria', 'Australia'] if x)
    url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + \
        urllib.parse.quote(q)
    req = urllib.request.Request(url, headers={
        'User-Agent': 'gardener-and-son-registry/1.0 (hello@gardenerandson.com)'})
    with urllib.request.urlopen(req, timeout=25) as resp:
        data = json.loads(resp.read())
    if not data:
        return None
    return float(data[0]['lat']), float(data[0]['lon'])


def slugify(name):
    return re.sub(r'[^a-z0-9]', '', name.lower())


def name3(street):
    letters = re.sub(r'[^A-Za-z]', '', street.split()[0] if street else '')
    return (letters[:3] or 'GDN').upper()


def make_garden_id(suburb, street, existing):
    loc = re.sub(r'[^A-Za-z]', '', suburb)[:3].upper() or 'VIC'
    nm = name3(street)
    n = 1
    while True:
        gid = 'ER-AU-VIC-%s-%s-%03d' % (loc, nm, n)
        if gid not in existing:
            return gid
        n += 1


def build_profile(slug, garden_id, data_file, check_only):
    dest_dir = os.path.join(GARDENS_DIR, slug)
    dest = os.path.join(dest_dir, 'index.html')
    if check_only:
        return dest
    os.makedirs(dest_dir, exist_ok=True)
    with open(PROFILE_TEMPLATE) as f:
        html = f.read()
    html = re.sub(r'<title>Ecological Registry - [^<]*</title>',
                  '<title>Ecological Registry - %s</title>' % slug.title(), html, count=1)
    html = re.sub(r"var _GARDEN_ID  = '[^']*';", "var _GARDEN_ID  = '%s';" % garden_id, html)
    html = re.sub(r"var _staticJson = '[^']*';", "var _staticJson = '/%s';" % data_file, html)
    html = html.replace('/data/montalbert.json', '/' + data_file)
    with open(dest, 'w') as f:
        f.write(html)
    return dest


# ---- main -------------------------------------------------------------------

def main():
    if '--self-test' in sys.argv:
        self_test()
        return 0

    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    check_only = '--check' in sys.argv
    allow_prov = '--allow-provisional' in sys.argv
    no_public = '--no-public-score' in sys.argv
    suburb_override = None
    gid_override = None
    for a in sys.argv:
        if a.startswith('--suburb='):
            suburb_override = a.split('=', 1)[1]
        if a.startswith('--garden-id='):
            gid_override = a.split('=', 1)[1]
    if not args:
        sys.exit('usage: promote_submission.py SUB-... [--suburb=X] [--check]')
    sub_id = args[0]

    row = fetch_row(sub_id)
    if not row:
        sys.exit('Submission %s not found in the CSV.' % sub_id)

    status = cell(row, 'review_status').lower()
    if status != 'verified' and not allow_prov:
        sys.exit('review_status is %r, not verified. Use --allow-provisional to '
                 'register a self-reported provisional entry.' % (status or '(blank)'))
    if cell(row, 'consent_record').upper() != 'TRUE':
        sys.exit('consent_record is not TRUE — cannot record this garden.')
    public_score = cell(row, 'consent_public_score').upper() == 'TRUE'
    if not public_score and not no_public:
        sys.exit('consent_public_score is not TRUE — steward did not consent to a '
                 'public score. Re-run with --no-public-score to register without one.')

    suburb = suburb_override or cell(row, 'garden_suburb')
    if not suburb:
        sys.exit('No suburb in the submission — pass --suburb=<suburb>.')
    address = cell(row, 'garden_address')
    street = ' '.join(w for w in address.split() if not w.isdigit()) if address else ''
    garden_name = cell(row, 'garden_name') or (street or suburb)

    # coords: prefer the ramp-geocoded point, else geocode the address.
    lat = cell(row, 'garden_lat')
    lng = cell(row, 'garden_lng')
    if lat and lng:
        lat, lng = float(lat), float(lng)
    else:
        geo = geocode(address, suburb)
        if not geo:
            sys.exit('Could not geocode "%s, %s". Add coords manually.' % (address, suburb))
        lat, lng = geo

    with open(REGISTRY) as f:
        reg = json.load(f)
    existing = {g.get('garden_id') for g in reg['gardens']}
    if gid_override:
        gid = gid_override
    else:
        # reuse published_garden_id if the sheet already assigned one
        gid = cell(row, 'published_garden_id') or make_garden_id(suburb, street, existing)
    if gid in existing:
        sys.exit('%s already in registry.json — nothing to do.' % gid)

    slug = slugify(garden_name if garden_name else street)
    data_file = 'data/%s.json' % slug
    if os.path.exists(os.path.join(REPO_ROOT, data_file)):
        sys.exit('%s already exists — this garden appears to be registered already '
                 '(or slug collision). Aborting to avoid overwrite; use --garden-id / '
                 'rename if this is genuinely new.' % data_file)

    a = {k: (int(cell(row, k)) if cell(row, k).lstrip('-').isdigit() else 0)
         for k in ('bio_q1', 'bio_q2', 'bio_q3', 'bio_q4', 'soil_q1', 'soil_q2',
                   'soil_q3', 'hab_q1', 'hab_q2', 'hab_q3', 'conn_q1', 'evid_q1')}
    bio, sw, hab, conn = map_answers(a)

    area = cell(row, 'area_sqm')
    record = {
        'garden_id': gid, 'garden_name': garden_name,
        'garden_type': 'Ecological Home Garden', 'suburb': suburb, 'state': 'VIC',
        'assessment_date': time.strftime('%b %Y'), 'baseline_date': time.strftime('%Y'),
        'target_score': 75, 'stewards': cell(row, 'steward_name').split(' ')[0],
        'designer': 'Steward self-enrolled', 'designer_id': 'self-enrolled',
        'enroller': 'Steward (self-enrolment)',
        'verifier': 'Gardener & Son' if status == 'verified' else None,
        'area_sqm': int(area) if area.isdigit() else 0,
        'description': 'A self-enrolled ecological garden in %s, %s via the Registry '
        'ramp.' % (suburb, 'verified by a Gardener & Son site visit'
                   if status == 'verified' else 'self-reported (provisional)'),
        'biodiversity': dict(bio, indigenous_species_baseline=0, indigenous_species_target=20,
                             structural_layers_baseline=0, canopy_cover_pct_baseline=0,
                             canopy_cover_pct_target=30, weed_pressure='',
                             weed_pressure_baseline='', species_list=[]),
        'soil_water': dict(sw, soil_health_baseline=0, soil_health_max=5,
                           water_function_baseline=0, water_function_max=5),
        'habitat': dict(hab, habitat_nodes_baseline=0,
                        planting_method='Self-enrolled ecological planting', fauna_sightings=[]),
        'connectivity': dict(conn, park_name='', adjacent_registered_gardens=[],
                             corridor_node_confirmed=False, effective_ecological_area_ha=0,
                             cluster_area_ha=0, cluster_name='',
                             cluster={'name': '', 'gardens': 0, 'area_ha': 0, 'status': ''}),
        'evidence': {
            'has_photos': False, 'has_field_notes': False,
            'has_professional_assessment': status == 'verified', 'has_fauna_record': False,
            'has_species_list': False,
            'verification_level': 'gardener_and_son_verified' if status == 'verified' else 'self_reported',
            'verification_label': 'G&S Verified' if status == 'verified' else 'Self-reported',
            'assessor': 'Gardener & Son' if status == 'verified' else 'Steward (self-reported)',
        },
        'milestones': [
            {'title': 'Garden self-enrolled via Registry ramp',
             'date': (cell(row, 'timestamp')[:7] or time.strftime('%Y')), 'complete': True},
        ] + ([{'title': 'Gardener & Son verification visit', 'date': time.strftime('%b %Y'),
               'complete': True},
              {'title': 'Registered on the Ecological Registry', 'date': time.strftime('%b %Y'),
               'complete': True}] if status == 'verified' else []),
        'activity_log': [],
        'notes': 'Imported from self-enrolment %s. Canonical inputs are DERIVED '
        'from ramp answer bands (points, not raw figures) using mid-band values -- '
        'TO CONFIRM against the site visit: indigenous species count, structural '
        'layers, canopy %%, habitat zones/features, water features, mulch, species '
        'list, fauna. Steward email and street address held privately (not in repo).'
        % sub_id,
        'typology': 'Urban Ecological Retrofit', 'registry_role': 'Performer',
        'trajectory': 'Emerging',
        'rating': {'current': 'Foundation Garden', 'next': 'Habitat Garden', 'points_to_next': 0},
        'upgrade_potential': 100, 'points_available': 100,
        'yield': {'eligible': False, 'status': 'Yield not active for this garden',
                  'estimated_annual': 0, 'potential_annual': 0, 'currency': 'AUD',
                  'formula_note': 'Score x area x connectivity x verification. Formula v1.',
                  'upgrades': []},
        'council': '', 'ward': '', 'lga': '',
    }

    reg_entry = {
        'garden_id': gid, 'garden_name': garden_name, 'type': 'Ecological Home Garden',
        'suburb': suburb, 'state': 'VIC', 'score': 0,
        'rating': 'Provisional' if status != 'verified' else
        {'current': 'Foundation Garden', 'next': 'Habitat Garden', 'points_to_next': 0},
        'primary_evc': '', 'bioregion': '',
        'status': 'Active / Establishing' if status == 'verified' else 'Provisional',
        'verification_level': record['evidence']['verification_level'],
        'verification_label': record['evidence']['verification_label'],
        'last_verified': time.strftime('%b %Y'), 'badge_count': 0, 'badges': [],
        'profile_url': '/gardens/%s/index.html' % slug, 'data_file': data_file,
        'council': '', 'ward': '', 'lga': '',
    }

    print('Submission : %s (%s)' % (sub_id, status))
    print('Garden     : %s  ->  %s' % (garden_name, gid))
    print('Location   : %s, %s   (%.6f, %.6f)' % (address or '(no street#)', suburb, lat, lng))
    print('Public score consented: %s' % public_score)
    print('Derived score inputs: indi=%d dominant=%s layers=%d canopy=%d%% soil=%d water=%d '
          'nodes=%d habitat=%s' % (
              bio['indigenous_species_current'], bio['indigenous_dominant'],
              bio['structural_layers_current'], bio['canopy_cover_pct_current'],
              sw['soil_health_score'], sw['water_function_score'], hab['habitat_nodes'],
              [k for k in ('has_embedded_logs', 'has_rock_refuges', 'has_water_feature',
                           'has_nest_boxes') if hab[k]]))
    print('Files      : %s , gardens/%s/index.html , registry entry , private coords' %
          (data_file, slug))

    if check_only:
        print('\n--check: nothing written.')
        return 0

    coords = json.load(open(COORDS))
    coords[gid] = {'lat': lat, 'lng': lng,
                   'address': '%s, %s, Victoria' % (address, suburb) if address else
                   '%s, Victoria' % suburb}
    json.dump(coords, open(COORDS, 'w'), indent=2)
    open(COORDS, 'a').write('\n')

    json.dump(record, open(os.path.join(REPO_ROOT, data_file), 'w'), indent=2, ensure_ascii=False)
    open(os.path.join(REPO_ROOT, data_file), 'a').write('\n')

    reg['gardens'].append(reg_entry)
    json.dump(reg, open(REGISTRY, 'w'), indent=2, ensure_ascii=False)
    open(REGISTRY, 'a').write('\n')

    build_profile(slug, gid, data_file, check_only=False)

    print('\nWritten. Now running sync_registry.py …')
    subprocess.run([sys.executable, os.path.join(REPO_ROOT, 'scripts', 'sync_registry.py')],
                   cwd=REPO_ROOT)
    # Close the loop on the sheet if we have an admin token (needs the
    # set_published_id handler deployed in Code.gs). Non-fatal if unavailable.
    token = os.environ.get('ER_ADMIN_TOKEN', '').strip()
    if token:
        try:
            # Same web-app deployment as pull_live_records.py — the one that
            # carries the set_published_id handler (verified live at V33).
            url = ('https://script.google.com/macros/s/'
                   'AKfycbwGIau58khBRKYgq5SYwu0QjCWPa5h2dKyz4nPoeU9YMKlPN5BRXUz0LmzF7jZrqrRC/exec'
                   '?' + urllib.parse.urlencode({'action': 'set_published_id',
                                                 'submission_id': sub_id, 'garden_id': gid,
                                                 'admin_token': token}))
            with urllib.request.urlopen(url, timeout=60) as resp:
                out = json.loads(resp.read())
            print('Sheet write-back: %s' % ('published_garden_id set' if out.get('ok')
                                            else out.get('error')))
        except Exception as e:
            print('Sheet write-back skipped (%s). Set published_garden_id=%s manually.' % (e, gid))
    else:
        print('No ER_ADMIN_TOKEN — write published_garden_id=%s back to the sheet manually.' % gid)

    print('\nDone. Review the record, confirm the TO CONFIRM figures, set council/ward, '
          'then commit.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
