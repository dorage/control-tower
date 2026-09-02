/** 이 기기(control-tower 가 도는 호스트)의 성능 지표. 관찰 대상이 아니라 관제탑 자신이다. */

export interface CpuMetrics {
  /** 0..100. 전체 코어를 합친 사용률이다. */
  usagePercent: number;
  coreCount: number;
  /** 코어별 사용률. 각 원소가 0..100. */
  perCorePercent: number[];
  /** 1분 · 5분 · 15분 부하 평균. */
  loadAvg: [number, number, number];
  /** 열 센서가 없으면 null. Raspberry Pi 는 80°C 부터 스로틀링한다. */
  temperatureC: number | null;
}

export interface MemoryMetrics {
  totalBytes: number;
  /** total - available. 커널이 회수할 수 있는 캐시를 사용 중으로 세지 않는다. */
  usedBytes: number;
  availableBytes: number;
  freeBytes: number;
  buffersBytes: number;
  cachedBytes: number;
  /** 0..100 */
  usedPercent: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
  swapUsedPercent: number;
}

export interface ProcessSample {
  pid: number;
  ppid: number;
  /** /proc/<pid>/stat 의 comm. 커널이 15자에서 자른다. */
  name: string;
  /** /proc/<pid>/cmdline 전문. 상위 목록에 오른 프로세스에만 채운다. 커널 스레드는 null. */
  command: string | null;
  /** R/S/D/Z/T 등 한 글자 상태. */
  state: string;
  /** 코어 1개 기준(top 과 같다). 멀티코어에서 100 을 넘을 수 있다. */
  cpuPercent: number;
  memoryBytes: number;
  /** 물리 메모리 대비 0..100. */
  memoryPercent: number;
}

export interface SystemMetrics {
  /** Linux(/proc)에서만 측정한다. false 면 나머지 필드는 0/빈 배열이다. */
  supported: boolean;
  platform: string;
  sampledAt: string;
  /** CPU 사용률을 잰 구간의 길이. 짧으면 값이 튄다. */
  intervalMs: number;
  uptimeSec: number;
  processCount: number;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  topByCpu: ProcessSample[];
  topByMemory: ProcessSample[];
}
