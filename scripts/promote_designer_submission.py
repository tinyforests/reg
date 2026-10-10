"""Publish a reviewed designer submission without exposing private client details.
ER_ADMIN_TOKEN must be supplied through the environment, never a command argument.
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo
from reg_score import score_ecological_registry
from sync_registry import rating_object, reconcile_score_block, award_badges
import html
import re

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = 'https://script.google.com/macros/s/AKfycbwGIau58khBRKYgq5SYwu0QjCWPa5h2dKyz4nPoeU9YMKlPN5BRXUz0LmzF7jZrqrRC/exec'


def request(action, **values):
    token = os.environ.get('ER_ADMIN_TOKEN', '').strip()
    if not token:
        raise ValueError('Set ER_ADMIN_TOKEN in the environment.')
    body = json.dumps(dict(values, submission_type='designer_portal', action=action, admin_token=token)).encode()
    req = urllib.request.Request(ENDPOINT, data=body, headers={'Content-Type': 'text/plain;charset=utf-8'})
    with urllib.request.urlopen(req, timeout=45) as response:
        data = json.load(response)
    if not data.get('ok'):
        raise ValueError(data.get('error', 'Registry service rejected the request'))
    return data


def prepare(submission, verification='self_reported', verifier=None):
    if submission['review_status'] not in ('ready', 'published'):
        raise ValueError('Submission must be reviewed and marked ready first.')
    private = submission['payload']
    if not private.get('consent_record') or not private.get('consent_public_profile'):
        raise ValueError('Both steward permissions are required.')
    record = copy.deepcopy(private['candidate'])
    if record.get('designer_id') != submission['designer_id']:
        raise ValueError('Practice attribution does not match.')
    if verification != 'self_reported' and not verifier:
        raise ValueError('Verified records require an explicit independent reviewer (--verifier).')
    gid = 'ER-AU-%s-DSG-%s' % (record['state'], hashlib.sha256(submission['submission_id'].encode()).hexdigest()[:8].upper())
    if submission.get('published_garden_id') and submission['published_garden_id'] != gid:
        raise ValueError('Submission is linked to a different garden ID.')
    slug = 'g-' + hashlib.sha256(gid.encode()).hexdigest()[:12]
    date = datetime.now(ZoneInfo('Australia/Melbourne'))
    verified = verification != 'self_reported'
    record.update(garden_id=gid, registration_date=date.strftime('%d %b %Y'), last_updated=date.strftime('%d %b %Y'),
                  last_verified=date.strftime('%b %Y') if verified else '',
                  status='Active / Establishing' if verified else 'Provisional', verifier=verifier if verified else None)
    record['evidence'].update(verification_level=verification,
        verification_label={'self_reported':'Self-reported','third_party_verified':'Third-party Verified','gardener_and_son_verified':'G&S Verified'}[verification],
        has_professional_assessment=verified, assessor=verifier if verified else record['designer'])
    record['assessment_date'] = date.strftime('%d %b %Y') if verified else None
    record['baseline_date'] = None
    record['connectivity'].update(cluster_name='', cluster={'name':'', 'gardens':0, 'area_ha':None, 'status':''})
    validate_public_text(record)
    score = score_ecological_registry(record)
    record['score'] = {'total': score['total'], 'rating': rating_object(score['total'])['current'], 'categories': [{'label': label, 'score': score[key], 'max': maximum, 'notes': []} for key, label, maximum in [('biodiversity','Biodiversity Structure',25),('soil_water','Soil & Water Function',20),('habitat','Habitat Complexity',20),('connectivity','Connectivity',20),('evidence','Evidence & Verification',15)]]}
    record['upgrade_potential'] = record['points_available'] = 100 - score['total']
    record['rating'] = rating_object(score['total'])
    record['badges'] = award_badges(record) if verified else []
    record['badge_count'] = len(record['badges'])
    record['yield'] = dict(eligible=False, status='Yield not active for this garden', estimated_annual=0, potential_annual=0, currency='AUD', upgrades=[])
    record['source_submission_id'] = submission['submission_id']
    # Candidate was reconstructed server-side; assert private fields cannot leak.
    for key in ('garden_address', 'address', 'street_address', 'steward_email', 'private_notes', 'evidence_url', 'consent_record', 'consent_public_profile'):
        if key in record:
            raise ValueError('Private field found in canonical candidate: ' + key)
    entry = {key: record.get(key) for key in ('garden_id','garden_name','suburb','state','status','designer','designer_id','managed_by','last_verified','council','ward','lga')}
    entry.update(type=record['garden_type'], score=score['total'], rating=record['rating'] if verified else 'Provisional',
        primary_evc=record['evc'].get('name',''), bioregion=record['evc'].get('bioregion',''),
        verification_level=verification, verification_label=record['evidence']['verification_label'],
        badge_count=record['badge_count'], badges=record['badges'], profile_url='/gardens/'+slug+'/index.html', data_file='data/'+slug+'.json')
    return record, entry, slug


def validate_public_text(value):
    # Existing profile and browse templates interpolate some public fields as HTML.
    # Reject markup in new records; preserve plain text, accents and apostrophes.
    if isinstance(value, str) and ('<' in value or '>' in value):
        raise ValueError('Public fields must use plain text without HTML markup. Request a revision before publishing.')
    if isinstance(value, dict):
        for item in value.values(): validate_public_text(item)
    if isinstance(value, list):
        for item in value: validate_public_text(item)


def render_profile(template, record, entry):
    rendered = re.sub(r'<title>[^<]*</title>', lambda _: '<title>Ecological Registry - '+html.escape(record['garden_name'])+'</title>', template, count=1)
    rendered = re.sub(r"var _GARDEN_ID  = '[^']*';", lambda _: "var _GARDEN_ID  = '"+record['garden_id']+"';", rendered)
    rendered = rendered.replace('/data/montalbert.json', '/' + entry['data_file'])
    rendered = re.sub(r"  txt\('visionText',[^\n]*", "  txt('visionText', R.description || (R.garden_name + ' is a designer-submitted garden. Its ecological record will develop through documented observations and review.'));", rendered)
    rendered = rendered.replace('var badges = awardBadges(R);', "var badges = R.status === 'Provisional' ? {all:[],vb:[],all_badges:[],score_badges:[],verification_badges:[],evidence_badges:[]} : awardBadges(R);")
    rendered = rendered.replace('function dta(cur, base) {', 'function dta(cur, base) {\n  if (cur == null || base == null) return \'<span class="delta-same">Baseline not recorded</span>\';')
    rendered = rendered.replace("+ sw.soil_health_score +", "+ (sw.soil_health_score == null ? '—' : sw.soil_health_score) +")
    rendered = rendered.replace("+ sw.water_function_score +", "+ (sw.water_function_score == null ? '—' : sw.water_function_score) +")
    rendered = rendered.replace("'From ' + b.weed_pressure_baseline", "(b.weed_pressure_baseline == null ? 'Not assessed' : 'From ' + b.weed_pressure_baseline)")
    rendered = rendered.replace("'Corridor Map - ' + c.cluster_name", "c.cluster_name ? 'Corridor Map - ' + c.cluster_name : 'Garden connectivity'")
    rendered = rendered.replace("'Part of ' + c.cluster_name + ' cluster.'", "'Cluster not recorded.'")
    rendered = rendered.replace("txt('curbingNote',   'This garden", "txt('curbingNote', c.cluster_name ? 'This garden")
    rendered = rendered.replace("'ha of measured ecological function.' : '.'));", "'ha of measured ecological function.' : '.') : 'Connectivity will be documented through Registry review.');")
    rendered = rendered.replace("+ b.weed_pressure_baseline +", "+ (b.weed_pressure_baseline == null ? '—' : b.weed_pressure_baseline) +")
    rendered = rendered.replace('Logs + voids', 'Designer-submitted count')
    rendered = rendered.replace('No coordinates in data', 'Garden location not yet mapped')
    return rendered


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('submission_id')
    parser.add_argument('--check', action='store_true', help='Validate only; write nothing.')
    parser.add_argument('--confirm-live', action='store_true', help='Link private details only after public deployment.')
    parser.add_argument('--verification', choices=['self_reported','third_party_verified','gardener_and_son_verified'], default='self_reported')
    parser.add_argument('--verifier')
    args = parser.parse_args()
    if args.check and args.confirm_live:
        parser.error('--check and --confirm-live are separate operations')
    submission = request('export_submission', submission_id=args.submission_id)['submission']
    record, entry, slug = prepare(submission, args.verification, args.verifier)
    if args.confirm_live:
        request('mark_published', submission_id=args.submission_id, garden_id=record['garden_id'])
        print('Live publication confirmed. Private address and steward access are linked.')
        return
    registry_path = ROOT / 'data/registry.json'
    registry = json.loads(registry_path.read_text())
    if any(g['garden_id'] == record['garden_id'] for g in registry['gardens']) or (ROOT / entry['data_file']).exists() or (ROOT / 'gardens' / slug).exists():
        raise ValueError('Garden already exists; use --confirm-live after deployment. Existing records are never overwritten.')
    print('Reviewed submission: '+args.submission_id)
    print('Public record: '+record['garden_id']+'; '+entry['data_file'])
    print('Verification: '+record['evidence']['verification_label'])
    if args.check:
        print('Validation passed; nothing written.')
        return
    registry['gardens'].append(entry)
    profile = ROOT / 'gardens' / slug / 'index.html'
    template = (ROOT / 'gardens/g-95a9948e6de3/index.html').read_text()
    rendered = render_profile(template, record, entry)
    profile.parent.mkdir(parents=True)
    profile.write_text(rendered)
    (ROOT / entry['data_file']).write_text(json.dumps(record, indent=2, ensure_ascii=False)+'\n')
    registry_path.write_text(json.dumps(registry, indent=2, ensure_ascii=False)+'\n')
    print('Source created. Review and deploy all three files, then rerun with --confirm-live.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        print('Not published: '+str(error), file=sys.stderr)
        sys.exit(1)
