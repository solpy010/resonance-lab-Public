// 공유 네임스페이스. 지금은 모든 모듈이 이 객체에 기능을 등록하고 서로 찾아 쓴다.
// (단계적으로 이름 있는 export 로 옮기는 중 — docs/개발_로드맵.md)
export const RL = (window.RL = window.RL || {});
