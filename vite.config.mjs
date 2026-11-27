// 개발 서버 설정 — npm run dev (소스를 고치면 브라우저에 바로 반영). 배포용 빌드는 build.mjs
import { workTitles, version } from './tools/vite-plugins.mjs';
export default { root: 'src', plugins: [workTitles(process.env.RLAB_WORK === '1'), version()], server: { open: true } };
