"""
refresh_demand.py
Exports EVC lookup data from the G&S Google Sheet to data/evc-demand.json.

Usage:
  python scripts/refresh_demand.py

Requires:
  pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client

Auth: uses a service account key at secrets/sheets-service-account.json,
or falls back to Application Default Credentials (gcloud auth application-default login).

Sheet ID is hardcoded below. Column order expected:
  A: Timestamp (M/D/YYYY HH:MM:SS)
  B: Address
  C: Latitude
  D: Longitude
  E: EVC Code
  F: EVC Name
"""

import json
import os
import sys
from datetime import datetime

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH  = os.path.join(REPO_ROOT, 'data', 'evc-demand.json')

SHEET_ID  = '1Em5FvJhUyCIVLOFYtcmjXUFK--6QZDh452F6NcXDAiQ'
RANGE     = 'Sheet1!A2:F'

SERVICE_ACCOUNT_FILE = os.path.join(REPO_ROOT, 'secrets', 'sheets-service-account.json')
SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']


def get_credentials():
    if os.path.exists(SERVICE_ACCOUNT_FILE):
        from google.oauth2 import service_account
        return service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES)
    # Fall back to ADC
    import google.auth
    creds, _ = google.auth.default(scopes=SCOPES)
    return creds


def fetch_rows():
    from googleapiclient.discovery import build
    creds  = get_credentials()
    svc    = build('sheets', 'v4', credentials=creds)
    result = svc.spreadsheets().values().get(
        spreadsheetId=SHEET_ID, range=RANGE).execute()
    return result.get('values', [])


def parse_rows(raw_rows):
    rows = []
    skipped = 0
    for parts in raw_rows:
        if len(parts) < 6:
            skipped += 1
            continue
        ts_str, addr, lat_s, lng_s, evc_code, evc_name = (parts + [''] * 6)[:6]
        try:
            dt = datetime.strptime(ts_str.strip(), '%m/%d/%Y %H:%M:%S')
            date_iso = dt.strftime('%Y-%m-%d')
        except ValueError:
            skipped += 1
            continue
        try:
            lat = round(float(lat_s), 5)
            lng = round(float(lng_s), 5)
        except ValueError:
            skipped += 1
            continue
        evc_code_clean = evc_code.strip()
        rows.append({
            'date':     date_iso,
            'lat':      lat,
            'lng':      lng,
            'evc_code': int(evc_code_clean) if evc_code_clean.isdigit() else evc_code_clean,
            'evc_name': evc_name.strip() if evc_name.strip() != evc_code_clean else ''
        })
    return rows, skipped


def main():
    print('Fetching sheet data...')
    raw = fetch_rows()
    print(f'  {len(raw)} raw rows')

    rows, skipped = parse_rows(raw)
    print(f'  {len(rows)} parsed, {skipped} skipped')

    dates = sorted(set(r['date'] for r in rows))
    out = {
        'generated': datetime.today().strftime('%Y-%m-%d'),
        'source':    'fmeg/fmevc/fmnp EVC lookup log',
        'total':     len(rows),
        'date_from': dates[0] if dates else '',
        'date_to':   dates[-1] if dates else '',
        'lookups':   rows
    }

    with open(OUT_PATH, 'w') as f:
        json.dump(out, f, separators=(',', ':'))

    print(f'Saved {OUT_PATH} ({os.path.getsize(OUT_PATH) // 1024} KB)')
    print(f'Date range: {out["date_from"]} → {out["date_to"]}')


if __name__ == '__main__':
    main()
