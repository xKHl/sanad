# Sanad model and safety card

## Intended use

A prototype that helps a clinician in an outpatient clinic organise a short, de-identified case and think safely about it. It returns red-flag warnings, a NEWS2 score, a structured case summary, important missing information and a next-step checklist. Every output is a suggestion for a licensed clinician to review.

## Out of scope

- Diagnosis, triage decisions or treatment decisions without a clinician.
- Real patient data. The prototype is for fictional cases only.
- Medication dosing. The model is instructed never to give doses, routes or frequencies, and a deterministic dose guard removes any that still appear in its suggestions.
- Children's vital-sign interpretation beyond the explicit paediatric red-flag rules. NEWS2 is shown as not applicable under 16 and in pregnancy.

## Inputs and outputs

- Input: English free text, 20 to 3,000 characters, clinical shorthand allowed. Arabic is accepted by the AI layer; the rule layer reads English only and says so.
- Outputs: rule-based red flags with matched criteria, evidence quotes and guidance basis; NEWS2 with per-parameter points; AI case summary with a verified quote per fact; missing information (rule baseline plus AI); next steps by urgency; transparency details.

## Models

| Mode | Default model | Notes |
|------|---------------|-------|
| Cloud, free | `gemini-3.8-flash` through the Gemini API free tier | Google may use free-tier content to improve its products; acceptable only because every case is synthetic |
| Cloud, free, open-weight | `openai/gpt-oss-120b` through Groq's free tier | Same model family can run on-premise |
| Local | Any Ollama model (default `gpt-oss:20b`) | Data never leaves the machine |
| Demo | Recorded outputs of a real model for the 16 sample cases | Rule checks always run live |

The model is chosen only by server configuration. The same prompt and schema are used for every model.

## Safety layers

1. **Identifier guard.** Pattern detection of names, phone numbers, ID/Iqama numbers, record numbers, full dates and addresses; live warning with one-click removal in the browser; always applied on the server before any processing.
2. **Deterministic rules and NEWS2.** 30 red-flag rules and NEWS2 run on every request, independently of the model, and render first. The model receives their findings but cannot remove or downgrade them.
3. **Constrained model.** Versioned system prompt that treats the case as data, forbids invented facts and doses, and requires decision-support wording; strict JSON schema; one schema-repair retry; timeout.
4. **Grounding check.** Every summary fact and AI red flag must quote the case. Quotes are verified in code. Unverified facts are marked "Check"; AI red flags without a verified quote are dropped; duplicates of rule flags are dropped.
5. **Clinician in the loop.** Annotated case text, evidence that highlights the source words, "AI suggestion" labels with dashed outlines, tick boxes for review, persistent disclaimers.
6. **Graceful degradation.** Timeouts, rate limits, provider errors and schema failures return the complete rule findings with a clear message.

## Known failure modes

- **Lexicon coverage.** Uncommon phrasings, misspellings and non-English text can be missed by the rule layer.
- **Negation edge cases.** Long lists, double negatives and unusual sentence structures can be misread; family history inside complex sentences may be attributed to the patient or the reverse.
- **Thresholds.** Informed by published guidance but not clinically validated; no local calibration.
- **NEWS2.** Scale 1 only (scale 2 for hypercapnic respiratory failure is noted, not implemented); assumes room air and alert when not stated.
- **Units.** Glucose without a unit is interpreted from its value, with a warning.
- **Language model.** Can omit relevant points, misjudge priority or produce a quote that does not match; quotes are verified, interpretations are not.
- **Identifier detection.** Pattern-based; it reduces risk but cannot guarantee de-identification.

## Evaluation

See [EVALUATION.md](EVALUATION.md). Development-set rule metrics are not a measure of generalisation, because the rules were built with those cases. The held-out set is written after the rules are frozen, by a different author, and its misses are reported rather than fixed silently.

## Privacy and security

No case text is stored or logged; the server logs request metadata only. Keys stay in server environment variables. Requests are rate-limited. Security headers are set. On free tiers, prompts are processed by the provider under its terms, which is why only fictional cases may be used.

## Regulatory note

Clinical use would require clinical validation, a quality management system and software-as-a-medical-device review (for example by the Saudi Food and Drug Authority), and compliance with the Personal Data Protection Law. This prototype has none of these.

## Future work

Clinician rating study of outputs; larger and more diverse case sets; an Arabic rule lexicon; paediatric and obstetric early-warning scores; FHIR resources and CDS Hooks for EHR integration; on-premise deployment with an open-weight model.
