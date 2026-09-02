import type { ProcessSample } from "../../domain/system";
import { bytes } from "../lib/format";

/**
 * 상위 프로세스 목록. 표 태그 대신 행 안에 막대를 깐다 — 20줄에서 눈이 따라가야 하는 것은
 * 정렬된 칸이 아니라 "어느 것이 크냐" 하나다.
 *
 * 막대 길이는 목록 안의 최댓값 기준이다. CPU 를 전체 용량(코어 수 x 100) 대비로 그리면
 * 4코어 기기에서 모든 막대가 눈에 안 보이는 길이가 된다.
 */
export function ProcessTable({
  rows,
  metric,
  emptyHint = "프로세스가 없습니다.",
}: {
  rows: ProcessSample[];
  metric: "cpu" | "memory";
  emptyHint?: string;
}) {
  if (rows.length === 0) return <p className="dash-card__empty">{emptyHint}</p>;

  const valueOf = (row: ProcessSample) => (metric === "cpu" ? row.cpuPercent : row.memoryBytes);
  const max = Math.max(...rows.map(valueOf), 1);

  return (
    <ol className="proc-list">
      {rows.map((row) => {
        const value = valueOf(row);
        return (
          <li key={row.pid} className="proc-row">
            <span
              className={`proc-row__bar proc-row__bar--${metric}`}
              style={{ width: `${Math.max((value / max) * 100, 1.5)}%` }}
              aria-hidden="true"
            />
            <span className="proc-row__name" title={row.command ?? row.name}>
              <span className="proc-row__comm">{row.name}</span>
              {row.command ? <span className="proc-row__cmd">{row.command}</span> : null}
            </span>
            <span className="proc-row__pid" title={`부모 ${row.ppid} · 상태 ${row.state}`}>
              {row.pid}
            </span>
            <span className="proc-row__value">
              {metric === "cpu" ? (
                `${row.cpuPercent.toFixed(1)}%`
              ) : (
                <>
                  {bytes(row.memoryBytes)}
                  <span className="proc-row__pct">{row.memoryPercent.toFixed(1)}%</span>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
