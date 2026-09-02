/**
 * 호스트 성능 지표를 /proc 에서 읽는다.
 *
 * 외부 명령(`ps`, `top`)을 부르지 않는다. `ps` 의 %cpu 는 프로세스 수명 전체의 평균이라
 * "지금 무엇이 CPU 를 먹고 있나" 에 답하지 못하고, 매 폴링마다 프로세스를 하나 띄우는 것도
 * SD 카드에서 도는 기기에서 달갑지 않다. 두 스냅샷의 차이는 서비스가 계산한다.
 *
 * 디렉터리 순회(readdir)만 node:fs 를 쓴다. 나머지 읽기는 Bun.file 이다.
 */
import { readdir } from "node:fs/promises";

/** /proc/stat 한 줄의 시간 합계. 단위는 클럭 틱. */
export interface CpuTimes {
  total: number;
  /** idle + iowait. */
  idle: number;
}

export interface ProcessTimes {
  pid: number;
  ppid: number;
  /** 커널이 15자에서 자른 실행 파일 이름. */
  comm: string;
  state: string;
  /** utime + stime, 클럭 틱. */
  ticks: number;
  /** 상주 메모리, 페이지 수. 바이트 환산은 페이지 크기를 안 뒤에 한다. */
  rssPages: number;
}

export interface CpuSnapshot {
  all: CpuTimes;
  perCore: CpuTimes[];
}

export interface MemInfo {
  totalBytes: number;
  freeBytes: number;
  availableBytes: number;
  buffersBytes: number;
  cachedBytes: number;
  swapTotalBytes: number;
  swapFreeBytes: number;
}

export interface HostInfo {
  uptimeSec: number;
  loadAvg: [number, number, number];
  temperatureC: number | null;
}

/**
 * 커널이 시간을 세는 단위. `getconf CLK_TCK` 는 리눅스 사용자 공간에서 사실상 100 으로 고정돼
 * 있고(커널 CONFIG_HZ 와 별개다), 이 값을 얻으려고 프로세스를 띄울 이유가 없다.
 */
const CLOCK_TICKS_PER_SEC = 100;

const PROC = "/proc";

/** 파일이 읽는 도중 사라지는 것은 정상 경로다 — 프로세스는 언제든 끝난다. */
async function readText(path: string): Promise<string | null> {
  try {
    return await Bun.file(path).text();
  } catch {
    return null;
  }
}

export function ticksToSeconds(ticks: number): number {
  return ticks / CLOCK_TICKS_PER_SEC;
}

/** "cpu  1 2 3 ..." 줄들을 합계와 idle 로 접는다. 알 수 없는 줄은 건너뛴다. */
export function parseCpuStat(raw: string): CpuSnapshot | null {
  let all: CpuTimes | null = null;
  const perCore: CpuTimes[] = [];

  for (const line of raw.split("\n")) {
    if (!line.startsWith("cpu")) continue;
    const parts = line.trim().split(/\s+/);
    const label = parts[0];
    if (!label) continue;

    const values: number[] = [];
    for (let i = 1; i < parts.length; i += 1) {
      const value = Number(parts[i]);
      if (!Number.isFinite(value)) break;
      values.push(value);
    }
    // user nice system idle iowait ... 최소 다섯 칸은 있어야 idle 을 신뢰할 수 있다.
    if (values.length < 5) continue;

    const total = values.reduce((acc, value) => acc + value, 0);
    const idle = (values[3] ?? 0) + (values[4] ?? 0);
    if (label === "cpu") all = { total, idle };
    else perCore.push({ total, idle });
  }

  if (!all) return null;
  return { all, perCore };
}

/** "MemTotal:  8007464 kB" 형태. 모르는 키는 무시하고 없는 키는 0 이다. */
export function parseMemInfo(raw: string): MemInfo {
  const kb = new Map<string, number>();
  for (const line of raw.split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const value = Number.parseInt(line.slice(colon + 1).trim(), 10);
    if (!Number.isFinite(value)) continue;
    kb.set(line.slice(0, colon), value);
  }
  const bytes = (key: string): number => (kb.get(key) ?? 0) * 1024;

  const total = bytes("MemTotal");
  const free = bytes("MemFree");
  // MemAvailable 은 2014년 커널부터 있다. 없으면 free + 회수 가능한 캐시로 근사한다.
  const available = kb.has("MemAvailable") ? bytes("MemAvailable") : free + bytes("Cached");

  return {
    totalBytes: total,
    freeBytes: free,
    availableBytes: Math.min(available, total),
    buffersBytes: bytes("Buffers"),
    cachedBytes: bytes("Cached"),
    swapTotalBytes: bytes("SwapTotal"),
    swapFreeBytes: bytes("SwapFree"),
  };
}

/**
 * /proc/<pid>/stat 한 줄.
 *
 * comm 은 괄호 안에 있고 공백과 괄호를 포함할 수 있다(`(Web Content)`, `(a)b)`). 그래서
 * 공백으로 자르기 전에 **마지막** 괄호를 기준으로 잘라 낸다. 앞에서 자르면 이름에 괄호가 든
 * 프로세스에서 모든 필드가 한 칸씩 밀린다.
 */
export function parseProcessStat(raw: string): ProcessTimes | null {
  const open = raw.indexOf("(");
  const close = raw.lastIndexOf(")");
  if (open < 0 || close < open) return null;

  const pid = Number.parseInt(raw.slice(0, open).trim(), 10);
  if (!Number.isFinite(pid)) return null;

  const comm = raw.slice(open + 1, close);
  // 여기부터는 stat(5) 의 3번 필드다. rest[i] === 필드 (i + 3).
  const rest = raw.slice(close + 1).trim().split(/\s+/);
  const field = (index: number): number => {
    const value = Number(rest[index - 3]);
    return Number.isFinite(value) ? value : 0;
  };

  return {
    pid,
    ppid: field(4),
    comm,
    state: rest[0] ?? "?",
    ticks: field(14) + field(15),
    rssPages: field(24),
  };
}

/** "858104.90 3396021.13" 의 앞 숫자. */
export function parseUptime(raw: string): number {
  const value = Number.parseFloat(raw.trim().split(/\s+/)[0] ?? "");
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/** "0.50 0.60 0.29 1/468 261398" 의 앞 세 숫자. */
export function parseLoadAvg(raw: string): [number, number, number] {
  const parts = raw.trim().split(/\s+/);
  const at = (index: number): number => {
    const value = Number.parseFloat(parts[index] ?? "");
    return Number.isFinite(value) ? value : 0;
  };
  return [at(0), at(1), at(2)];
}

/**
 * 페이지 크기를 프로세스 없이 알아낸다.
 *
 * /proc/self/status 의 VmRSS(kB)를 /proc/self/stat 의 rss(페이지)로 나누면 페이지 크기가
 * 나온다. `getconf PAGESIZE` 를 부르지 않으려는 것이고, 4096 을 상수로 박지 않으려는 것이다
 * (aarch64 는 16 KiB 커널이 있다). 둘 중 하나라도 못 읽으면 4096 으로 돌아간다.
 */
export async function detectPageSize(): Promise<number> {
  const [status, stat] = await Promise.all([
    readText(`${PROC}/self/status`),
    readText(`${PROC}/self/stat`),
  ]);
  if (!status || !stat) return 4096;

  const match = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
  const parsed = parseProcessStat(stat);
  if (!match?.[1] || !parsed || parsed.rssPages <= 0) return 4096;

  const size = (Number(match[1]) * 1024) / parsed.rssPages;
  // 2의 거듭제곱이 아니면 우리가 뭘 잘못 읽은 것이다. 억지로 쓰지 않는다.
  if (!Number.isInteger(size) || size < 512 || (size & (size - 1)) !== 0) return 4096;
  return size;
}

export async function readCpuSnapshot(): Promise<CpuSnapshot | null> {
  const raw = await readText(`${PROC}/stat`);
  return raw ? parseCpuStat(raw) : null;
}

export async function readMemInfo(): Promise<MemInfo | null> {
  const raw = await readText(`${PROC}/meminfo`);
  return raw ? parseMemInfo(raw) : null;
}

/**
 * 열 센서. thermal_zone0 이 Raspberry Pi 의 SoC 온도다. 없는 기기가 흔하므로 null 이 정상이다.
 */
async function readTemperature(): Promise<number | null> {
  const raw = await readText("/sys/class/thermal/thermal_zone0/temp");
  if (!raw) return null;
  const milli = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(milli)) return null;
  const celsius = milli / 1000;
  // 센서가 없는 자리에 0 이나 말도 안 되는 값이 오는 보드가 있다.
  return celsius > 0 && celsius < 150 ? celsius : null;
}

export async function readHostInfo(): Promise<HostInfo> {
  const [uptime, load, temperatureC] = await Promise.all([
    readText(`${PROC}/uptime`),
    readText(`${PROC}/loadavg`),
    readTemperature(),
  ]);
  return {
    uptimeSec: uptime ? parseUptime(uptime) : 0,
    loadAvg: load ? parseLoadAvg(load) : [0, 0, 0],
    temperatureC,
  };
}

/** /proc 의 숫자 디렉터리 = 프로세스. 그 외(디바이스, 커널 파일)는 전부 건너뛴다. */
async function listPids(): Promise<string[]> {
  try {
    const names = await readdir(PROC);
    return names.filter((name) => name.charCodeAt(0) >= 48 && name.charCodeAt(0) <= 57);
  } catch {
    return [];
  }
}

/**
 * 살아 있는 모든 프로세스의 CPU 시간과 상주 메모리.
 *
 * 프로세스당 파일 하나(`stat`)만 읽는다. 이름·메모리·CPU 가 전부 그 한 줄에 있어서, 수백 개를
 * 매 폴링마다 훑어도 파일 수가 두 배가 되지 않는다.
 */
export async function readProcessTimes(): Promise<Map<number, ProcessTimes>> {
  const pids = await listPids();
  const raws = await Promise.all(pids.map((pid) => readText(`${PROC}/${pid}/stat`)));

  const map = new Map<number, ProcessTimes>();
  for (const raw of raws) {
    if (!raw) continue;
    const parsed = parseProcessStat(raw);
    if (parsed) map.set(parsed.pid, parsed);
  }
  return map;
}

/** NUL 로 구분된 인자들. 커널 스레드는 비어 있어 null 을 돌려준다. */
export async function readCommand(pid: number): Promise<string | null> {
  const raw = await readText(`${PROC}/${pid}/cmdline`);
  if (!raw) return null;
  const command = raw.replace(/\0+$/, "").replaceAll("\0", " ").trim();
  return command || null;
}
