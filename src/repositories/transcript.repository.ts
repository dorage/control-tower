import { paths } from "../config";
import type { TranscriptRecord } from "../domain/types";
import { parseJsonl } from "../lib/text";

export interface TranscriptFileRef {
  projectId: string;
  sessionId: string;
  path: string;
  size: number;
  modifiedAt: number;
}

const TRANSCRIPT_GLOB = new Bun.Glob("*/*.jsonl");
const RECORD_CACHE_LIMIT = 8;

interface CachedRecords {
  key: string;
  records: TranscriptRecord[];
}

/** Small LRU: parsed transcripts are large, only the hot ones stay resident. */
const recordCache = new Map<string, CachedRecords>();

function cacheKey(ref: TranscriptFileRef): string {
  return `${ref.size}:${ref.modifiedAt}`;
}

export async function listTranscriptFiles(): Promise<TranscriptFileRef[]> {
  const refs: TranscriptFileRef[] = [];
  let entries: string[];
  try {
    entries = await Array.fromAsync(TRANSCRIPT_GLOB.scan({ cwd: paths.projects, onlyFiles: true }));
  } catch {
    return refs;
  }
  for (const rel of entries) {
    const slash = rel.lastIndexOf("/");
    if (slash < 0) continue;
    const projectId = rel.slice(0, slash);
    const sessionId = rel.slice(slash + 1, -".jsonl".length);
    const path = `${paths.projects}/${rel}`;
    try {
      const stat = await Bun.file(path).stat();
      refs.push({ projectId, sessionId, path, size: stat.size, modifiedAt: stat.mtimeMs });
    } catch {
      // file vanished between scan and stat
    }
  }
  return refs;
}

export async function findTranscriptFile(sessionId: string): Promise<TranscriptFileRef | null> {
  const files = await listTranscriptFiles();
  return files.find((file) => file.sessionId === sessionId) ?? null;
}

export async function readTranscript(ref: TranscriptFileRef): Promise<TranscriptRecord[]> {
  const key = cacheKey(ref);
  const cached = recordCache.get(ref.path);
  if (cached && cached.key === key) {
    // refresh LRU position
    recordCache.delete(ref.path);
    recordCache.set(ref.path, cached);
    return cached.records;
  }

  const text = await Bun.file(ref.path).text();
  const records = parseJsonl<TranscriptRecord>(text);

  recordCache.set(ref.path, { key, records });
  while (recordCache.size > RECORD_CACHE_LIMIT) {
    const oldest = recordCache.keys().next();
    if (oldest.done) break;
    recordCache.delete(oldest.value);
  }
  return records;
}
