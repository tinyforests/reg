"""Compute demand privately. Input paths must stay outside tracked public data.

python3 scripts/build_designer_demand.py --lookups PRIVATE.csv --enrolments PRIVATE.csv \
  --coords PRIVATE_COORDS.json --calibration PRIVATE_CALIBRATION.json --output data/private/designer-demand.json
Optional --publish posts only suppressed aggregates through the existing admin backend.
"""
import argparse
from collections import Counter
import csv
from datetime import datetime
import json
import math
import os
from pathlib import Path
import urllib.request
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = 'https://script.google.com/macros/s/AKfycbwGIau58khBRKYgq5SYwu0QjCWPa5h2dKyz4nPoeU9YMKlPN5BRXUz0LmzF7jZrqrRC/exec'
BANDS = ('0-50m','50-150m','150-300m','300-1000m')
EXCLUDED_MONTHS = {'2025-11','2025-12'}

def distance(a,b):
    lat1,lng1,lat2,lng2=map(math.radians,[a['lat'],a['lng'],b['lat'],b['lng']])
    value=math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin((lng2-lng1)/2)**2
    return 6371000*2*math.asin(min(1,math.sqrt(value)))

def normal(value): return ''.join(c for c in str(value or '').casefold() if c.isalnum())
def suppressed(value): return '<5' if value < 5 else value

def month(value):
    if isinstance(value,datetime): date=value
    else:
        text=str(value or '').strip()
        try: date=datetime.fromisoformat(text.replace('Z','+00:00'))
        except ValueError:
            try: date=datetime.strptime(text,'%m/%d/%Y %H:%M:%S')
            except ValueError:return None
    if date.tzinfo:date=date.astimezone(ZoneInfo('Australia/Melbourne'))
    return date.strftime('%Y-%m')

def private_csv(path):
    with open(path,newline='',encoding='utf-8-sig') as source:
        return [{normal(k):v for k,v in row.items()} for row in csv.DictReader(source)]

def field(row,*names):
    for name in names:
        if normal(name) in row:return row[normal(name)]
    return ''

def in_ring(x,y,ring):
    inside=False
    for i in range(len(ring)):
        xi,yi=ring[i];xj,yj=ring[i-1]
        if (yi>y)!=(yj>y) and x<(xj-xi)*(y-yi)/(yj-yi)+xi:inside=not inside
    return inside

def located_council(point,boundaries):
    x,y=point['lng'],point['lat']
    for feature in boundaries.get('features',[]):
        geo=feature['geometry'];polys=[geo['coordinates']] if geo['type']=='Polygon' else geo['coordinates'] if geo['type']=='MultiPolygon' else []
        if any(in_ring(x,y,p[0]) and not any(in_ring(x,y,h) for h in p[1:]) for p in polys):return feature['properties']['name']
    return None

def aggregate(raw,enrolments,coords,calibration,registry,boundaries):
    # Exact normalised-address matches only. Never infer a conversion from proximity.
    converted={normal(field(row,'Garden address','Address','garden_address')) for row in enrolments}
    converted.discard('')
    cleaned=[]
    for row in raw:
        stamp=field(row,'Timestamp','Submitted','date');m=month(stamp)
        addr=field(row,'Address','Garden address');lat=field(row,'Latitude','lat');lng=field(row,'Longitude','lng')
        if not m or m in EXCLUDED_MONTHS or str(addr).strip().lower()=='test' or str(lat).strip().lower()=='test':continue
        try:
            point={'lat':float(lat),'lng':float(lng)}
            if not -90<=point['lat']<=90 or not -180<=point['lng']<=180 or point=={'lat':0,'lng':0}:point=None
        except (ValueError,TypeError):point=None
        code=field(row,'EVC Code','evc_code','code').strip()
        if not code and point is None:continue
        if point and any(distance(point,c)<=c['radius_m'] for c in calibration):continue
        source=(field(row,'Source')+' '+addr).lower()
        channel='Find My Native Plants' if 'findmynativeplants' in source else 'Find My EVC' if 'findmyevc' in source else 'Other referral' if 'referral' in source else 'Direct / untagged'
        cleaned.append({'month':m,'code':code,'point':point,'converted':normal(addr) in converted,'channel':channel})
    designers={}
    ids={g.get('designer_id') for g in registry['gardens'] if g.get('designer_id') and not g.get('demo')}
    for designer in sorted(ids):
        gardens=[g for g in registry['gardens'] if g.get('designer_id')==designer and not g.get('demo')]
        points=[coords[g['garden_id']] for g in gardens if g['garden_id'] in coords]
        bands=Counter();months=Counter();evcs=Counter()
        for row in cleaned:
            if not row['point'] or row['converted'] or not points:continue
            nearest=min(distance(row['point'],p) for p in points)
            band=next((label for floor,label in zip((50,150,300,1000),BANDS) if nearest<=floor),None)
            if band:
                bands[band]+=1;months[row['month']]+=1
                if row['code']:evcs[row['code']]+=1
        designers[designer]={'available':bool(points),'location_coverage':{'attributed_gardens':len(gardens),'with_private_locations':len(points)},'bands':{b:suppressed(bands[b]) for b in BANDS},'months':{m:suppressed(n) for m,n in sorted(months.items())},'evcs':{code:suppressed(n) for code,n in sorted(evcs.items())}}
    councils=Counter(located_council(row['point'],boundaries) or 'Unassigned' for row in cleaned if row['point'])
    public={'total':suppressed(len(cleaned)),'months':{m:suppressed(n) for m,n in sorted(Counter(row['month'] for row in cleaned).items())},'evcs':{c:suppressed(n) for c,n in sorted(Counter(row['code'] for row in cleaned if row['code']).items())},'councils':{c:suppressed(n) for c,n in sorted(councils.items())},'channels':{c:suppressed(n) for c,n in sorted(Counter(row['channel'] for row in cleaned).items())}}
    return {'designers':designers,'public':public}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('lookups','enrolments','coords','calibration','output'):parser.add_argument('--'+name,required=True,type=Path)
    parser.add_argument('--publish',action='store_true');args=parser.parse_args()
    if ROOT/'data/private' not in args.output.resolve().parents:raise SystemExit('Output must be inside git-ignored data/private')
    raw=private_csv(args.lookups);enrolments=private_csv(args.enrolments)
    coords=json.loads(args.coords.read_text());calibration=json.loads(args.calibration.read_text())
    if len(calibration)<2:raise SystemExit('Both documented calibration clusters are required')
    result=aggregate(raw,enrolments,coords,calibration,json.loads((ROOT/'data/registry.json').read_text()),json.loads((ROOT/'data/live-victorian-lgas.geojson').read_text()))
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,indent=2)+'\n')
    print('Suppressed demand aggregates written to the private output. No raw row was exported.')
    if args.publish:
        token=os.environ.get('ER_ADMIN_TOKEN','')
        if not token:raise SystemExit('ER_ADMIN_TOKEN must be supplied through the secure environment')
        body=json.dumps({'submission_type':'designer_demand','action':'import','admin_token':token,'aggregates':result}).encode()
        req=urllib.request.Request(ENDPOINT,data=body,headers={'Content-Type':'text/plain;charset=utf-8'})
        with urllib.request.urlopen(req,timeout=60) as response:answer=json.load(response)
        if not answer.get('ok'):raise SystemExit('Aggregate import failed; no private data printed')
        print('Suppressed aggregates imported into the private backend.')

if __name__=='__main__':main()
