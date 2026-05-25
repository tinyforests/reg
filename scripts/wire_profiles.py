"""
wire_profiles.py
One-shot script: replaces inline engine blocks in all garden profile pages
with <script src> imports from js/reg-score.js and js/badge-engine.js.

Run once from repo root:
  python scripts/wire_profiles.py

What it does per page:
  1. Inserts <script src="/js/reg-score.js"> and <script src="/js/badge-engine.js">
     immediately before the main inline <script> block.
  2. Removes the inline SCORING ENGINE + BADGE ENGINE + BDEFS block
     (everything from the SCORING ENGINE comment to just before GARDEN DATA).
  3. Replaces BDEFS[x] lookups with BADGE_DEFINITIONS[x] and .name access.
"""

import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GARDENS   = os.path.join(REPO_ROOT, 'gardens')

SRC_TAGS = (
    '<script src="/js/reg-score.js"></script>\n'
    '<script src="/js/badge-engine.js"></script>\n'
)

# Markers -- exact strings as they appear in every profile page
ENGINE_START = '/* ---- SCORING ENGINE ---- */'
ENGINE_END   = '/* ---- GARDEN DATA (loaded from JSON) ---- */'

# BDEFS lookup pattern -- profile pages use (BDEFS[varname] || varname)
# Replace with canonical BADGE_DEFINITIONS access
BDEFS_RE = re.compile(r'BDEFS\[([^\]]+)\]')


def bdefs_replacement(m):
    var = m.group(1)
    return '(BADGE_DEFINITIONS[{v}] && BADGE_DEFINITIONS[{v}].name)'.format(v=var)


def transform(path):
    with open(path) as f:
        content = f.read()

    original = content

    # 1. Insert src tags before the main <script> block
    #    The main script block starts with '<script>\n/* ---- SCORING ENGINE'
    #    Insert BEFORE the '<script>' on that line.
    script_engine_marker = '<script>\n' + ENGINE_START
    if script_engine_marker not in content:
        # Try 3-space indent variant: '<script>\n/* ...'  -- some pages have it inline
        # Fall back: find the <script> that contains the ENGINE_START comment
        idx = content.find(ENGINE_START)
        if idx == -1:
            print('  SKIP (no engine block found): ' + path)
            return False
        # Walk back to find the opening <script>
        before = content[:idx]
        script_pos = before.rfind('<script>')
        if script_pos == -1:
            print('  SKIP (no <script> before engine): ' + path)
            return False
        content = content[:script_pos] + SRC_TAGS + content[script_pos:]
    else:
        content = content.replace(
            '<script>\n' + ENGINE_START,
            SRC_TAGS + '<script>\n' + ENGINE_START,
            1
        )

    # 2. Remove the engine block (SCORING ENGINE ... just before GARDEN DATA)
    #    The block to remove: from ENGINE_START through the blank line(s) before ENGINE_END
    start_idx = content.find(ENGINE_START)
    end_idx   = content.find(ENGINE_END)
    if start_idx == -1 or end_idx == -1 or start_idx >= end_idx:
        print('  SKIP (engine block markers not found): ' + path)
        return False

    # Remove everything from ENGINE_START up to (but not including) ENGINE_END
    content = content[:start_idx] + content[end_idx:]

    # 3. Replace BDEFS[x] with canonical BADGE_DEFINITIONS lookup
    content = BDEFS_RE.sub(bdefs_replacement, content)

    if content == original:
        print('  UNCHANGED: ' + path)
        return False

    with open(path, 'w') as f:
        f.write(content)

    print('  OK: ' + path)
    return True


def main():
    pages = []
    for root, dirs, files in os.walk(GARDENS):
        if 'field-notes' in root:
            continue
        for fname in files:
            if fname == 'index.html':
                pages.append(os.path.join(root, fname))
    pages.sort()

    print('Wiring {} profile pages...\n'.format(len(pages)))
    changed = 0
    for p in pages:
        if transform(p):
            changed += 1

    print('\n{} pages updated.'.format(changed))


if __name__ == '__main__':
    main()
