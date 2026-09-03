import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import type { SystemMetrics } from "../../domain/system";
import { CoreMeters, Meter, toneFor } from "../components/meter";
import { ProcessTable } from "../components/process-table";
import { StatTile, StatTileRow } from "../components/stat-tile";
import { Button, EmptyState, ErrorBox, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { bytes, dateTime, duration } from "../lib/format";
import { usePoll } from "../hooks/use-poll";
import { useQuery } from "../hooks/use-query";

/** 상위 목록에 담는 개수. 늘리려면 서버 상한(MAX_TOP=100)까지 열려 있다. */
const TOP = 20;

/**
 * 폴링 주기. 서버가 1초 캐시를 두고, 기준 스냅샷이 60초까지 유효하므로 이 값이면 매번
 * 추가 대기 없이 직전 표본과의 차이로 답이 온다.
 */
const POLL_MS = 3000;

function Card({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="dash-card">
      <header className="dash-card__head">
        <h2>{title}</h2>
        {note}
      </header>
      {children}
    </section>
  );
}

export function SystemPage() {
  const [nonce, setNonce] = useState(0);
  const [auto, setAuto] = useState(true);
  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  const state = useQuery(() => api.system({ limit: TOP }), [nonce]);

  /**
   * 아직 답이 안 온 요청을 앞지르지 않는다.
   *
   * `useQuery` 는 다시 실행할 때 `error` 를 지운다. 응답이 폴링 주기보다 느리면(서버가 답을
   * 못 주는 상황이 정확히 그렇다) 매번 에러가 지워져 화면이 영원히 스피너에 머문다.
   */
  usePoll(() => {
    if (!state.loading) refresh();
  }, auto ? POLL_MS : null);

  if (state.error) {
    return (
      <div className="dashboard">
        <ErrorBox error={state.error} onRetry={state.reload} />
      </div>
    );
  }
  if (!state.data) {
    return (
      <div className="dashboard">
        <Spinner label="시스템 지표 재는 중" />
      </div>
    );
  }

  const data: SystemMetrics = state.data;

  if (!data.supported) {
    return (
      <div className="dashboard">
        <EmptyState
          title="이 플랫폼에서는 성능 지표를 읽지 못합니다"
          hint={`/proc 이 있는 리눅스에서만 측정합니다 (지금: ${data.platform}).`}
        />
      </div>
    );
  }

  const { cpu, memory } = data;

  return (
    <div className="dashboard">
      <div className="dashboard__head">
        <span className="dashboard__updated" title={dateTime(data.sampledAt)}>
          {dateTime(data.sampledAt)} 기준 · {data.intervalMs}ms 구간
        </span>
        <div className="system__actions">
          <Button variant={auto ? "primary" : "ghost"} onClick={() => setAuto((value) => !value)}>
            {auto ? `자동 갱신 ${POLL_MS / 1000}초` : "자동 갱신 꺼짐"}
          </Button>
          <Button onClick={refresh}>새로고침</Button>
        </div>
      </div>

      <StatTileRow>
        <StatTile
          label="CPU"
          value={`${cpu.usagePercent.toFixed(1)}%`}
          tone={cpu.usagePercent >= 70 ? "accent" : "neutral"}
          hint={`코어 ${cpu.coreCount}개 · 부하 ${cpu.loadAvg.join(" / ")}`}
        />
        <StatTile
          label="메모리"
          value={`${memory.usedPercent.toFixed(1)}%`}
          tone={memory.usedPercent >= 90 ? "accent" : "neutral"}
          hint={`${bytes(memory.usedBytes)} / ${bytes(memory.totalBytes)}`}
        />
        <StatTile
          label="부하 (1분)"
          value={cpu.loadAvg[0].toFixed(2)}
          hint={`5분 ${cpu.loadAvg[1].toFixed(2)} · 15분 ${cpu.loadAvg[2].toFixed(2)} · 코어 ${cpu.coreCount}개`}
        />
        {cpu.temperatureC !== null ? (
          <StatTile
            label="온도"
            value={`${cpu.temperatureC.toFixed(1)}°C`}
            // Raspberry Pi 는 80°C 를 넘으면 클럭을 내린다. 그 전에 눈에 띄어야 한다.
            tone={cpu.temperatureC >= 75 ? "accent" : "neutral"}
            hint="80°C 부터 스로틀링"
          />
        ) : null}
        <StatTile label="프로세스" value={data.processCount.toLocaleString()} />
        <StatTile label="가동 시간" value={duration(data.uptimeSec * 1000)} />
      </StatTileRow>

      <div className="dash-grid">
        <Card title="CPU" note={<span className="system__note">코어 {cpu.coreCount}개</span>}>
          <Meter
            label="전체 사용률"
            percent={cpu.usagePercent}
            value={`부하 ${cpu.loadAvg[0].toFixed(2)} / ${cpu.loadAvg[1].toFixed(2)} / ${cpu.loadAvg[2].toFixed(2)}`}
          />
          <CoreMeters percents={cpu.perCorePercent} />
        </Card>

        <Card title="메모리">
          <Meter
            label="사용 중"
            percent={memory.usedPercent}
            value={`${bytes(memory.usedBytes)} / ${bytes(memory.totalBytes)}`}
          />
          {memory.swapTotalBytes > 0 ? (
            <Meter
              label="스왑"
              percent={memory.swapUsedPercent}
              value={`${bytes(memory.swapUsedBytes)} / ${bytes(memory.swapTotalBytes)}`}
              tone={toneFor(memory.swapUsedPercent)}
              compact
            />
          ) : null}
          <dl className="system__facts">
            <div>
              <dt>사용 가능</dt>
              <dd>{bytes(memory.availableBytes)}</dd>
            </div>
            <div>
              <dt>비어 있음</dt>
              <dd>{bytes(memory.freeBytes)}</dd>
            </div>
            <div>
              <dt>캐시</dt>
              <dd>{bytes(memory.cachedBytes)}</dd>
            </div>
            <div>
              <dt>버퍼</dt>
              <dd>{bytes(memory.buffersBytes)}</dd>
            </div>
          </dl>
        </Card>

        <Card
          title={`CPU 상위 ${TOP}`}
          note={<span className="system__note">코어 1개 = 100%</span>}
        >
          <ProcessTable rows={data.topByCpu} metric="cpu" />
        </Card>

        <Card
          title={`메모리 상위 ${TOP}`}
          note={<span className="system__note">상주 메모리(RSS)</span>}
        >
          <ProcessTable rows={data.topByMemory} metric="memory" />
        </Card>
      </div>
    </div>
  );
}
