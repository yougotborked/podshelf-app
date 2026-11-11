#!/usr/bin/env python3
"""Print where com.podshelf.app stands in Google Play, from the Publishing API.

What Play Console shows on its Dashboard and Release pages, read with the service account the
publish workflow already uses: every track and the release on it, the store listing's
completeness, testers, and the app's details. The point is to know what stands between the
current state and production without clicking through the Console.

It opens an edit to read from and deletes it afterwards. Nothing is committed, so it cannot
disturb a release that is in review (only a *commit* does that; see docs/PLAY_STORE.md).

    PLAY_SERVICE_ACCOUNT_JSON='{...}' python3 scripts/play-status.py
"""
import json
import os
import sys

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

PACKAGE = 'com.podshelf.app'
BASE = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}'
IMAGE_TYPES = ['phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots', 'wearScreenshots',
               'tvScreenshots', 'icon', 'featureGraphic']
WEAR_OFFSET = 1_000_000_000


def session() -> requests.Session:
    info = json.loads(os.environ['PLAY_SERVICE_ACCOUNT_JSON'])
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=['https://www.googleapis.com/auth/androidpublisher'])
    creds.refresh(Request())
    print(f'Authenticated as {info.get("client_email")} (project {info.get("project_id")})')
    s = requests.Session()
    s.headers['Authorization'] = f'Bearer {creds.token}'
    return s


def call(s: requests.Session, method: str, path: str, ok=(200,), soft=False, body=None):
    r = s.request(method, f'{BASE}/{path}', json=body, timeout=60)
    if r.status_code in ok:
        return r.json() if r.content else {}
    msg = f'{method} {path} -> HTTP {r.status_code}: {r.text.strip()[:300]}'
    if soft:
        print(f'  (unavailable) {msg}')
        return None
    print(f'::error::{msg}')
    sys.exit(1)


def who(code: int) -> str:
    return f'{code} (watch, phone-equivalent {code - WEAR_OFFSET})' if code >= WEAR_OFFSET else f'{code}'


def probe_production(s: requests.Session, edit: str, tracks: list) -> None:
    """Ask Play whether a production release would be accepted, without making one.

    Puts the newest closed-testing release on the production track *inside this edit* and calls
    validate, which reports what would stop a commit - an account that has not met the closed
    testing requirement, a missing declaration - in Play's own words. The edit is deleted
    afterwards in main(), so no release is created and nothing goes to review.
    """
    print('\n== Would production accept a release?')
    alpha = next((t for t in tracks if t['track'] == 'alpha'), None)
    codes = []
    for rel in (alpha or {}).get('releases', []):
        codes = rel.get('versionCodes', []) or codes
    if not codes:
        print('  (skipped: no closed-testing release to promote)')
        return
    body = {'track': 'production', 'releases': [{'status': 'completed', 'versionCodes': codes,
                                                   'releaseNotes': [{'language': 'en-US', 'text': 'Probe'}]}]}
    put = call(s, 'PUT', f'edits/{edit}/tracks/production', soft=True, body=body)
    if put is None:
        return
    r = s.post(f'{BASE}/edits/{edit}:validate', timeout=60)
    if r.status_code == 200:
        print(f'  validate: OK - production would accept version code(s) {codes}')
    else:
        print(f'  validate: HTTP {r.status_code}')
        print('  ' + r.text.strip().replace('\n', '\n  ')[:1500])


def main() -> None:
    s = session()
    edit = call(s, 'POST', 'edits')['id']
    try:
        print('\n== App details')
        details = call(s, 'GET', f'edits/{edit}/details', soft=True) or {}
        for k in ('defaultLanguage', 'contactEmail', 'contactWebsite', 'contactPhone'):
            print(f'  {k}: {details.get(k, "(unset)")}')

        print('\n== Tracks')
        tracks = (call(s, 'GET', f'edits/{edit}/tracks') or {}).get('tracks', [])
        for t in sorted(tracks, key=lambda x: x['track']):
            print(f'  {t["track"]}')
            for rel in t.get('releases', []):
                codes = ', '.join(who(int(c)) for c in rel.get('versionCodes', [])) or '(none)'
                frac = f', rollout {rel["userFraction"] * 100:g}%' if 'userFraction' in rel else ''
                notes = 'with notes' if rel.get('releaseNotes') else 'no notes'
                print(f'    {rel.get("status", "?"):10} {rel.get("name", "(unnamed)")}: {codes}{frac}, {notes}')
            if not t.get('releases'):
                print('    (no releases)')

        print('\n== Testers')
        for track in ('internal', 'alpha', 'beta'):
            t = call(s, 'GET', f'edits/{edit}/testers/{track}', soft=True)
            if t is not None:
                groups = t.get('googleGroups', [])
                print(f'  {track}: {len(groups)} Google group(s) {groups}')

        print('\n== Store listings')
        listings = (call(s, 'GET', f'edits/{edit}/listings', soft=True) or {}).get('listings', [])
        for l in listings:
            print(f'  {l["language"]}: title {len(l.get("title", ""))}/30, short {len(l.get("shortDescription", ""))}/80, '
                  f'full {len(l.get("fullDescription", ""))}/4000, video {"yes" if l.get("video") else "no"}')
            for img in IMAGE_TYPES:
                imgs = (call(s, 'GET', f'edits/{edit}/listings/{l["language"]}/{img}', soft=True) or {}).get('images', [])
                if imgs:
                    print(f'    {img}: {len(imgs)}')
        if not listings:
            print('  (no listings)')

        print('\n== Uploaded bundles')
        bundles = (call(s, 'GET', f'edits/{edit}/bundles', soft=True) or {}).get('bundles', [])
        print(f'  {len(bundles)} bundle(s); newest version codes: ' +
              ', '.join(who(b['versionCode']) for b in sorted(bundles, key=lambda b: -b['versionCode'])[:6]))
        probe_production(s, edit, tracks)
    finally:
        call(s, 'DELETE', f'edits/{edit}', ok=(200, 204), soft=True)
        print('\n(edit deleted; nothing was committed)')


if __name__ == '__main__':
    main()
