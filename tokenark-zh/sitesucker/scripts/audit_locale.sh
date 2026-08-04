#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROJECT_ROOT="$(cd "$PACKAGE_ROOT/../.." && pwd -P)"
OUTPUT="${1:-$PROJECT_ROOT/reports/sitesucker-untranslated.json}"
python3 - "$PACKAGE_ROOT/zh-Hans.lproj" "$OUTPUT" <<'PY'
import json, pathlib, re, sys
root, output = map(pathlib.Path, sys.argv[1:])
items = []
hant = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff]')
for file in sorted(root.rglob('*')):
    if not file.is_file() or file.suffix not in {'.strings', '.html'}: continue
    for line_no, line in enumerate(file.read_text(errors='ignore').splitlines(), 1):
        if hant.search(line) and re.search(r'[頁欄載資訊拖曳記憶體副檔名音訊视讯压缩封存档]', line):
            items.append({'file': str(file), 'line': line_no, 'text': line.strip()})
data = {'generatedAt': __import__('datetime').datetime.now().astimezone().isoformat(), 'candidates': items}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'output': str(output), 'candidates': len(items)}, ensure_ascii=False))
PY
