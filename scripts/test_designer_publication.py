import json
import unittest
from promote_designer_submission import prepare, render_profile
from reg_score import score_ecological_registry

class PublicationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from pathlib import Path
        cls.submission=json.loads(Path('/tmp/designer-submission-fixture.json').read_text())
        cls.submission['review_status']='ready'

    def test_provisional_privacy_and_score(self):
        record,entry,slug=prepare(self.submission)
        self.assertNotIn('PRIVATE FIXTURE ADDRESS',json.dumps(record))
        self.assertNotIn('fixture@example.invalid',json.dumps(record))
        self.assertEqual(record['score']['total'],score_ecological_registry(record)['total'])
        self.assertEqual(entry['score'],record['score']['total'])
        self.assertEqual(record['badges'],[])
        self.assertEqual(record['status'],'Provisional')
        self.assertEqual(record['yield']['estimated_annual'],0)
        self.assertRegex(slug,r'^g-[a-f0-9]{12}$')
        self.assertEqual(record['biodiversity']['indigenous_species_baseline'],None)

    def test_generated_profile(self):
        from pathlib import Path
        record,entry,slug=prepare(self.submission)
        template=(Path(__file__).resolve().parents[1]/'gardens/g-95a9948e6de3/index.html').read_text()
        result=render_profile(template,record,entry)
        self.assertNotIn('studio garden in Canterbury',result)
        self.assertNotIn('/data/montalbert.json',result)
        self.assertIn("R.status === 'Provisional' ? {all:[]",result)
        self.assertIn('Baseline not recorded',result)
        self.assertIn(record['garden_id'],result)
        self.assertIn('/'+entry['data_file'],result)
        self.assertNotIn('PRIVATE FIXTURE ADDRESS',result)

    def test_explicit_verification(self):
        with self.assertRaises(ValueError): prepare(self.submission,'third_party_verified')
        record,entry,slug=prepare(self.submission,'third_party_verified','Independent fixture reviewer')
        self.assertEqual(record['verifier'],'Independent fixture reviewer')
        self.assertEqual(entry['verification_level'],'third_party_verified')

    def test_plain_public_text(self):
        data={**self.submission,'payload':{**self.submission['payload'],'candidate':{**self.submission['payload']['candidate'],'garden_name':'<img src=x onerror=alert(1)>'}}}
        with self.assertRaises(ValueError): prepare(data)

    def test_review_and_consent(self):
        pending={**self.submission,'review_status':'pending'}
        with self.assertRaises(ValueError): prepare(pending)
        private={**self.submission,'payload':{**self.submission['payload'],'consent_public_profile':False}}
        with self.assertRaises(ValueError): prepare(private)

if __name__=='__main__': unittest.main()
