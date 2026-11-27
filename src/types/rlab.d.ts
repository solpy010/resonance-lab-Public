// RESONANCE LAB 핵심 타입 — 레이어 옵션(schema), 레이어 모듈, 레이어, 프로젝트
// JS 파일에서는 JSDoc 으로 씁니다:  /** @type {import('./types/rlab').LayerModule} */

/** 인스펙터 옵션 종류 */
export type FieldType = 'range' | 'select' | 'bool' | 'color' | 'colors' | 'text' | 'asset' | 'assetList';

/** 레이어 옵션 한 개 (인스펙터의 슬라이더·선택·체크 하나) */
export interface SchemaField {
  /** 저장 키. 레이어 params[id] 로 저장됨 — 한 모듈 안에서 겹치면 안 됨 */
  id: string;
  label: string;
  type: FieldType;
  /** 기본값 (없으면 레이어 생성 시 undefined) */
  default?: any;
  /** range 전용 */
  min?: number;
  max?: number;
  step?: number;
  /** select 전용: [값, 표시 이름] 목록 */
  options?: Array<Array<string | number>>;
  /** 인스펙터 그룹 이름 */
  group?: string;
  /** 마우스를 올렸을 때 보이는 설명 */
  hint?: string;
  /** 키프레임 가능 */
  key?: boolean;
  /** 이 조건일 때만 활성(아니면 잠김) */
  when?: (P: Record<string, any>) => boolean;
  /** 값이 바뀌면 인스펙터를 다시 그림 (when 이 바뀌는 옵션) */
  rerender?: boolean;
}  // 정해진 키만 허용 — 오타(deafult 등)는 타입 검사에서 걸림

/** 레이어 모듈이 create() 로 돌려주는 인스턴스 */
export interface LayerInstance {
  reset?(rng: any, P: Record<string, any>): void;
  step?(dt: number, t: number, events: any[], P: Record<string, any>, rawDt?: number): void;
  render(target: any, P: Record<string, any>): void;
  dispose?(): void;
  [extra: string]: any;
}

/** 레이어 모듈 정의 — registry.modules.<이름> 에 등록 */
export interface LayerModule {
  label: string;
  icon: string;
  /** 기본 합성 방식 */
  blend: string;
  schema: SchemaField[];
  create(engine: any, layer: Layer): LayerInstance;
  /** 레이어별 표현 스타일 목록 (일부 모듈) */
  styles?: any;
}

export interface Layer {
  id: string;
  type: string;
  name: string;
  enabled?: boolean;
  params: Record<string, any>;
  /** 옵션 id → 키프레임 목록 */
  keys?: Record<string, Array<{ t: number; v: any; e?: string }>>;
  [extra: string]: any;
}

export interface Project {
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  faces: number;
  seed: number;
  layers: Layer[];
  markers?: Array<{ t: number; s?: number; [extra: string]: any }>;
  assets?: Record<string, any>;
  [extra: string]: any;
}

/** 프리셋 — registry.presets.<id> */
export interface Preset {
  label: string;
  make(): Project;
  [extra: string]: any;
}

/** 데스크톱 앱이 window.rlabNative 로 넣어 주는 기능 */
export interface NativeBridge {
  version?: string;
  [fn: string]: any;
}
