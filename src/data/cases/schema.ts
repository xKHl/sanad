import { z } from 'zod';

export const CaseSchema = z.object({
  id: z.string().regex(/^[A-Z]\d{2}$/),
  title: z.string().min(3),
  tags: z.array(z.string()).min(1),
  scenario: z.string().min(20).max(3000),
  expectedFlags: z.array(z.string().regex(/^RF-[A-Z0-9-]+$/)),
  expectedNews2: z
    .object({
      status: z.enum(['complete', 'partial', 'insufficient', 'not_applicable']),
      band: z.enum(['low', 'low-medium', 'medium', 'high']).nullable(),
      total: z.number().int().nullable(),
    })
    .nullable(),
});

export type SyntheticCase = z.infer<typeof CaseSchema>;
