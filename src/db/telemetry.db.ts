import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config";

let db: Database | null = null;

const SCHEMA = `
create table if not exists tel_session (
  id integer primary key,
  session_uuid text unique not null,
  first_seen integer not null,
  last_seen integer not null,
  version text,
  entrypoint text,
  terminal text
);

create table if not exists tel_series (
  id integer primary key,
  metric text not null,
  kind text, model text, query_source text,
  speed text, effort text, agent text, skill text,
  unique(metric, kind, model, query_source, speed, effort, agent, skill)
);

create table if not exists tel_point (
  ts integer not null,
  session integer not null references tel_session(id),
  series integer not null references tel_series(id),
  value real not null
);
create index if not exists ix_point on tel_point(ts, series);

create table if not exists tel_request (
  ts integer not null,
  session integer not null references tel_session(id),
  series integer not null references tel_series(id),
  input integer not null, output integer not null,
  cache_read integer not null, cache_creation integer not null,
  cost_micros integer not null, duration_ms integer not null
);
create index if not exists ix_req on tel_request(ts);

create table if not exists tel_hourly (
  bucket integer not null, series integer not null, value real not null,
  primary key(bucket, series)
) without rowid;

create table if not exists tel_daily (
  bucket integer not null, series integer not null, value real not null,
  primary key(bucket, series)
) without rowid;
`;

/**
 * Opens the store on first use, creating it if needed.
 *
 * `auto_vacuum = incremental` MUST be set before the first table exists - changing it
 * later requires a full VACUUM, which needs temp space equal to the whole database.
 * That is why it is the first statement, ahead of the schema.
 */
export function telemetryDb(): Database {
  if (db) return db;
  const path = config.telemetry.dbPath;
  mkdirSync(dirname(path), { recursive: true });
  const opened = new Database(path, { create: true });
  opened.exec("pragma auto_vacuum = incremental");
  opened.exec("pragma journal_mode = wal");
  // Keep the WAL from growing without bound between checkpoints (SD card).
  opened.exec("pragma wal_autocheckpoint = 512");
  opened.exec("pragma synchronous = normal");
  opened.exec("pragma foreign_keys = on");
  opened.exec(SCHEMA);
  db = opened;
  return db;
}

/** True when the store has been opened in this process. Avoids creating a file just to look. */
export function telemetryDbOpened(): boolean {
  return db !== null;
}

/** Test seam: drop the handle so the next call reopens from `config.telemetry.dbPath`. */
export function closeTelemetryDb(): void {
  db?.close();
  db = null;
}
