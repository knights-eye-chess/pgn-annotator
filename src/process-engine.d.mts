import type { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import type { AnalysisEngine } from '@knights-eye-chess/move-classifier/core';

export interface NativeCpuStat {
  usageUs: number | null;
  userUs: number | null;
  systemUs: number | null;
  nrPeriods: number | null;
  nrThrottled: number | null;
  throttledUs: number | null;
}

export interface NativeSearchDiagnostics {
  schema: 'native-engine-search/1';
  processReused: boolean;
  processInitializationMs: number;
  searchElapsedMs: number;
  totalElapsedMs: number;
  nodes: number | null;
  nps: number | null;
  threads: number;
  hashMb: number;
  compiler: string | null;
  binaryVariant: 'baseline' | 'avx2' | null;
  /** CPU identification only; no hostname, path or environment values. */
  cpuModel: string | null;
  /** Host-wide 1, 5 and 15 minute averages, not container-specific utilization. */
  loadAverageBefore: [number, number, number] | null;
  loadAverageAfter: [number, number, number] | null;
  /** Null quotaUs means an explicitly unlimited cgroup-v2 quota. */
  cpuQuota: { quotaUs: number | null; periodUs: number } | null;
  /** Container-wide counters; observations bracket go through bestmove. */
  cpuStatBefore: NativeCpuStat | null;
  cpuStatAfter: NativeCpuStat | null;
  /** Null on missing observations or counter reset, never negative. */
  cpuStatDelta: NativeCpuStat | null;
}

export interface ProcessEngineOptions {
  command?: string;
  args?: string[];
  timeoutMs?: number;
  handshakeTimeoutMs?: number;
  shutdownGraceMs?: number;
  spawnProcess?: typeof spawn;
  /** Retain one warm engine; concurrent calls fail immediately. */
  reuseProcess?: boolean;
  threads?: number;
  hashMb?: number;
  onSearchDiagnostics?: (diagnostics: NativeSearchDiagnostics) => void;
  onSpawn?: (child: ChildProcessWithoutNullStreams) => void;
}

export interface ProcessEngine extends AnalysisEngine {
  /** Abort in-flight work, drain the child process and reject new leases. */
  close(): Promise<void>;
}

export declare function createProcessEngine(options?: ProcessEngineOptions): ProcessEngine;
