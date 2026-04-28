#!/usr/bin/env python3
"""
Select the best knowledge-base archetype for a topic via keyword matching.
Eliminates LLM token cost for archetype scoring — pure string matching.

Usage:
  kb_archetype.py --archetypes-dir <dir> --topic "<topic>"
  kb_archetype.py --archetypes-dir <dir> --topic "<topic>" --list

Output (single line, stdout):
  <archetype-name> <absolute-path-to-archetype.md>   — if a match is found
  no-match                                             — if no archetype matched

Exit codes:
  0 — always (no-match is not an error; the LLM handles on-the-fly adaptation)
"""

import argparse
import re
import sys
from pathlib import Path


def _parse_frontmatter(text: str) -> dict[str, str]:
    """Extract simple key: value pairs from YAML-style frontmatter."""
    m = re.match(r'\A---\r?\n(.*?)\r?\n---', text, re.DOTALL)
    if not m:
        return {}
    result: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ':' in line:
            k, _, v = line.partition(':')
            result[k.strip()] = v.strip()
    return result


def _parse_indicators(raw: str) -> list[str]:
    """
    Parse the domain-indicators field. Handles two YAML forms:
      domain-indicators: [kubernetes, container, pod, docker]
      domain-indicators: |
        - kubernetes
        - container
    """
    raw = raw.strip()
    if raw.startswith('['):
        # Inline list
        inner = raw.strip('[]')
        return [s.strip().strip('"\'') for s in inner.split(',') if s.strip()]
    # Block list or plain comma-separated
    items = []
    for line in raw.splitlines():
        item = line.strip().lstrip('-').strip().strip('"\'')
        if item:
            items.append(item)
    return items


def load_archetypes(archetypes_dir: str) -> list[dict]:
    """Load all archetype files (skip filenames starting with _)."""
    result = []
    for md in sorted(Path(archetypes_dir).glob('*.md')):
        if md.name.startswith('_'):
            continue
        try:
            text = md.read_text(encoding='utf-8')
        except OSError:
            continue
        fm = _parse_frontmatter(text)
        indicators = _parse_indicators(fm.get('domain-indicators', ''))
        result.append({
            'name':        fm.get('name', md.stem),
            'description': fm.get('description', '').strip(),
            'indicators':  indicators,
            'path':        str(md.resolve()),
        })
    return result


def score(archetype: dict, topic: str) -> int:
    """Count domain indicators that appear in the lowercased topic."""
    t = topic.lower()
    return sum(1 for ind in archetype['indicators'] if ind.lower() in t)


def select(archetypes: list[dict], topic: str) -> dict | None:
    """Return the best-matching archetype or None."""
    scored = [(score(a, topic), a) for a in archetypes]
    best_score = max((s for s, _ in scored), default=0)
    if best_score == 0:
        return None
    winners = [a for s, a in scored if s == best_score]
    # Tie-break: alphabetical by name (deterministic)
    return sorted(winners, key=lambda a: a['name'])[0]


def main():
    ap = argparse.ArgumentParser(description='Select knowledge-base archetype for a topic.')
    ap.add_argument('--archetypes-dir', required=True, help='Directory containing archetype .md files')
    ap.add_argument('--topic', required=True, help='Topic string to match against')
    ap.add_argument('--list', action='store_true', help='List all archetypes with scores and exit')
    args = ap.parse_args()

    archetypes = load_archetypes(args.archetypes_dir)

    if not archetypes:
        print('no-match')
        return

    if args.list:
        rows = sorted(archetypes, key=lambda a: -score(a, args.topic))
        for a in rows:
            s = score(a, args.topic)
            print(f'{s:3d}  {a["name"]:<30s}  {a["path"]}')
        return

    best = select(archetypes, args.topic)
    if best is None:
        print('no-match')
    else:
        print(f'{best["name"]} {best["path"]}')


if __name__ == '__main__':
    main()
