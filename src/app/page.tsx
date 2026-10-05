import { connection } from 'next/server';
import { Workspace } from '@/components/workspace';
import { resolveModel } from '@/lib/ai/model';
import { recordingCount } from '@/lib/ai/recordings';
import { RULES_COUNT } from '@/lib/safety';

export default async function Home() {
  // Read the model configuration at request time, not at build time.
  await connection();
  const resolved = resolveModel();
  return (
    <Workspace
      status={{
        mode: resolved.mode,
        model: resolved.mode === 'demo' ? null : resolved.label,
        configError: resolved.configError,
        rulesCount: RULES_COUNT,
        recordings: recordingCount(),
      }}
    />
  );
}
