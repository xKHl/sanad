# Deploying Sanad (free, no terminal required)

Everything below uses free tiers.

## 1. Get a free model key

1. Open [Google AI Studio](https://aistudio.google.com), sign in, choose **Get API key**, create a key. No credit card is needed.
2. Keep the key private. It goes into the deployment settings, never into the code.

Alternative: create a key at [Groq](https://console.groq.com) for the open-weight `openai/gpt-oss-120b`.

## 2. Put the code on GitHub

Create a repository (for example `sanad`) and add the project files (all files except `node_modules` and `.next`). The GitHub website accepts drag and drop of the folder contents.

## 3. Deploy on Vercel

1. In [Vercel](https://vercel.com), choose **Add New → Project**, import the repository and keep the detected Next.js settings.
2. Add environment variables:

| Name | Value |
|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | the key from step 1 |
| `SANAD_LAB` | `true` (only while recording; set back to `false` afterwards) |
| `SANAD_LAB_KEY` | any private phrase of at least 8 characters |

3. Deploy. The site works immediately: rule checks and NEWS2 always run; the AI sections use the live model.

## 4. Record demo outputs and run the evaluation

1. Open `https://<your-deployment>/lab`, enter the lab key and press **Run all cases**. Keep the pause at 4,000 ms or more on free tiers.
2. Download `recordings.json` and `EVALUATION.md`.
3. Replace `src/data/recordings.json` and `docs/EVALUATION.md` in the repository with the downloaded files (GitHub website: open the file, **Edit** or **Upload files**). Vercel redeploys automatically.
4. Set `SANAD_LAB` to `false` in Vercel and redeploy.

The recordings let reviewers try every sample case even if the free quota runs out ("Use recorded AI outputs" switch).

## 5. Held-out cases (recommended)

Ask a different author (or a separate AI chat that has not seen the rules) for 8 to 10 new fictional cases with expected red flags, in the JSON format shown on the lab page. Paste them into the lab page before running, so the report includes a held-out column. Add them to `src/data/cases/holdout.ts` afterwards, and do not change the rules because of them: misses go into the error-analysis section of `EVALUATION.md`.
