#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROJECT_ROOT="$(cd "$PACKAGE_ROOT/../.." && pwd -P)"
OUTPUT="${1:-$PROJECT_ROOT/reports/sitesucker-untranslated.json}"
python3 - "$PACKAGE_ROOT/zh-Hans.lproj" "$OUTPUT" <<'PY'
import json, pathlib, re, sys
root, output = map(pathlib.Path, sys.argv[1:])
items = []
hant = re.compile(r'檔案夾|檢視|網際網路|網路|帳號|資料|儲存|設定|預設|選取|拷貝|貼上|還原|聯絡|連線|鏈結|登入|登出|下載|網址|支援|記錄|關閉|開啟|壓縮封存|音訊|視訊|頁籤|欄位|拖曳|警報|記憶體|載入|副檔名|資訊|應用程式|伺服器')
for file in sorted(root.rglob('*')):
    if not file.is_file() or file.suffix not in {'.strings', '.html'}: continue
    for line_no, line in enumerate(file.read_text(errors='ignore').splitlines(), 1):
        if hant.search(line):
            items.append({'file': str(file), 'line': line_no, 'text': line.strip()})
data = {'generatedAt': __import__('datetime').datetime.now().astimezone().isoformat(), 'candidates': items}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'output': str(output), 'candidates': len(items)}, ensure_ascii=False))
PY
