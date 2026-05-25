"""
migrate_images.py
Extracts base64-encoded images from field note HTML files and saves them
as static files under /assets/{garden}/{note-date}-{N}.{ext}.
Replaces data URIs in the HTML with absolute URL references.

Usage:
  python scripts/migrate_images.py [--dry-run]

Run from repo root. Idempotent -- already-migrated notes have no data URIs
and will be skipped.
"""

import base64
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GARDENS   = os.path.join(REPO_ROOT, 'gardens')
ASSETS    = os.path.join(REPO_ROOT, 'assets')

EXT_MAP = {
    'jpeg': 'jpg', 'jpg': 'jpg',
    'png':  'png', 'gif': 'gif', 'webp': 'webp',
}

# Matches src="data:image/TYPE;base64,DATA" (data may span lines)
IMG_RE = re.compile(r'src="data:image/([^;]+);base64,([^"]+)"')

DRY_RUN = '--dry-run' in sys.argv


def migrate_note(html_path, garden_slug):
    with open(html_path, encoding='utf-8') as f:
        content = f.read()

    matches = list(IMG_RE.finditer(content))
    if not matches:
        return 0

    note_slug = os.path.splitext(os.path.basename(html_path))[0]
    asset_dir = os.path.join(ASSETS, garden_slug)

    print('  {} -- {} image{}'.format(
        os.path.basename(html_path),
        len(matches),
        's' if len(matches) != 1 else ''
    ))

    if DRY_RUN:
        for i, m in enumerate(matches, 1):
            img_type = m.group(1).lower()
            raw = base64.b64decode(m.group(2).strip())
            ext = EXT_MAP.get(img_type, img_type)
            filename = '{}-{:02d}.{}'.format(note_slug, i, ext)
            print('    [DRY] would save {} ({} KB)'.format(filename, len(raw) // 1024))
        return len(matches)

    os.makedirs(asset_dir, exist_ok=True)

    new_content = content
    for i, m in enumerate(matches, 1):
        img_type = m.group(1).lower()
        raw = base64.b64decode(m.group(2).strip())
        ext = EXT_MAP.get(img_type, img_type)
        filename = '{}-{:02d}.{}'.format(note_slug, i, ext)
        asset_path = os.path.join(asset_dir, filename)

        with open(asset_path, 'wb') as f:
            f.write(raw)

        web_url = '/assets/{}/{}'.format(garden_slug, filename)
        new_content = new_content.replace(
            m.group(0),
            'src="{}"'.format(web_url),
            1
        )
        print('    {:02d}. {} ({} KB)'.format(i, filename, len(raw) // 1024))

    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(new_content)

    return len(matches)


def main():
    if DRY_RUN:
        print('DRY RUN -- no files will be written\n')

    total_notes = 0
    total_images = 0

    for garden_dir in sorted(os.listdir(GARDENS)):
        fn_dir = os.path.join(GARDENS, garden_dir, 'field-notes')
        if not os.path.isdir(fn_dir):
            continue

        notes = sorted(
            f for f in os.listdir(fn_dir)
            if f.endswith('.html') and f != 'index.html'
        )

        for note_file in notes:
            html_path = os.path.join(fn_dir, note_file)
            count = migrate_note(html_path, garden_dir)
            if count:
                total_notes += 1
                total_images += count

    print()
    if DRY_RUN:
        print('{} images across {} notes would be migrated.'.format(total_images, total_notes))
    else:
        print('{} images extracted from {} notes.'.format(total_images, total_notes))
        print('Assets saved to /assets/.')


if __name__ == '__main__':
    main()
