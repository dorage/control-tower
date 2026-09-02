import { test, expect, beforeEach } from "bun:test";
import type { CpuSnapshot, HostInfo, MemInfo, ProcessTimes } from "../repositories/system.repository";
import { buildMetrics, getSystemMetrics, MAX_TOP, resetSystemCache } from "./system.service";

const LINUX = process.platform === "linux";
const PAGE = 4096;

const HOST: HostInfo = { uptimeSec: 3600.7, loadAvg: [0.5, 0.6, 0.29], temperatureC: 46.251 };

const MEM: MemInfo = {
  totalBytes: 1000 * PAGE,
  freeBytes: 200 * PAGE,
  availableBytes: 400 * PAGE,
  buffersBytes: 50 * PAGE,
  cachedBytes: 150 * PAGE,
  swapTotalBytes: 100 * PAGE,
  swapFreeBytes: 75 * PAGE,
};

function cpu(total: number, idle: number, cores: Array<[number, number]>): CpuSnapshot {
  return { all: { total, idle }, perCore: cores.map(([t, i]) => ({ total: t, idle: i })) };
}

function proc(pid: number, ticks: number, rssPages: number, comm = `p${pid}`): ProcessTimes {
  return { pid, ppid: 1, comm, state: "S", ticks, rssPages };
}

function snapshot(at: number, cpuTimes: CpuSnapshot, procs: ProcessTimes[]) {
  return { at, cpu: cpuTimes, procs: new Map(procs.map((entry) => [entry.pid, entry])) };
}

beforeEach(() => {
  resetSystemCache();
});

// ---------------------------------------------------------------- buildMetrics

test("buildMetrics 가 idle 비율로 전체 사용률을 낸다", () => {
  // 1초 동안 총 400틱 중 idle 300틱 -> 25% 사용.
  const before = snapshot(1000, cpu(1000, 800, [[250, 200]]), []);
  const after = snapshot(2000, cpu(1400, 1100, [[350, 250]]), []);
  const metrics = buildMetrics(before, after, MEM, HOST, PAGE);
  expect(metrics.cpu.usagePercent).toBe(25);
  expect(metrics.cpu.perCorePercent).toEqual([50]);
  expect(metrics.intervalMs).toBe(1000);
});

test("buildMetrics 는 카운터가 뒤로 가면 0 으로 본다", () => {
  const before = snapshot(1000, cpu(5000, 4000, [[5000, 4000]]), []);
  const after = snapshot(2000, cpu(100, 50, [[100, 50]]), []);
  const metrics = buildMetrics(before, after, MEM, HOST, PAGE);
  expect(metrics.cpu.usagePercent).toBe(0);
  expect(metrics.cpu.perCorePercent).toEqual([0]);
});

test("프로세스 cpuPercent 는 코어 1개 기준이다", () => {
  // 1초 동안 200틱(=2초 CPU 시간)을 쓴 프로세스는 top 에서 200% 다.
  const before = snapshot(1000, cpu(1000, 500, [[500, 250], [500, 250]]), [proc(10, 0, 1)]);
  const after = snapshot(2000, cpu(2000, 1000, [[1000, 500], [1000, 500]]), [proc(10, 200, 1)]);
  const metrics = buildMetrics(before, after, MEM, HOST, PAGE);
  expect(metrics.topByCpu[0]?.cpuPercent).toBe(200);
});

test("프로세스 cpuPercent 는 전체 코어 용량을 넘지 않는다", () => {
  // 시계가 튀거나 카운터가 어긋나도 4코어에서 400% 를 넘겨 보고하지 않는다.
  const cores: Array<[number, number]> = [[0, 0], [0, 0], [0, 0], [0, 0]];
  const before = snapshot(1000, cpu(0, 0, cores), [proc(10, 0, 1)]);
  const after = snapshot(2000, cpu(1000, 0, cores), [proc(10, 9999, 1)]);
  expect(buildMetrics(before, after, MEM, HOST, PAGE).topByCpu[0]?.cpuPercent).toBe(400);
});

test("창 안에 새로 뜬 프로세스는 누적 시간 전체를 그 창에서 쓴 것으로 센다", () => {
  const before = snapshot(1000, cpu(1000, 900, [[1000, 900]]), []);
  const after = snapshot(2000, cpu(1100, 990, [[1100, 990]]), [proc(77, 50, 10)]);
  const metrics = buildMetrics(before, after, MEM, HOST, PAGE);
  expect(metrics.topByCpu[0]?.pid).toBe(77);
  expect(metrics.topByCpu[0]?.cpuPercent).toBe(50);
});

test("사라진 프로세스는 결과에 없다", () => {
  const before = snapshot(1000, cpu(0, 0, []), [proc(1, 10, 10), proc(2, 10, 10)]);
  const after = snapshot(2000, cpu(100, 50, []), [proc(1, 20, 10)]);
  const metrics = buildMetrics(before, after, MEM, HOST, PAGE);
  expect(metrics.processCount).toBe(1);
  expect(metrics.topByMemory.map((entry) => entry.pid)).toEqual([1]);
});

test("두 목록이 각자의 기준으로 정렬된다", () => {
  const cores: Array<[number, number]> = [[0, 0]];
  const before = snapshot(1000, cpu(0, 0, cores), [proc(1, 0, 0), proc(2, 0, 0), proc(3, 0, 0)]);
  const after = snapshot(2000, cpu(100, 0, cores), [
    proc(1, 10, 300, "hungry-mem"),
    proc(2, 90, 10, "hungry-cpu"),
    proc(3, 1, 1, "idle-one"),
  ]);
  const metrics = buildMetrics(before, after, MEM, HOST, PAGE);
  expect(metrics.topByCpu.map((entry) => entry.name)).toEqual([
    "hungry-cpu",
    "hungry-mem",
    "idle-one",
  ]);
  expect(metrics.topByMemory.map((entry) => entry.name)).toEqual([
    "hungry-mem",
    "hungry-cpu",
    "idle-one",
  ]);
});

test("목록은 MAX_TOP 에서 잘린다", () => {
  const many = Array.from({ length: MAX_TOP + 25 }, (_, index) => proc(index + 1, index, index));
  const before = snapshot(1000, cpu(0, 0, []), []);
  const after = snapshot(2000, cpu(100, 0, []), many);
  const metrics = buildMetrics(before, after, MEM, HOST, PAGE);
  expect(metrics.processCount).toBe(MAX_TOP + 25);
  expect(metrics.topByCpu.length).toBe(MAX_TOP);
  expect(metrics.topByMemory.length).toBe(MAX_TOP);
});

test("메모리는 available 기준으로 쓴 양을 낸다", () => {
  const before = snapshot(1000, cpu(0, 0, []), []);
  const after = snapshot(2000, cpu(100, 50, []), [proc(1, 0, 250)]);
  const metrics = buildMetrics(before, after, MEM, HOST, PAGE);
  // total 1000페이지, available 400페이지 -> 600 사용 = 60%.
  expect(metrics.memory.usedBytes).toBe(600 * PAGE);
  expect(metrics.memory.usedPercent).toBe(60);
  expect(metrics.memory.swapUsedPercent).toBe(25);
  // 250 / 1000 페이지.
  expect(metrics.topByMemory[0]?.memoryPercent).toBe(25);
  expect(metrics.topByMemory[0]?.memoryBytes).toBe(250 * PAGE);
});

test("메모리 총량이 0 이면 퍼센트를 0 으로 둔다", () => {
  const empty: MemInfo = {
    totalBytes: 0,
    freeBytes: 0,
    availableBytes: 0,
    buffersBytes: 0,
    cachedBytes: 0,
    swapTotalBytes: 0,
    swapFreeBytes: 0,
  };
  const before = snapshot(1000, cpu(0, 0, []), []);
  const after = snapshot(2000, cpu(100, 50, []), [proc(1, 0, 250)]);
  const metrics = buildMetrics(before, after, empty, HOST, PAGE);
  expect(metrics.memory.usedPercent).toBe(0);
  expect(metrics.topByMemory[0]?.memoryPercent).toBe(0);
});

test("같은 시점의 스냅샷 두 개로도 나눗셈이 터지지 않는다", () => {
  const same = snapshot(1000, cpu(100, 50, [[100, 50]]), [proc(1, 5, 5)]);
  const metrics = buildMetrics(same, same, MEM, HOST, PAGE);
  expect(metrics.intervalMs).toBe(1);
  expect(metrics.cpu.usagePercent).toBe(0);
  expect(metrics.topByCpu[0]?.cpuPercent).toBe(0);
});

test("온도와 업타임은 반올림해서 담는다", () => {
  const before = snapshot(1000, cpu(0, 0, []), []);
  const after = snapshot(2000, cpu(100, 50, []), []);
  const metrics = buildMetrics(before, after, MEM, HOST, PAGE);
  expect(metrics.cpu.temperatureC).toBe(46.3);
  expect(metrics.uptimeSec).toBe(3601);
  expect(metrics.sampledAt).toBe(new Date(2000).toISOString());
});

// ---------------------------------------------------------------- 실제 샘플링

test.if(LINUX)("getSystemMetrics 가 이 기기의 값을 읽는다", async () => {
  const metrics = await getSystemMetrics(5);
  expect(metrics.supported).toBe(true);
  expect(metrics.cpu.coreCount).toBeGreaterThan(0);
  expect(metrics.memory.totalBytes).toBeGreaterThan(0);
  expect(metrics.processCount).toBeGreaterThan(0);
  expect(metrics.intervalMs).toBeGreaterThan(0);
  // 상위 5개는 명령줄까지 채워져 있어야 한다(커널 스레드는 null 이 정상이라 존재만 본다).
  expect(metrics.topByCpu.length).toBeGreaterThan(0);
  expect(metrics.topByMemory[0]?.memoryBytes).toBeGreaterThan(0);
});

test.if(LINUX)("연달아 부르면 같은 표본을 돌려준다", async () => {
  const first = await getSystemMetrics(5);
  const second = await getSystemMetrics(5);
  expect(second.sampledAt).toBe(first.sampledAt);
});

test.if(!LINUX)("리눅스가 아니면 supported=false 로 답한다", async () => {
  const metrics = await getSystemMetrics(5);
  expect(metrics.supported).toBe(false);
  expect(metrics.topByCpu).toEqual([]);
});
