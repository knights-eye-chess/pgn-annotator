import type { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import type { AnalysisEngine } from '@knights-eye-chess/move-classifier/core';

export interface ProcessEngineOptions {
  command?: string;
  args?: string[];
  timeoutMs?: number;
  handshakeTimeoutMs?: number;
  shutdownGraceMs?: number;
  spawnProcess?: typeof spawn;
  onSpawn?: (child: ChildProcessWithoutNullStreams) => void;
}

export interface ProcessEngine extends AnalysisEngine {
  /** Abort in-flight work, drain the child process and reject new leases. */
  close(): Promise<void>;
}

export declare function createProcessEngine(options?: ProcessEngineOptions): ProcessEngine;
