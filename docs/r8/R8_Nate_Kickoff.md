# Editor Console — kickoff brief

**To:** Nate · **From:** Ariel · **2026-08-28** · **Delivery: Tuesday 2026-09-08**

---

## 1. Background

Automated content pipeline for a weekly local newsletter in Vaughan — ~13,000 subscribers,
published Thursdays. It ingests events from about a dozen sources and assembles a candidate list
for each issue.

One person, the editor, makes the final selection. He is non-technical, works directly in Airtable,
and it takes him about four hours per issue. This project replaces that step with a review screen.

---

## 2. What already exists

```
  sources -> scraper -> Airtable -> picker -> the week's issue
                                                    |
                                            [ your component ]
                                                    |
                                      copywriter -> newsletter export
```

- **Airtable** — the database. Everything lives here. It stays.
- **The picker** — selects 5 events per section for an issue.
- **The copywriter** — generates each blurb, then exports the newsletter file.

All three work today and don't change. You're inserting one screen between the picker and the
copywriter.

---

## 3. Scope

One screen, opened by link on a laptop. It shows the current issue, already assembled:

- Three sections: Families, Couples, Golden Age
- 5 selected events each, plus a short ranked list of alternates
- Replace a selection with an alternate; undo available
- After a replace, one optional tap: *preferred the other* / *listing is broken*
- One Submit per issue

**Out:** search, filters, history, settings, dashboards, drag-and-drop, user accounts, mobile,
visible scores or model explanations.

**Start with** (mock data, no Airtable): hosting and a working deploy — first, not last · app shell
· the three-section layout · replace and undo · draft that survives refresh · the interaction log
in §5. None of that is affected by the open items in §6.

---

## 4. Constraint: the console must not write to Airtable

This is a correctness constraint, not a preference.

The picker re-runs periodically, and on each run it **deletes every unlocked row in the current and
upcoming issues** and rebuilds them from its own choices. A swap written as a normal row silently
disappears, and the newsletter still looks correct.

Locking the row breaks it the other way: **the copywriter skips locked rows**, so the event survives
with no copy, and the export script then refuses to run at all — it checks for missing copy and
stops with an error naming the section and slot. That one is loud rather than silent, but it blocks
the newsletter until someone unpicks it.

Both are avoidable in one specific order — apply, generate copy, then lock — and I own the script
that does it.

So: the console records the submitted result. How you store and expose that submission is yours.
What it has to guarantee is mine, and you'll have that contract at CP1.

---

## 5. Interaction recording

Capture at the moment of each replace: **the alternates actually shown and their order**, the
ranking version behind that order, whether the slot was valid then, and **whether he opened the
event's source link**.

Three of those exist only in the browser and can't be reconstructed later. Missing them leaves data
that looks complete and isn't usable — worse than none. Log append-only from day one, mocks
included. If a field can't be captured, mark the record incomplete rather than dropping it; submit
should still succeed.

Two rules that shape the schema:

- **Only the final submitted state counts.** A → B → C means C was chosen over A, and says nothing
  about B. Intermediate steps are audit trail.
- **An unchanged selection means nothing.** He may not have looked. Never infer preference from
  inaction.

---

## 6. Fixed vs. open

**Fixed:** three sections · 5 slots plus alternates · laptop only · single replace action · no
scores or explanations shown · post-swap tap is never a form · lands straight in the current issue ·
no Airtable writes.

**Open until CP1:** number of alternates · card contents · what "locked" means after submit.

**Now closed, and it simplifies your build:** I'd flagged that the editor might need to fill a slot
with something that was never a candidate — a sponsored event — and asked you to avoid architecture
assuming a slot can only be filled from its own alternate list. **That instruction is withdrawn.**
Sponsored events go into a different section entirely, one this console doesn't touch. A slot is
filled from its own alternates, always. Build for that.

**Ordering:** the bench order comes from a model we're replacing shortly. It currently produces
**two values per event, not one score.** Keep ordering behind a single adapter so the swap is a
one-file change, and don't introduce a scalar `score` field.

---

## 7. Decision rights

**Yours, no approval:** framework, architecture, state management, data layer, API design, project
structure, hosting, deployment, secrets, sequencing, task breakdown, estimates, tests. I won't be
assigning tasks or reviewing your plan.

**Run past me:** the auth mechanism (unguessable link + shared password is fine), and how you
implement §5.

**Escalate only if** a decision would write production data, change an editorial rule, change what
counts as recorded preference, or affect the date.

**Console hosting is yours** to pick, cost and operate. Scraper hosting is a separate open question
— assume for now I run it manually before Sunday and the data is simply there.

---

## 8. Checkpoints

**These are gates, not a calendar.** Each one has to happen and they have to happen in this order,
but I'm not putting dates on them until you tell me when you can start. Delivery to the client is
mine to manage — you tell me your real timeline and I'll work to it.

| # | Gate | What it means |
|---|---|---|
| **CP1** | **Kickoff exchange** | I give you the write contract. You give me your architecture, sequence, estimates, top risks, and anything in this brief you disagree with. |
| **CP2** | **Survival demo** | Load an issue from mock data, replace, undo, refresh without losing the draft, submit, and show me the recorded output. No production writes. |
| **CP3** | **Feature freeze** | Nothing new goes in. I run the full workflow end to end as the editor would. |
| **CP4** | **Delivery** | Built, hosted, and rehearsable. |
| **CP5** | **First real editor use** | He runs a live issue in it. |

Two things I need from you at CP1, before anything else: **when you can start**, and **how long you
think this takes** once you have. I set a client date before you'd seen the requirements, so if the
scope doesn't fit the time, I need to hear it at CP1 while there's still room to cut.
