# Sanad: product and technical specification

Version 1.1 (as built, rules v1.1.0), 5 October 2026. Source of truth for behaviour; code and tests implement it. Any change to clinical logic (§5) updates this file, the tests and `RULES_VERSION` together.

---

## 1. Context

### 1.1 The challenge

> Build a small web application for a fictional outpatient clinic. A clinician enters a short, de-identified patient scenario and the application generates:
> - a structured case summary
> - important missing information to ask about
> - a suggested next-step checklist for clinician review
> - urgent red-flag warnings when relevant
>
> The tool is a decision-support prototype, not an autonomous diagnostic system. Use only fictional or synthetic patient cases. You may use an LLM API, a local model, rules, or a hybrid approach.

Deadline Thursday 8 October 2026. Selection by the organisers' Research Unit, "based on how well the submitted work aligns with the hackathon requirements and the types of models that are typically accepted".

### 1.2 Requirements and where they are met

| ID | Requirement | Implementation | Verified by |
|----|-------------|----------------|-------------|
| R1 | Small web app, fictional outpatient clinic | Next.js app, single workspace page | Build, browser checks |
| R2 | Clinician enters a short de-identified scenario | Case panel; identifier guard (§5.2) | `phi.test.ts` |
| R3 | Structured case summary | AI layer with strict schema; grounding check (§7.3) | `ai.test.ts`, `pipeline.test.ts`, grounding metric |
| R4 | Important missing information | Rule baseline (§5.7) + AI items, deduplicated | `required-info.test.ts`, `pipeline.test.ts` |
| R5 | Next-step checklist for clinician review | AI next steps grouped by urgency, tick boxes, copy as note | Coherence metric |
| R6 | Urgent red-flag warnings | 30 deterministic rules + NEWS2, merged with grounded AI flags | `rules.test.ts`, golden test, evaluation |
| R7 | Decision support, not diagnosis | Prompt rules, no differential list, no doses, disclaimers | Prompt tests, UI copy, `SAFETY.md` |
| R8 | Fictional or synthetic cases only | Synthetic case library, banner, identifier guard | Case schema validation |
| R9 | LLM API, local model, rules or hybrid | Hybrid; cloud (free Gemini or Groq tiers by default), local (Ollama), demo modes | `ai.test.ts` model resolution |
| R10 | Support clinical thinking, organisation, safety | Annotated case, NEWS2 chart, completeness meter, transparency panel | Evaluation report |

### 1.3 Non-goals

No diagnosis output and no differential-diagnosis list (it would frame the tool as diagnostic). No real data, accounts, database or EHR integration. No medication doses. No fine-tuning.

---

## 2. Product decisions

- **Name.** Sanad (سند): Arabic for "support"; in classical scholarship also the chain of sources behind a claim. Every suggestion traces back to the clinician's words.
- **Red flags render first**, before the summary, because time-critical information comes first.
- **English interface** (the organisers work in English); optional Modern Standard Arabic wording for patient questions.
- **Free by default.** The default cloud model is the free Gemini tier (`gemini-3.8-flash`, Google AI Studio key, no card). Groq's free tier with open-weight models (`openai/gpt-oss-120b`) is the alternative. A local model through Ollama keeps data on the machine. Recorded outputs make the demo work with no key at all.

## 3. Design principles

1. **Safety never depends on the language model.** Rules and NEWS2 run on every request, render first, and cannot be removed or downgraded by the model.
2. **Grounded output.** Every summary fact and AI red flag carries a verbatim quote that code verifies. Unverified items are marked; AI flags without a verified quote are dropped.
3. **Decision-support language.** "Consider…", "Evaluate for…"; conditions only as things to evaluate for or exclude.
4. **Privacy by design.** Identifiers are redacted before the rule layer and before any model call; nothing is stored; logs carry metadata only.
5. **Transparency.** Each result shows the model, versions, rules fired and their guidance basis, timings, quote checks and redactions.
6. **Graceful degradation.** AI failures return the full rule findings with a typed reason.
7. **Model-agnostic.** Cloud, local or recorded outputs through one pipeline.

## 4. Architecture

```
Browser: case text ──► live rule preview (same code as the server)
        │
        └─► POST /api/analyze
              1 validate (20–3,000 chars)
              2 redact identifiers
              3 deterministic safety layer: parser, negation, NEWS2, 30 rules, required info
              4 AI layer: prompt + strict schema (cloud | local | recorded)
              5 grounding check on every quote
              6 merge (rules first; AI may only add grounded flags)
              ──► AnalysisResult
```

| Path | Role |
|------|------|
| `src/lib/safety` | Pure, isomorphic, deterministic. Runs in the browser and on the server. |
| `src/lib/ai` | Server-only provider code (`model`, `analyze`, `recordings`); `schema` and `prompt` are pure. |
| `src/lib/pipeline` | Orchestrator, grounding, merge, result types. |
| `src/lib/eval` | Metrics and report rendering shared by the script and the lab page. |
| `src/app/api` | `analyze`, `status`, `lab` route handlers. |

Stack: Next.js 16 (App Router), React 19, TypeScript strict with `noUncheckedIndexedAccess`, Tailwind CSS 4, Vercel AI SDK 7 with Zod 4 (`generateText` + `Output.object`), Vitest, tsx.

---

## 5. Deterministic safety layer

Thresholds are prototype values informed by the cited guidance. They are not clinically validated, and the product says so.

### 5.1 Output

`runSafetyChecks(text)` returns demographics, vitals (each with its source span), concept matches (negated / experiencer), NEWS2, rule flags (critical first, then catalog order), required-information items, a language warning, the rules version and timing. Budget: under 50 ms for 3,000 characters (tested).

### 5.2 Identifier guard

Detects and replaces: email `[EMAIL]`; Saudi mobile and `+` international numbers `[PHONE]`; 10-digit National ID / Iqama starting 1 or 2 `[ID]`; labelled record numbers `[MRN]`; full dates with a year and labelled dates of birth `[DATE]`; labelled names, honorific + capitalised name, Arabic patronymics (bin/bint/ibn, Al-) `[NAME]`; labelled addresses, street patterns, "Al-… District" `[ADDRESS]`. Must not trigger on ages, vitals, durations, relative dates, years alone, drug names, "Dr advised", lowercase text after a label. The browser warns live and offers one-click removal; the server always redacts. Pattern-based: reduces risk, does not guarantee de-identification.

### 5.3 Parser

Age (`58M`, `58-year-old`, `7-week-old`, `58 yo`, `aged 58`; months/weeks/days to fractional years), sex (marker, then words, then dominant pronouns), pregnancy (positive statements win over negative ones; gestation from weeks or LMP). Vitals: BP (needs a BP label or mmHg), HR (HR / heart rate / pulse / bpm), RR, SpO2, oxygen status (room air vs oxygen, last mention wins), temperature (bare `T` must be uppercase and separated, so never T2DM or T12; °F converted), glucose (stored as mg/dL; unit assumed from the value when missing, with a warning), ketones (numeric or `3+`/large = 3.0), GCS (number or E/V/M sum), capillary refill. Implausible values are ignored with a warning; the last reading of each vital is used and all readings are kept.

### 5.4 Concepts and negation

A lexicon of 70+ concepts (`src/lib/safety/lexicon.ts`). Negation follows NegEx-lite (Chapman et al., 2001): pre-negation cues (no, not, denies, without, nil, negative for, no history of…), post-negation cues ("Sweating: absent"), pseudo-negations ("no change", "cannot be ruled out"). Scope ends at the clause, at terminators (but, however, except, reports, complains of…), at a positive verb or at a number-led vital; a comma ends the scope unless the cue opens a list closed by "or", "nor" or "and" ("No headache, chest pain, breathlessness or visual changes"). Experiencer is `family` under a family-history header (covering the list that follows) or when a relative is followed by had/has/died/diagnosed/with; informant phrases ("per son", "brought by daughter") stay with the patient.

### 5.5 NEWS2 (RCP 2017, SpO2 scale 1)

| Parameter | 3 | 2 | 1 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|---|---|---|
| Respiration rate | ≤ 8 | | 9–11 | 12–20 | | 21–24 | ≥ 25 |
| SpO2 scale 1 (%) | ≤ 91 | 92–93 | 94–95 | ≥ 96 | | | |
| Air or oxygen | | Oxygen | | Air | | | |
| Systolic BP | ≤ 90 | 91–100 | 101–110 | 111–219 | | | ≥ 220 |
| Pulse | ≤ 40 | | 41–50 | 51–90 | 91–110 | 111–130 | ≥ 131 |
| Consciousness | | | | Alert | | | New confusion, V, P, U |
| Temperature (°C) | ≤ 35.0 | | 35.1–36.0 | 36.1–38.0 | 38.1–39.0 | ≥ 39.1 | |

Bands: high ≥ 7; medium 5–6; low-medium when one parameter scores 3 and the total is ≤ 4; low 0–4. Not applicable under 16 years or in pregnancy (with the reason shown). Oxygen and consciousness are assumed (air, alert) when not stated and marked as assumed. Fewer than 3 of the 5 measured parameters: insufficient, no total. 3–4: partial, total is a lower bound. COPD adds a scale-2 caution note.

### 5.6 Red-flag rules (30)

Definitions: adult = age ≥ 16 or unknown; fever = temperature ≥ 38 °C or a fever word; neuro deficit = facial droop, unilateral weakness or numbness, speech disturbance, sudden visual loss or ataxia; altered consciousness = confusion, drowsiness, unresponsive or GCS < 15. A concept counts only when present, not negated and about the patient.

| Rule | Severity | Fires when | Basis |
|------|----------|------------|-------|
| RF-NEWS2-HIGH | critical | NEWS2 total ≥ 7 (complete or partial) | RCP NEWS2 |
| RF-NEWS2-MEDIUM | urgent | total 5–6 (complete or partial), or any single parameter scoring 3 even when the total cannot be calculated; HIGH did not fire; not applicable under 16 or in pregnancy | RCP NEWS2 |
| RF-HYPOXIA | critical | SpO2 < 92 (< 88 with COPD) | BTS oxygen guideline |
| RF-HYPOTENSION | critical | adult and SBP < 90 | Emergency medicine |
| RF-ACS | critical | chest pain + (radiation, sweating, exertional, known coronary disease, or age ≥ 40 with breathlessness or nausea) | NICE CG95 |
| RF-PE | critical | (breathlessness, pleuritic pain or haemoptysis) + (unilateral leg swelling, recent surgery or immobility, previous VTE, oestrogen, active cancer or pregnancy) | NICE NG158 |
| RF-HTN-EMERGENCY | critical | SBP ≥ 180 or DBP ≥ 120, with chest pain, breathlessness, neuro deficit, altered consciousness, visual disturbance or headache; not pregnant | ACC/AHA, ESC/ESH |
| RF-HTN-SEVERE | urgent | SBP ≥ 180 or DBP ≥ 120 without those symptoms; not pregnant | NICE NG136 |
| RF-STROKE | critical | any neuro deficit | BE-FAST, NICE NG128 |
| RF-THUNDERCLAP | critical | thunderclap features, or "sudden" describing the headache in the same sentence (not attached to another symptom such as "sudden nausea") | NICE CG150 |
| RF-MENINGITIS | critical with fever, urgent otherwise | fever + (neck stiffness, photophobia, non-blanching rash, bulging fontanelle), or a non-blanching rash | NICE NG240 |
| RF-SEPSIS | critical | adult + (fever or infection source) + (NEWS2 ≥ 5 or qSOFA ≥ 2) | NICE NG51, Sepsis-3 |
| RF-DELIRIUM | urgent | age ≥ 65 + confusion, no neuro deficit | Geriatric medicine |
| RF-ANAPHYLAXIS | critical | (airway swelling, throat tightness, stridor, wheeze, breathlessness, or adult SBP < 90) + (allergen exposure or urticaria) | Resuscitation Council UK 2021 |
| RF-PREGNANCY-PAIN-BLEEDING | critical | pregnant + (vaginal bleeding, abdominal pain or shoulder-tip pain) | NICE NG126 |
| RF-DKA | critical if ketones ≥ 3 or symptoms, else urgent | ketones ≥ 1.5 with diabetes or glucose ≥ 250 mg/dL; or glucose ≥ 250 with vomiting, abdominal pain, Kussmaul breathing, breathlessness or altered consciousness | JBDS-IP, ADA/EASD 2024 |
| RF-HYPOGLYCAEMIA | critical if < 54 mg/dL or altered consciousness, else urgent | glucose < 70 mg/dL | ADA Standards of Care |
| RF-INFANT-FEVER | critical | age < 3 months + fever | NICE NG143 |
| RF-SUICIDE-RISK | critical | suicidal thoughts, plans or self-harm | NICE NG225 |
| RF-CAUDA-EQUINA | critical | saddle numbness; or urinary retention or incontinence with back pain or bilateral leg symptoms | GIRFT 2023 pathway |
| RF-CANCER-FEATURES | urgent | dysphagia; postmenopausal bleeding; haematuria at ≥ 45; or weight loss with haemoptysis, haematuria, rectal bleeding, night sweats or a lump | NICE NG12 |
| RF-LOW-GCS | critical | GCS ≤ 13 or unresponsive | Emergency medicine |
| RF-GI-BLEED | critical if unstable, else urgent | haematemesis or melaena; or rectal bleeding with HR ≥ 100, SBP < 100, syncope or presyncope | NICE CG141 |
| RF-PERITONISM | urgent | guarding, rebound tenderness, rigid abdomen | Surgical teaching |
| RF-TESTICULAR-TORSION | critical | testicular pain + (sudden onset or age < 25) | Urological teaching |
| RF-PREECLAMPSIA | critical if ≥ 160/110, else urgent | pregnant ≥ 20 weeks (or unknown) + BP ≥ 140/90 + (headache, visual disturbance, abdominal pain, oedema or severe-range BP) | NICE NG133 |
| RF-REDUCED-FETAL-MOVEMENTS | urgent | pregnant + reduced fetal movements | Obstetric teaching |
| RF-SEVERE-HYPERGLYCAEMIA | urgent | glucose ≥ 400 mg/dL and DKA did not fire | Diabetes teaching |
| RF-PAEDS-RED-FEATURES | critical | child + (grunting, chest indrawing, cyanosis, floppy, bulging fontanelle, mottled skin, weak or high-pitched cry, or RR > 60) | NICE NG143 |
| RF-SYNCOPE-HIGH-RISK | urgent | syncope + (exertional, chest pain, palpitations, known coronary disease or breathlessness) | NICE CG109 |

Each flag carries generated reasoning ("Chest pain + Radiation to arm/jaw/neck + Sweating"), evidence spans into the text, the recommended action (decision-support wording, no doses), the basis, and keywords used to drop duplicate AI flags. Every rule has positive, negated and near-miss tests.

### 5.7 Required information (rule baseline)

| ID | Fires when | Priority |
|----|------------|----------|
| RI-AGE-SEX | age or sex not found | high |
| RI-ALLERGIES | no allergy statement (allergy, NKDA, no known allergies) | medium |
| RI-VITALS | any red flag or key symptom, and any of HR, BP, RR, SpO2, temperature missing (lists which) | high |
| RI-MEDICATIONS | no medication statement or known drug name | medium |
| RI-PREGNANCY | female 12–50, pregnancy unknown, with abdominal pain, vaginal bleeding, syncope or any red flag | high |
| RI-GLUCOSE | glucose not measured, with a neuro deficit, altered consciousness, or diabetes with vomiting, abdominal pain or drowsiness | high |

### 5.8 Language

When more than 20% of letters are Arabic, the UI says the rule layer reads English only and the AI layer analyses the Arabic content.

---

## 6. AI layer

- **Schema** (`src/lib/ai/schema.ts`): `inputQuality`, `caseSummary` (one-liner, age, sex, pregnancy status, chief complaint and eight fact lists, every fact `{ text, evidence }`), `missingInformation` (question, why it matters, priority, category, Arabic wording), `nextSteps` (action, rationale, category, urgency, `addressesRedFlag`), `additionalRedFlags` (title, severity, evidence quotes, action). All fields required, nullable instead of optional, no unions, limits enforced after parsing.
- **Prompt** (`src/lib/ai/prompt.ts`, `PROMPT_VERSION`): the scenario is delimited and declared as data; the rule findings are passed in compact JSON so the checklist addresses every rule flag; facts only from the text with verbatim quotes; decision-support language; no doses; at most 8 missing items, 10 steps, 4 extra flags.
- **Generation**: `generateText` with `Output.object`, 45 s timeout, one retry with the validation error appended. Gemini 3 and gpt-oss use their default temperature with light reasoning (`thinkingLevel: low`, `reasoningEffort: low`); other models use temperature 0. Errors map to `timeout`, `schema`, `provider`, `rate_limited`, `not_configured`, `demo_unavailable`, with safe messages.

## 7. Pipeline

### 7.1 Steps

Validate, redact, rule layer, AI (or recording), post-process limits, grounding, merge, result with timings and warnings. AI failures return HTTP 200 with `ai: null` and `aiError`.

### 7.2 Merge

Rule flags always kept, first within each severity. AI flags kept only with at least one verified quote and when their title does not match a fired rule's keywords; ids `AI-1…`. Safety status: critical if any critical flag, urgent if any flag, otherwise none. Missing information: rule items first, AI items that duplicate a rule item's topic (allergies, medications, pregnancy, observations, glucose, age/sex) dropped, sorted by priority. Next steps sorted immediate, today, routine.

### 7.3 Grounding

Quotes are normalised (NFKC, lower case, straight quotes, plain dashes, collapsed whitespace, trimmed punctuation) and must be at least 3 characters and found in the analysed text. Matches map back to exact spans for highlighting.

### 7.4 API

`POST /api/analyze` `{ scenario, forceDemo? }` returns the full result; 400 invalid, 413 too long, 429 rate-limited with `Retry-After`, 500 with a request id. `GET /api/status` returns mode, model label, versions, rule count, recordings count; never secrets. `POST /api/lab` runs one case for the lab page; disabled unless `SANAD_LAB=true` and `SANAD_LAB_KEY` (≥ 8 characters) matches.

## 8. Modes and configuration

| Variable | Meaning |
|----------|---------|
| `SANAD_MODE` | `cloud`, `local` or `demo`; default cloud when a key exists, otherwise demo |
| `LLM_PROVIDER` | `google` (default), `groq`, `anthropic`, `openai`, `gateway` |
| `LLM_MODEL` | override; defaults `gemini-3.8-flash`, `openai/gpt-oss-120b`, `claude-sonnet-5-5`, `google/gemini-3.8-flash` (gateway); required for openai |
| `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, … | provider keys, server only |
| `OLLAMA_BASE_URL` | local OpenAI-compatible endpoint (default `http://localhost:11434/v1`) |
| `RATE_LIMIT_PER_MINUTE` | per-IP limit for `/api/analyze` (default 8, off in development) |
| `SANAD_LAB`, `SANAD_LAB_KEY` | enable the browser lab |

Demo recordings (`src/data/recordings.json`) are keyed by a SHA-256 of the normalised, redacted scenario and hold real model outputs with the model label, prompt version and date. A prompt-version mismatch is shown as a warning. Recordings are produced by `npm run record:demo` or the lab page.

## 9. Interface

Two panes. Left: the case (sample picker, text box with counter, live "read from the text" chips with their source, live rule count, identifier warning with removal, analyse button with Ctrl+Enter, recorded-output switch); after analysis, the redacted case with rule evidence underlined by severity and the selected quote highlighted. Right, in order: red flags (safety banner; rule flags with solid outlines and the rule id, AI flags with dashed outlines and "AI suggestion"; matched criteria, evidence quotes that highlight the text, guidance basis), the NEWS2 observation chart laid out like the RCP chart, the case summary (one-liner, completeness meter, sections with "Not stated", a source link or a "Check" marker on every fact), missing information by priority (rule baseline or AI, optional Arabic wording), next steps by urgency with tick boxes and links to the flags they answer, actions (copy note, download JSON, print) and a "How this result was produced" panel. States: empty with sample cases, loading (rule findings immediately, AI skeleton with elapsed time), AI unavailable, not a clinical case, request error. Severity is always icon plus text; keyboard use, focus rings and reduced motion are supported.

Visual system: Atkinson Hyperlegible Next (designed for legibility; distinct 0/O and 1/l) and IBM Plex Sans Arabic; cool chart-paper background, navy ink text, ballpoint-blue actions and evidence; clinical red and amber for severity; RCP chart colours for NEWS2.

## 10. Security and privacy

Keys only in server environment variables. No storage. One metadata log line per request (ids, timings, rule ids, counts), never case text. Per-IP rate limiting (best effort on serverless), body and input caps, security headers (`nosniff`, `DENY` framing, strict referrer, camera/microphone/geolocation off). The scenario is treated as data in the prompt; the output is schema-constrained; the rule layer is independent of the model.

## 11. Testing and evaluation

- Unit tests: identifier guard, parser, negation (SPEC examples plus more), NEWS2 band boundaries and status logic, every rule (positive, negated, near miss), required information, grounding, merge, post-processing, note export, model resolution, prompt content, API routes (validation, rate limit, no case text in logs, no secrets in status), lab gating.
- Golden test: the 16 development cases (`src/data/cases/dev.ts`) must fire exactly the expected rules and NEWS2 status/band/total.
- Evaluation (`npm run eval`, or the `/lab` page): rule sensitivity, false positives, benign specificity, NEWS2 agreement, schema validity, grounding rate, coherence (rule flags addressed by a step), complete outputs, AI-added flags, latency; development and held-out columns; a manual error-analysis section that is preserved.
- Held-out cases (`src/data/cases/holdout.ts`) are written after the rules are frozen, by a different author, and never used for tuning.

## 12. Deliverables

Repository, live URL, demo video, `README.md`, `docs/SAFETY.md`, `docs/EVALUATION.md`.
