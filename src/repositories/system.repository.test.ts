import { test, expect } from "bun:test";
import {
  detectPageSize,
  parseCpuStat,
  parseLoadAvg,
  parseMemInfo,
  parseProcessStat,
  parseUptime,
  readCommand,
  readCpuSnapshot,
  readHostInfo,
  readMemInfo,
  readProcessTimes,
  ticksToSeconds,
} from "./system.repository";

const LINUX = process.platform === "linux";

// ---------------------------------------------------------------- parseCpuStat

/** 실측 /proc/stat (Raspberry Pi 5, 4코어). */
const PROC_STAT = `cpu  1395117 831721 562978 339602111 27899 0 29924 0 0 0
cpu0 337163 202250 149225 84873681 5259 0 15667 0 0 0
cpu1 349609 208468 141700 84904428 6188 0 5502 0 0 0
cpu2 355777 211466 137107 84907474 8215 0 4618 0 0 0
cpu3 352567 209536 134944 84916527 8235 0 4137 0 0 0
intr 348464543 0 1925056
ctxt 776291937
`;

test("parseCpuStat 이 합계 줄과 코어 줄을 나눈다", () => {
  const snapshot = parseCpuStat(PROC_STAT);
  expect(snapshot?.perCore.length).toBe(4);
  // idle 은 idle + iowait 다.
  expect(snapshot?.all.idle).toBe(339602111 + 27899);
  expect(snapshot?.all.total).toBe(1395117 + 831721 + 562978 + 339602111 + 27899 + 0 + 29924);
});

test("parseCpuStat 은 cpu 합계 줄이 없으면 null 이다", () => {
  expect(parseCpuStat("intr 1 2 3\nctxt 4\n")).toBeNull();
});

test("parseCpuStat 은 칸이 모자란 줄을 버린다", () => {
  // cpu9 는 네 칸뿐이라 idle 을 신뢰할 수 없다.
  const snapshot = parseCpuStat(`cpu  1 2 3 4 5\ncpu0 1 2 3 4 5\ncpu9 1 2 3 4\n`);
  expect(snapshot?.perCore.length).toBe(1);
});

test("parseCpuStat 은 빈 문자열에도 던지지 않는다", () => {
  expect(parseCpuStat("")).toBeNull();
});

// ---------------------------------------------------------------- parseMemInfo

const MEMINFO = `MemTotal:        8007464 kB
MemFree:         1586076 kB
MemAvailable:    5797336 kB
Buffers:          200160 kB
Cached:          3948712 kB
SwapTotal:        524284 kB
SwapFree:         524284 kB
HugePages_Total:       0
`;

test("parseMemInfo 가 kB 를 바이트로 바꾼다", () => {
  const mem = parseMemInfo(MEMINFO);
  expect(mem.totalBytes).toBe(8007464 * 1024);
  expect(mem.availableBytes).toBe(5797336 * 1024);
  expect(mem.swapTotalBytes).toBe(524284 * 1024);
});

test("parseMemInfo 는 MemAvailable 이 없으면 free + cached 로 근사한다", () => {
  const mem = parseMemInfo("MemTotal: 1000 kB\nMemFree: 100 kB\nCached: 300 kB\n");
  expect(mem.availableBytes).toBe(400 * 1024);
});

test("parseMemInfo 는 available 이 total 을 넘지 않게 한다", () => {
  const mem = parseMemInfo("MemTotal: 100 kB\nMemFree: 90 kB\nCached: 90 kB\n");
  expect(mem.availableBytes).toBe(100 * 1024);
});

test("parseMemInfo 는 쓰레기 입력에 0 을 돌려준다", () => {
  const mem = parseMemInfo("garbage\n\nMemTotal: not-a-number\n");
  expect(mem.totalBytes).toBe(0);
  expect(mem.freeBytes).toBe(0);
});

// ---------------------------------------------------------------- parseProcessStat

/** 실측 /proc/<pid>/stat. */
const PID_STAT =
  "261400 (cat) R 261393 261393 261393 0 -1 4194304 133 0 0 0 11 22 0 0 25 5 1 0 " +
  "85810490 5713920 323 18446744073709551615 366983184384 366983225416 549103821008 0 0 0 0 0 0 0 0 0 17 1 0 0 0 0 0";

test("parseProcessStat 이 pid·ppid·상태·시간·rss 를 읽는다", () => {
  const parsed = parseProcessStat(PID_STAT);
  expect(parsed).toEqual({
    pid: 261400,
    ppid: 261393,
    comm: "cat",
    state: "R",
    ticks: 33,
    rssPages: 323,
  });
});

test("parseProcessStat 은 이름에 공백과 괄호가 있어도 필드가 밀리지 않는다", () => {
  // 앞 괄호로 자르면 여기서 모든 필드가 어긋난다.
  const raw = PID_STAT.replace("(cat)", "(Web Content (tab))");
  const parsed = parseProcessStat(raw);
  expect(parsed?.comm).toBe("Web Content (tab)");
  expect(parsed?.ticks).toBe(33);
  expect(parsed?.rssPages).toBe(323);
});

test("parseProcessStat 은 잘린 줄에도 던지지 않는다", () => {
  expect(parseProcessStat("123 (bun) S 1")).not.toBeNull();
  expect(parseProcessStat("123 (bun) S 1")?.ticks).toBe(0);
  expect(parseProcessStat("")).toBeNull();
  expect(parseProcessStat("no parens here")).toBeNull();
});

test("ticksToSeconds 는 100Hz 기준이다", () => {
  expect(ticksToSeconds(250)).toBe(2.5);
});

// ---------------------------------------------------------------- 나머지 파서

test("parseUptime 이 앞 숫자만 읽는다", () => {
  expect(parseUptime("858104.90 3396021.13\n")).toBeCloseTo(858104.9, 1);
  expect(parseUptime("")).toBe(0);
});

test("parseLoadAvg 가 세 값을 읽는다", () => {
  expect(parseLoadAvg("0.50 0.60 0.29 1/468 261398\n")).toEqual([0.5, 0.6, 0.29]);
  expect(parseLoadAvg("")).toEqual([0, 0, 0]);
});

// ---------------------------------------------------------------- 실제 /proc

test.if(LINUX)("detectPageSize 가 2의 거듭제곱을 돌려준다", async () => {
  const size = await detectPageSize();
  expect(size).toBeGreaterThanOrEqual(4096);
  expect(size & (size - 1)).toBe(0);
});

test.if(LINUX)("readProcessTimes 가 자기 자신을 포함한다", async () => {
  const procs = await readProcessTimes();
  expect(procs.size).toBeGreaterThan(0);
  expect(procs.has(process.pid)).toBe(true);
  expect(procs.get(process.pid)?.rssPages).toBeGreaterThan(0);
});

test.if(LINUX)("readCpuSnapshot 과 readMemInfo 가 실제 값을 준다", async () => {
  const cpu = await readCpuSnapshot();
  const mem = await readMemInfo();
  expect(cpu?.perCore.length).toBeGreaterThan(0);
  expect(mem?.totalBytes).toBeGreaterThan(0);
});

test.if(LINUX)("readHostInfo 가 업타임과 부하를 준다", async () => {
  const host = await readHostInfo();
  expect(host.uptimeSec).toBeGreaterThan(0);
  expect(host.loadAvg.length).toBe(3);
});

test.if(LINUX)("readCommand 가 자기 명령줄을 읽고, 없는 pid 에는 null 이다", async () => {
  expect(await readCommand(process.pid)).toContain("bun");
  // pid 상한을 넘는 값은 존재할 수 없다.
  expect(await readCommand(2 ** 31)).toBeNull();
});
