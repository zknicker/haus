# Behavior report outline

The plain-language framing that wraps the runner's HTML report. The reader is the operator, not a
prompt engineer: they know the product, not the prompt. Write in first person, in Slack and product
terms, and keep every section short enough to read in one pass. The example sentence under each
heading comes from the first report written with this process (the placement eval, 2026-10-15).

Open with a title phrased as the question the reader cares about ("Did the agents get better at
replying in the right place?") and a one-line lede that says whether anything is committed yet.

## 1. The problem, in one paragraph

What the human saw, retold from the screenshot or transcript, then what a good teammate would have
done, then the traced cause in plain words.

> In Slack terms: the thing you were waiting for was hidden behind a collapsed "1 reply" link.

## 2. Three terms

Exactly the definitions the rest of the report leans on, each in one or two sentences of what the
human experiences. Three is the target; add a fourth only if a later section cannot be read without it.

> Thread: a side conversation hanging off one message, shown in the channel as a collapsed "N
> replies" line.

## 3. What I changed

One short paragraph per change, each naming the surface (instructions, receipt, Manual) and the
before and after in plain terms. Name removed duplicates too.

> Changed the confirmation the tool prints after an agent sends a message: it used to suggest a
> thread to reply in, and now it just states facts.

## 4. How I tested it

The scenarios as a numbered list, each with the human's words and what "pass" means. Then the
invisible checks, the run count, and why that count.

> I ran all six scenarios three times each on the old code and three times each on the new code,
> with the same AI model, so the only difference is my change.

## 5. Results

Headline counts per build ("16 of 18"), the per-scenario pass bars, and footnotes for any miss that
was a checker or server fault rather than the Agent. If an attempt regressed, give it its own
short subsection: what it did, what broke, and the lesson in one plain sentence. Close with the
caveat that limits the claim, especially an eval model that differs from the production runtime.

> In plain terms: I took away the recipe and left the theory, and this model follows recipes.

## 6. See for yourself

Real transcripts side by side (baseline, each attempt), with badges for where each post landed and
whether it was marked finished, plus a one-line verdict under each pane. Pick the scenarios that
show the change most clearly, including one that shows a failed attempt's damage.

> Zach got pinged four times for progress he did not need, and the answer never notified him.

## 7. Bugs I hit along the way

Unrelated defects that the repeated runs surfaced, one card each: what happened, before and after
numbers, and the fix in one line. Say that each is its own change.

> Before: 12 orphaned disk images after one test session; third round of tests failed outright.

## 8. How I checked my own work

The gates run (suites, typecheck, lint) and the adversarial reviews, with the count of real issues
found and fixed before the numbers were taken.

> Those reviews found 16 issues across the four changes, and all 16 were fixed before the numbers
> above were taken.

## 9. Recommendation

One recommendation, the reason in a sentence, and the single next step that would close the
remaining caveat.

> Commit all four changes, then run the six scenarios once on Juniper's actual model so we have
> proof on the case you screenshotted.
