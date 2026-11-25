"""The assessment file alone must rebuild a verified record: Hortense's 50 from
the example template, with sports grounds excluded and no private details out."""
import copy
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import promote_submission as ps  # noqa: E402
from reg_score import score_ecological_registry  # noqa: E402
from sync_registry import rating_from_score  # noqa: E402


def scaffold():
    """What the ramp bands alone produced for Hortense (the 17-point record)."""
    bio, sw, hab, conn = ps.map_answers({'bio_q1': 2, 'bio_q3': 2, 'soil_q1': 3, 'soil_q2': 3,
                                         'hab_q1': 2, 'bio_q4': 1})
    rec = {'biodiversity': dict(bio, species_list=[]), 'soil_water': sw,
           'habitat': dict(hab, fauna_sightings=[]),
           'connectivity': dict(conn, adjacent_registered_gardens=[]),
           'evidence': {'has_photos': False, 'has_field_notes': False,
                        'has_professional_assessment': True, 'has_fauna_record': False,
                        'has_species_list': False,
                        'verification_level': 'gardener_and_son_verified'},
           'description': 'A self-enrolled ecological garden, verified by a Gardener & Son site visit.',
           'milestones': [{'title': 'Garden self-enrolled via Registry ramp'},
                          {'title': 'Gardener & Son verification visit'}]}
    return rec, {'verification_level': 'gardener_and_son_verified'}


def assessment():
    a = json.loads((ROOT / 'docs/templates/assessment.example.json').read_text())
    a.pop('species_list_file')
    a['species_list'] = ps.clean_species(json.loads(
        (ROOT / 'docs/templates/.species-fixture.json').read_text()) + ['unknown lily', 'Themeda  triandra'])
    return a


class AssessmentTests(unittest.TestCase):
    def test_rebuilds_hortense(self):
        rec, entry = scaffold()
        self.assertLess(score_ecological_registry(rec)['total'], 30)
        to_confirm = ps.apply_assessment(rec, entry, assessment())
        res = score_ecological_registry(rec)
        self.assertEqual(res['total'], 50, res)
        self.assertEqual(rating_from_score(50), 'Ecological Garden')
        self.assertEqual(rec['biodiversity']['indigenous_species_current'], 58)
        self.assertEqual(entry['verification_label'], 'Photo Verified')
        self.assertFalse(rec['evidence']['has_professional_assessment'])
        self.assertIsNone(rec['habitat']['has_nest_boxes'])
        self.assertTrue(rec['habitat']['has_rock_refuges'])
        self.assertNotIn('site visit', rec['description'])
        self.assertEqual(len(rec['evidence_log']), 8)
        self.assertTrue(any('park_distance_m' in t for t in to_confirm))
        self.assertIn('Pocket Forest.jpeg', json.dumps(rec['photo_assessment_notes']))

    def test_oval_not_scored(self):
        a = assessment()
        a['park'] = {'name': 'Glandore Oval', 'distance_m': 51, 'type': 'oval'}
        rec, entry = scaffold()
        ps.apply_assessment(rec, entry, a)
        self.assertEqual(score_ecological_registry(rec)['connectivity'], 0)
        rec['connectivity']['park_type'] = 'park'
        self.assertEqual(score_ecological_registry(rec)['connectivity'], 4)

    def test_private_outputs_hold_no_identity(self):
        rec, entry = scaffold()
        a = assessment()
        tc = ps.apply_assessment(rec, entry, a)
        res = dict(score_ecological_registry(rec), rating='Ecological Garden')
        with tempfile.TemporaryDirectory() as tmp:
            old = ps.REPO_ROOT
            ps.REPO_ROOT = tmp
            try:
                out = ps.write_private_outputs('ER-TEST-001', 'SUB-1', a, rec, res, tc)
            finally:
                ps.REPO_ROOT = old
            bundle = json.loads(Path(out, 'field-note-bundle.json').read_text())
            e = bundle['entries'][0]
            self.assertEqual((e['source_type'], e['visibility'], e['assets']), ('studio', 'private', []))
            self.assertRegex(e['source_id'], r'^[a-f0-9]{32}$')
            email = Path(out, 'email-paragraph.txt').read_text()
            self.assertIn('scores 50', email)
            self.assertIn('an Ecological Garden', email)
            for f in os.listdir(out):
                text = Path(out, f).read_text()
                self.assertNotIn('@', text.replace('@example', ''))


if __name__ == '__main__':
    unittest.main()
