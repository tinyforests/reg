"""Photo promotion privacy, evidence and canonical/index regression checks."""
import json
import unittest
from pathlib import Path
from reg_score import score_ecological_registry

ROOT = Path(__file__).resolve().parents[1]
class PhotoPromotionTests(unittest.TestCase):
    def test_remote_evidence_and_snapshot(self):
        record=json.loads((ROOT/'data/g-df32c68c9cb2.json').read_text())
        entry=next(g for g in json.loads((ROOT/'data/registry.json').read_text())['gardens'] if g['garden_id']==record['garden_id'])
        self.assertEqual(entry['verification_level'],record['evidence']['verification_level'])
        self.assertEqual(entry['verification_label'],'Photo Verified')
        result=score_ecological_registry(record)
        self.assertEqual(entry['score'],result['total'])
        self.assertFalse(record['evidence']['has_professional_assessment'])
        self.assertFalse(record['evidence']['has_fauna_record'])
        self.assertEqual(record['biodiversity']['indigenous_species_current'],len(set(record['biodiversity']['species_list'])))
        self.assertEqual(record['biodiversity']['indigenous_species_current'],58)
        self.assertEqual(record['biodiversity']['structural_layers_current'],5)
        self.assertEqual(record['biodiversity']['canopy_cover_pct_current'],20)
        self.assertEqual(record['soil_water']['soil_health_score'],3)
        self.assertEqual(record['soil_water']['water_function_score'],3)
        self.assertEqual(record['habitat']['habitat_nodes'],4)
        self.assertTrue(record['habitat']['has_water_feature'])
        self.assertTrue(record['habitat']['has_rock_refuges'])
        self.assertIsNone(record['habitat']['has_nest_boxes'])
        self.assertEqual(record['habitat']['fauna_sightings'],[])
        self.assertEqual(record['connectivity']['park_name'],'Memorial Garden')
        self.assertNotIn('park_lat',record['connectivity'])
        self.assertEqual(record['connectivity']['park_lookup_status'],'manual_review_pending')
        self.assertEqual(len(record['photo_assessment_notes']),7)
        self.assertEqual(len(record['evidence_log']),8)
        self.assertTrue(all(not item['published'] for item in record['evidence_log']))
        self.assertFalse(record['biodiversity']['indigenous_dominant'])
        self.assertIsNone(record['evc']['code'])
        self.assertEqual(record['state'],'SA')
        history=record['planting_history']
        self.assertEqual(sum(x['total_planted'] for x in history['entries']),165)
        species=record['biodiversity']['species_list']
        self.assertEqual(len(species),len(set(species)))
        self.assertNotIn('unknown lily',species)
        self.assertIsNone(record['stewards'])
        self.assertNotIn('declined by steward',json.dumps(record))
        self.assertFalse(record['evidence']['public_photo_consent'])
        profile=(ROOT/entry['profile_url'].lstrip('/')).read_text()
        self.assertNotIn('<img',profile)
        self.assertNotIn('studio garden in Canterbury',profile)
        for forbidden in ('G&S Verified','Site Visit Verified','Council Verified'):
            self.assertNotIn(forbidden,json.dumps(record)+json.dumps(entry)+profile)
        self.assertIn('Baseline not recorded',profile)
        # Compare against actual private values, never disclose them on failure.
        private=ROOT/'data/private/coords.json'
        if private.exists():
            coords=json.loads(private.read_text())[record['garden_id']]
            public=json.dumps(record)+json.dumps(entry)+profile
            self.assertTrue(all(str(coords[k]) not in public for k in ('lat','lng')))
if __name__=='__main__':unittest.main()
