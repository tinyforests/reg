"""Regression tests for attribution validation, privacy and verified aggregates."""
import copy
import json
import subprocess
import unittest
from pathlib import Path
from designer_registry import load_designers, validate_records, derive
from reg_score import score_ecological_registry

ROOT = Path(__file__).resolve().parents[1]

class AttributionTests(unittest.TestCase):
    def setUp(self):
        self.designers = load_designers(ROOT)
        self.record = {'garden_id':'fixture', 'designer_id':'sam-cox-landscape', 'designer':'Sam Cox Landscape', 'verifier':'Independent assessor', 'evidence':{'verification_level':'site_visit'}}

    def test_unknown_and_self_verification_fail(self):
        with self.assertRaisesRegex(ValueError,'unknown designer_id'):
            validate_records(self.designers,[dict(self.record, designer_id='unknown')])
        for verifier in ['sam-cox-landscape','Sam Cox Landscape']:
            with self.assertRaisesRegex(ValueError,'cannot verify'):
                validate_records(self.designers,[dict(self.record,verifier=verifier)])

    def test_gs_dogfooding_exception(self):
        validate_records(self.designers,[dict(self.record,designer_id='gardener-and-son',designer='Gardener & Son',verifier='Gardener & Son')])

    def test_only_verified_real_gardens_contribute_mean(self):
        records = {}
        gardens = []
        for gid,status,level,score,demo in [('a','Active','site_visit',60,False),('b','Provisional','site_visit',99,False),('c','Design Proposal','site_visit',0,False),('d','Active','self_reported',90,False),('e','Active','site_visit',100,True),('f','Active','third_party_verified',88,False)]:
            records[gid] = dict(self.record,garden_id=gid,status=status,evidence={'verification_level':level},demo=demo)
            gardens.append({'garden_id':gid,'status':status,'score':score,'demo':demo})
        records['a']['status']='Provisional' # canonical quarantine also wins
        result = derive(self.designers,{'gardens':gardens},records)['designers']['sam-cox-landscape']
        self.assertEqual(result,{'garden_count':5,'verified_count':0,'mean_verified_score':None})
        records['a']['status']='Active'
        result = derive(self.designers,{'gardens':gardens},records)['designers']['sam-cox-landscape']
        self.assertEqual(result['verified_count'],1)
        self.assertEqual(result['mean_verified_score'],60)

    def test_attribution_never_changes_any_score(self):
        index=json.loads((ROOT/'data/registry.json').read_text())
        compared=0
        for garden in index['gardens']:
            current=json.loads((ROOT/garden['data_file']).read_text())
            before=json.loads(subprocess.check_output(['git','show','HEAD:'+garden['data_file']],cwd=ROOT))
            self.assertEqual(score_ecological_registry(current),score_ecological_registry(before))
            arbitrary=copy.deepcopy(current)
            arbitrary.update(designer='Different practice',designer_id='different-practice',enroller='Different enroller',verifier='Different verifier')
            self.assertEqual(score_ecological_registry(current),score_ecological_registry(arbitrary))
            self.assertEqual(current.get('score'),before.get('score'))
            compared+=1
        self.assertEqual(compared,25)

    def test_directory_contains_no_private_fields(self):
        for designer in self.designers.values():
            self.assertNotIn('contact_email',designer)
            self.assertNotIn('token',designer)
            self.assertNotIn('lat',designer)

if __name__=='__main__':unittest.main()
