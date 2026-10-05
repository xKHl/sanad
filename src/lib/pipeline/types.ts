import type { AiError } from '@/lib/ai/analyze';
import type { Mode } from '@/lib/ai/model';
import type { AiAnalysis } from '@/lib/ai/schema';
import type { PhiType, Priority, SafetyFindings, Severity, Span } from '@/lib/safety/types';
import type { GroundingReport } from './grounding';

export type EvidenceRef = { quote: string; span: Span | null; verified: boolean };

export type MergedRedFlag = {
  source: 'rule' | 'ai';
  /** Rule id ("RF-ACS") or "AI-1", "AI-2"… */
  id: string;
  title: string;
  severity: Severity;
  reasoning: string | null;
  recommendedAction: string;
  basis: string | null;
  evidence: EvidenceRef[];
};

export type MergedMissingItem = {
  source: 'rule' | 'ai';
  id: string;
  question: string;
  whyItMatters: string;
  priority: Priority;
  category: string;
  askPatientArabic: string | null;
};

export type SafetyStatus = 'critical' | 'urgent' | 'none';

export type AnalysisResult = {
  requestId: string;
  createdAt: string;
  mode: Mode;
  /** Model label, e.g. "gemini-3.8-flash (Google)", or "…, recorded 2026-10-07" in demo mode. */
  model: string | null;
  promptVersion: string;
  rulesVersion: string;
  /** The redacted text that every span refers to. */
  analyzedText: string;
  redactions: Array<{ type: PhiType; count: number }>;
  safety: SafetyFindings;
  ai: AiAnalysis | null;
  aiError: AiError | null;
  aiAttempts: number;
  merged: {
    safetyStatus: SafetyStatus;
    redFlags: MergedRedFlag[];
    missingInformation: MergedMissingItem[];
  };
  grounding: GroundingReport | null;
  completeness: { stated: number; total: number } | null;
  timings: { safetyMs: number; aiMs: number | null; totalMs: number };
  warnings: string[];
};
