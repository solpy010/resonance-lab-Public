// CHANGELOG.md 에서 한 버전의 내용만 뽑아 Release 설명으로 쓴다.
//   node tools/release_notes.mjs 0.5.9 > notes.md
import fs from 'node:fs';
const ver = (process.argv[2] || '').replace(/^v/, '');
const md = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const m = md.split(/^## /m).find((s) => s.startsWith('v' + ver + ' ') || s.startsWith('v' + ver + '\n'));
const body = m ? m.slice(m.indexOf('\n') + 1).trim() : '(CHANGELOG.md 에 이 버전 항목이 없습니다)';
process.stdout.write(`${body}

---
- **RESONANCE_LAB_v${ver}_portable.exe** — 설치 없이 실행하는 Windows 포터블 앱(오프라인). ProRes·H.264 출력용 FFmpeg(LGPL 빌드) 포함
- 브라우저만으로 쓰려면 저장소의 \`app/RESONANCE_LAB.html\` 을 받아 크롬·엣지에서 엽니다
- 실행이 안 되면 \`docs/실행안내_다른PC에서.txt\` 참고
- 라이센스: Unlicense(퍼블릭 도메인). 함께 들어 있는 구성 요소는 THIRD_PARTY_NOTICES.md
`);
