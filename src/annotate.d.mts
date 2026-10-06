import type { Chess, Move } from 'chess.js';
import type { AnalysisEngine, UnavailableReason } from '@knights-eye-chess/move-classifier/core';
import type { RecordedDecision, RecordedOccurrence, PolicyIdentity } from '@knights-eye-chess/move-classifier/contracts';

export declare const ANNOTATION_SCHEMA: 'pgn-annotation/1';

export interface ParsedMainLine {
  headers: Record<string, string>;
  startFen: string;
  moves: Move[];
  game: Chess;
}

export interface AnnotationBase {
  schema: typeof ANNOTATION_SCHEMA;
  ply: number;
  san: string;
  occurrence: RecordedOccurrence;
}

/** Scores are from the White perspective; mate distances are in moves. */
export type AnnotationEvaluation =
  | { perspective: 'white'; cp: number | null; mate: number | null; terminal: true }
  | { perspective: 'white'; cp: number | null; mate: number | null; depth: number };

export type Annotation =
  | (AnnotationBase & {
      status: 'complete';
      policy: PolicyIdentity;
      label: string;
      evaluation: AnnotationEvaluation;
      reasonCodes: string[];
      /** Same-before-root centipawn gap; null when comparison is unavailable. */
      lossCp: number | null;
      /** Native policy quality heuristic; distinct from lossCp. */
      policyQualityLoss: number;
      /** Optional bounded display record; never reusable as engine evidence. */
      record?: RecordedDecision;
    })
  | (AnnotationBase & {
      status: 'unavailable';
      reason: UnavailableReason;
      message: string;
      request?: Readonly<{ fen: string; depth: number; multiPv: number; rootMoves?: readonly string[] }>;
    });

export interface AnnotatedMainLine extends ParsedMainLine {
  occurrences: Annotation[];
}

export interface AnnotateOptions {
  engine?: AnalysisEngine;
  depth?: number;
  signal?: AbortSignal;
  includeRecords?: boolean;
  onOccurrence?: (item: Annotation) => void | Promise<void>;
}

export declare function parseMainLine(pgn: string): ParsedMainLine;
export declare function annotatePgn(pgn: string, options?: AnnotateOptions): Promise<AnnotatedMainLine>;
export declare function renderAnnotatedPgn(result: AnnotatedMainLine): string;
export declare function renderJsonl(result: AnnotatedMainLine): string;
