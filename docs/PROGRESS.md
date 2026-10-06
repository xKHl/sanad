# Sanad progress log

## Status (5 October 2026)

| Area | Status |
|------|--------|
| Deterministic safety layer (identifier guard, parser, negation, NEWS2, 30 rules, required info) | Done, 395 tests, 16/16 golden cases |
| AI layer (schema, prompt, providers, retry, error mapping) | Done, tested with mock models |
| Pipeline (redaction, grounding, merge, limits, demo recordings) | Done |
| API (`/api/analyze`, `/api/status`, `/api/lab`) | Done, rate limiting, metadata-only logging |
| Interface (workspace, NEWS2 chart, annotated case, evidence highlighting, export) | Done, screenshots reviewed at 1440, 1024, 768, 390 px |
| Evaluation script, lab page, report | Done; rules-only report generated |
| Live model run, recordings, AI metrics | Pending: needs a free key (see `docs/DEPLOY.md`) |
| Held-out cases | Pending: must come from a different author |
| Deployment | Done: https://sanad-blond.vercel.app (live Gemini with fallback chain) |
| Video, submission | Pending |

## Decisions

- 2026-10-05: free providers by default (Gemini `gemini-3.8-flash`, Groq `openai/gpt-oss-120b`); temperature left at provider default for Gemini 3 and gpt-oss.
- 2026-10-05: model labels avoid separators, e.g. "gemini-3.8-flash (Google)".
- 2026-10-05: thunderclap "sudden" rule refined: "sudden" must describe the headache, not another symptom in the same sentence ("sudden nausea"). SPEC §5.6 updated.
- 2026-10-05: browser lab page added so recordings and the evaluation can be produced without a terminal; gated by `SANAD_LAB` and `SANAD_LAB_KEY`.
- 2026-10-05: no shadcn/ui (registry not reachable from the build environment); small local components with Radix Tooltip instead. Fonts from `@fontsource` packages instead of `next/font/google` for offline builds.

- 2026-10-05: RF-NEWS2-MEDIUM also fires for a single parameter scoring 3 when too few observations exist for a total (e.g. HR 150 alone). RULES_VERSION 1.1.0.

- 2026-10-06: live Gemini returned HTTP 503 (high demand) on gemini-3.8-flash and gemini-3.7-flash. Added a fallback chain within one time budget (gemini-3.7-flash, gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-flash-lite-latest, then Groq if a key exists; override with `LLM_FALLBACK_MODELS`). The result shows which model answered. Live check: chest-pain case answered by gemini-3.5-flash-lite in 9.9 s, 6/6 quotes verified.

## Open questions for the organisers

- Submission channel and format; exact time on Thursday.
- Whether "types of models typically accepted" implies a preference (cloud API vs open/local models).
