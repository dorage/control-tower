import { config } from "../config";
import type { ProcessSample, SystemMetrics } from "../domain/system";
import {
  detectPageSize,
  readCommand,
  readCpuSnapshot,
  readHostInfo,
  readMemInfo,
  readProcessTimes,
  ticksToSeconds,
  type CpuSnapshot,
  type HostInfo,
  type MemInfo,
  type ProcessTimes,
} from "../repositories/system.repository";

/** 목록에 담는 최대 개수. 라우트가 여기서 다시 잘라 낸다 — 캐시는 하나만 두려는 것이다. */
export const MAX_TOP = 100;

/** 이 아래로 짧은 간격은 표본이 아니라 잡음이다. 두 요청이 겹치면 새로 재 준다. */
const MIN_WINDOW_MS = 200;

/** 이보다 오래된 스냅샷과 비교하면 "지금" 이 아니라 "그동안의 평균" 이 된다. */
const MAX_WINDOW_MS = 60_000;

interface Snapshot {
  at: number;
  cpu: CpuSnapshot;
  procs: Map<number, ProcessTimes>;
}

/**
 * 직전 스냅샷. CPU 사용률은 누적 시간의 차이라 두 시점이 필요하다.
 *
 * 화면이 몇 초마다 물어보면 이 값이 그대로 기준점이 되어 추가 대기 없이 답한다. 오래됐거나
 * 아예 없을 때만 두 번 재느라 `sampleMs` 만큼 늦어진다.
 */
let previous: Snapshot | null = null;
let cached: { at: number; commandLimit: number; value: SystemMetrics } | null = null;
let pending: Promise<SystemMetrics> | null = null;
let pageSize: number | null = null;

/** 테스트에서 모듈 상태를 비운다. */
export function resetSystemCache(): void {
  previous = null;
  cached = null;
  pending = null;
  pageSize = null;
}

function unsupported(): SystemMetrics {
  return {
    supported: false,
    platform: process.platform,
    sampledAt: new Date().toISOString(),
    intervalMs: 0,
    uptimeSec: 0,
    processCount: 0,
    cpu: {
      usagePercent: 0,
      coreCount: 0,
      perCorePercent: [],
      loadAvg: [0, 0, 0],
      temperatureC: null,
    },
    memory: {
      totalBytes: 0,
      usedBytes: 0,
      availableBytes: 0,
      freeBytes: 0,
      buffersBytes: 0,
      cachedBytes: 0,
      usedPercent: 0,
      swapTotalBytes: 0,
      swapUsedBytes: 0,
      swapUsedPercent: 0,
    },
    topByCpu: [],
    topByMemory: [],
  };
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentBusy(previousTimes: { total: number; idle: number }, next: { total: number; idle: number }): number {
  const total = next.total - previousTimes.total;
  const idle = next.idle - previousTimes.idle;
  // 카운터가 뒤로 갔다면(리부팅, 핫 리로드 사이의 오염) 0 으로 본다.
  if (total <= 0 || idle < 0) return 0;
  return round(Math.min(Math.max((1 - idle / total) * 100, 0), 100));
}

/**
 * 두 스냅샷의 차이를 지표로 접는다. 디스크에 닿지 않는 순수 함수다 — 테스트가 여기를 본다.
 *
 * 프로세스별 `cpuPercent` 는 top 과 같은 기준이다: 코어 1개가 100%. 4코어 기기에서 한
 * 프로세스가 400 까지 갈 수 있다. 전체 사용률(`cpu.usagePercent`)과 자릿수가 다른 이유다.
 */
export function buildMetrics(
  before: Snapshot,
  after: Snapshot,
  mem: MemInfo,
  host: HostInfo,
  bytesPerPage: number,
): SystemMetrics {
  const intervalMs = Math.max(after.at - before.at, 1);
  const elapsedSec = intervalMs / 1000;
  const coreCount = after.cpu.perCore.length;

  const samples: ProcessSample[] = [];
  for (const [pid, now] of after.procs) {
    const then = before.procs.get(pid);
    // 창(window) 안에 새로 뜬 프로세스는 누적 시간 전체가 그 창에서 쌓인 것이다.
    const deltaTicks = Math.max(now.ticks - (then?.ticks ?? 0), 0);
    const memoryBytes = now.rssPages * bytesPerPage;
    samples.push({
      pid,
      ppid: now.ppid,
      name: now.comm,
      command: null,
      state: now.state,
      cpuPercent: round(
        Math.min((ticksToSeconds(deltaTicks) / elapsedSec) * 100, coreCount * 100 || 100),
      ),
      memoryBytes,
      memoryPercent: mem.totalBytes > 0 ? round((memoryBytes / mem.totalBytes) * 100, 2) : 0,
    });
  }

  const byCpu = [...samples]
    .sort((a, b) => b.cpuPercent - a.cpuPercent || b.memoryBytes - a.memoryBytes)
    .slice(0, MAX_TOP);
  const byMemory = [...samples]
    .sort((a, b) => b.memoryBytes - a.memoryBytes || b.cpuPercent - a.cpuPercent)
    .slice(0, MAX_TOP);

  const usedBytes = Math.max(mem.totalBytes - mem.availableBytes, 0);
  const swapUsedBytes = Math.max(mem.swapTotalBytes - mem.swapFreeBytes, 0);

  return {
    supported: true,
    platform: process.platform,
    sampledAt: new Date(after.at).toISOString(),
    intervalMs,
    uptimeSec: Math.round(host.uptimeSec),
    processCount: after.procs.size,
    cpu: {
      usagePercent: percentBusy(before.cpu.all, after.cpu.all),
      coreCount,
      perCorePercent: after.cpu.perCore.map((core, index) => {
        const then = before.cpu.perCore[index];
        return then ? percentBusy(then, core) : 0;
      }),
      loadAvg: host.loadAvg,
      temperatureC: host.temperatureC === null ? null : round(host.temperatureC),
    },
    memory: {
      totalBytes: mem.totalBytes,
      usedBytes,
      availableBytes: mem.availableBytes,
      freeBytes: mem.freeBytes,
      buffersBytes: mem.buffersBytes,
      cachedBytes: mem.cachedBytes,
      usedPercent: mem.totalBytes > 0 ? round((usedBytes / mem.totalBytes) * 100) : 0,
      swapTotalBytes: mem.swapTotalBytes,
      swapUsedBytes,
      swapUsedPercent:
        mem.swapTotalBytes > 0 ? round((swapUsedBytes / mem.swapTotalBytes) * 100) : 0,
    },
    topByCpu: byCpu,
    topByMemory: byMemory,
  };
}

async function takeSnapshot(): Promise<Snapshot | null> {
  const [cpu, procs] = await Promise.all([readCpuSnapshot(), readProcessTimes()]);
  if (!cpu) return null;
  return { at: Date.now(), cpu, procs };
}

/**
 * 상위 목록에 오른 프로세스만 전체 명령줄을 읽는다.
 *
 * comm 은 커널이 15자에서 자르기 때문에 `node`·`bun`·`python3` 이 여러 줄 늘어서면 무엇이
 * 무엇인지 알 수 없다. 그렇다고 수백 개 전부 cmdline 을 읽으면 폴링마다 파일 수가 두 배가
 * 되므로, 화면에 실제로 나가는 것만 읽는다.
 */
async function fillCommands(metrics: SystemMetrics, limit: number): Promise<void> {
  const targets = new Map<number, ProcessSample[]>();
  for (const sample of [...metrics.topByCpu.slice(0, limit), ...metrics.topByMemory.slice(0, limit)]) {
    if (sample.command !== null) continue;
    const list = targets.get(sample.pid);
    if (list) list.push(sample);
    else targets.set(sample.pid, [sample]);
  }

  const pids = [...targets.keys()];
  const commands = await Promise.all(pids.map((pid) => readCommand(pid)));
  pids.forEach((pid, index) => {
    for (const sample of targets.get(pid) ?? []) sample.command = commands[index] ?? null;
  });
}

async function sample(commandLimit: number): Promise<SystemMetrics> {
  if (process.platform !== "linux") return unsupported();

  if (pageSize === null) pageSize = await detectPageSize();

  let after = await takeSnapshot();
  if (!after) return unsupported();

  let before = previous;
  const age = before ? after.at - before.at : Number.POSITIVE_INFINITY;
  if (!before || age < MIN_WINDOW_MS || age > MAX_WINDOW_MS) {
    before = after;
    await Bun.sleep(config.system.sampleMs);
    const second = await takeSnapshot();
    if (!second) return unsupported();
    after = second;
  }
  previous = after;

  const [mem, host] = await Promise.all([readMemInfo(), readHostInfo()]);
  if (!mem) return unsupported();

  const metrics = buildMetrics(before, after, mem, host, pageSize);
  await fillCommands(metrics, commandLimit);
  return metrics;
}

/**
 * 지금의 호스트 성능. 목록은 `MAX_TOP` 까지 담겨 오고 자르는 것은 호출자 몫이다.
 *
 * 짧은 시간 안에 여러 번 부르면(브라우저 탭 두 개, 대시보드와 상세 화면) 같은 표본을
 * 돌려준다. /proc 전체 훑기를 요청 수만큼 반복하지 않으려는 것이다.
 */
export async function getSystemMetrics(commandLimit = 20): Promise<SystemMetrics> {
  const now = Date.now();
  if (cached && now - cached.at < config.system.cacheMs) {
    // 캐시를 만들 때보다 더 긴 목록을 달라고 하면, 아직 이름만 있는 뒷부분만 채운다.
    if (commandLimit > cached.commandLimit) {
      await fillCommands(cached.value, commandLimit);
      cached.commandLimit = commandLimit;
    }
    return cached.value;
  }
  if (pending) return pending;

  pending = sample(commandLimit)
    .then((value) => {
      cached = { at: Date.now(), commandLimit, value };
      return value;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
