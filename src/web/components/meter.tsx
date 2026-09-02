import type { ReactNode } from "react";

export type MeterTone = "ok" | "warn" | "danger";

/** 게이지 색은 값이 정한다. 70% 부터 주의, 90% 부터 위험. */
export function toneFor(percent: number): MeterTone {
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warn";
  return "ok";
}

/**
 * 0..100 을 채운 가로 게이지. bar-breakdown 과 달리 분모가 항상 100 이다 —
 * 사용률은 "가장 큰 값 대비" 가 아니라 "용량 대비" 로 읽어야 한다.
 */
export function Meter({
  label,
  percent,
  value,
  tone,
  compact = false,
}: {
  label: ReactNode;
  percent: number;
  /** 퍼센트 옆에 붙는 실제 수치. "3.1 GB / 7.6 GB" 처럼. */
  value?: ReactNode;
  tone?: MeterTone;
  compact?: boolean;
}) {
  const safe = Number.isFinite(percent) ? Math.min(Math.max(percent, 0), 100) : 0;
  const resolved = tone ?? toneFor(safe);

  return (
    <div className={compact ? "meter meter--compact" : "meter"}>
      <div className="meter__head">
        <span className="meter__label">{label}</span>
        <span className="meter__value">
          <strong>{safe.toFixed(1)}%</strong>
          {value ? <span className="meter__detail">{value}</span> : null}
        </span>
      </div>
      <div
        className="meter__track"
        role="meter"
        aria-valuenow={Math.round(safe)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={`meter__fill meter__fill--${resolved}`} style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}

/** 코어별 사용률. 개수가 몇 개든 한 줄에 흘려 담는다. */
export function CoreMeters({ percents }: { percents: number[] }) {
  if (percents.length === 0) return null;
  return (
    <div className="cores">
      {percents.map((percent, index) => {
        const safe = Math.min(Math.max(percent, 0), 100);
        return (
          <div key={index} className="cores__item" title={`코어 ${index} · ${safe.toFixed(1)}%`}>
            <div className="cores__track">
              <span
                className={`cores__fill cores__fill--${toneFor(safe)}`}
                style={{ height: `${Math.max(safe, 2)}%` }}
              />
            </div>
            <span className="cores__label">{index}</span>
          </div>
        );
      })}
    </div>
  );
}
