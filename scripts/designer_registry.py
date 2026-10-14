"""Public attribution validation and derived aggregates; never scoring inputs."""
import json
from pathlib import Path

QUARANTINE = {'Provisional', 'Design Proposal'}
VERIFIED = {'gardener_and_son_verified', 'site_visit', 'photo_verified'}

def identity(value):
    return ''.join(c for c in str(value or '').casefold() if c.isalnum())

def load_designers(root):
    data = json.loads((Path(root) / 'data/designers.json').read_text())
    rows = data['designers']
    by_id = {}
    for row in rows:
        key = row['designer_id']
        if key in by_id or not key or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in key):
            raise ValueError('Invalid or duplicate designer_id: ' + key)
        if set(row) - {'designer_id', 'display_name', 'practice_name', 'url', 'status', 'joined'}:
            raise ValueError('Unexpected field in public designer registry: ' + key)
        if row['status'] not in {'active', 'invited'}:
            raise ValueError('Invalid designer status: ' + key)
        by_id[key] = row
    return by_id

def validate_records(designers, records):
    errors = []
    for record in records:
        key, gid = record.get('designer_id'), record.get('garden_id', '?')
        if key and key not in designers:
            errors.append(gid + ': unknown designer_id ' + key)
        designer = designers.get(key, {})
        aliases = {identity(record.get('designer')), identity(key), identity(designer.get('display_name')), identity(designer.get('practice_name'))} - {''}
        # Tyson explicitly permits studio dogfooding, labelled G&S verification.
        gs_exception = key == 'gardener-and-son'
        if identity(record.get('verifier')) in aliases and not gs_exception:
            errors.append(gid + ': designer cannot verify their own garden')
    if errors:
        raise ValueError('\n'.join(errors))

def derive(designers, registry, records):
    """Use canonical verification plus both statuses; exclude demo from aggregates."""
    validate_records(designers, records.values())
    result = {key: {'garden_count': 0, 'verified_count': 0, 'mean_verified_score': None} for key in designers}
    totals = {key: 0 for key in designers}
    for garden in registry['gardens']:
        record = records.get(garden['garden_id'], {})
        key = record.get('designer_id')
        if not key or record.get('demo') or garden.get('demo'):
            continue
        summary = result[key]
        summary['garden_count'] += 1
        if (garden.get('status') not in QUARANTINE and record.get('status') not in QUARANTINE
                and record.get('evidence', {}).get('verification_level') in VERIFIED
                and isinstance(garden.get('score'), (int, float))):
            summary['verified_count'] += 1
            totals[key] += garden['score']
    for key, summary in result.items():
        if summary['verified_count']:
            summary['mean_verified_score'] = round(totals[key] / summary['verified_count'], 2)
    return {'designers': result}
