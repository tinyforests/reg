import unittest
from build_designer_demand import aggregate,month

class DemandTests(unittest.TestCase):
    def test_dedup_conversion_calibration_and_suppression(self):
        registry={'gardens':[{'garden_id':'A','designer_id':'practice'},{'garden_id':'B','designer_id':'practice'}]}
        coords={'A':{'lat':0.01,'lng':0.01},'B':{'lat':0.01,'lng':0.0101}}
        rows=[{'timestamp':'10/15/2026 12:00:00','address':'Public lookup '+str(i),'latitude':'0.01','longitude':'0.01005','evccode':'55'} for i in range(6)]
        rows += [{'timestamp':'10/15/2026 12:00:00','address':'Converted fixture','latitude':'0.01','longitude':'0.01005','evccode':'55'}, {'timestamp':'10/15/2026 12:00:00','address':'test','latitude':'0.01','longitude':'0.01005','evccode':'55'}, {'timestamp':'12/15/2025 12:00:00','address':'Calibration month','latitude':'0.01','longitude':'0.01005','evccode':'55'}, {'timestamp':'10/15/2026 12:00:00','address':'Studio fixture','latitude':'1','longitude':'1','evccode':'55'}]
        out=aggregate(rows,[{'gardenaddress':'Converted fixture'}],coords,[{'lat':1,'lng':1,'radius_m':150}],registry,{'features':[]})
        d=out['designers']['practice'];self.assertEqual(d['bands']['0-50m'],6);self.assertEqual(d['bands']['50-150m'],'<5');self.assertEqual(d['months']['2026-10'],6);self.assertEqual(d['evcs']['55'],6)
        self.assertEqual(out['public']['total'],7)
        import json
        blob=json.dumps(out)
        for key in ['Public lookup','Converted fixture','latitude','longitude','address','12:00:00']:self.assertNotIn(key,blob)

    def test_small_counts_and_missing_private_locations(self):
        registry={'gardens':[{'garden_id':'A','designer_id':'practice'}]}
        out=aggregate([],[],{},[],registry,{'features':[]});d=out['designers']['practice']
        self.assertFalse(d['available']);self.assertEqual(set(d['bands'].values()),{'<5'});self.assertEqual(out['public']['total'],'<5')

    def test_months_validate_and_use_melbourne(self):
        self.assertIsNone(month('2/30/2026 12:00:00'))
        self.assertEqual(month('2026-09-30T15:00:00Z'),'2026-10')

if __name__=='__main__':unittest.main()
