import type { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import type { AnalysisEngine } from '@knights-eye-chess/move-classifier/core';

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
