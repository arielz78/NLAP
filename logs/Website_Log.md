# Website Log — BuildWithNA (bwna-web)

Session log for bwna-web website build work.
Pipeline and infrastructure work logged separately in `Execution_Log.md`.

---

**2026-05-17 — Session 1: Home.tsx review + initial build**
**Log updated: 2026-05-17 10:52 AM**

**Website build (bwna-web)**

* Reviewed Nathan's Home.tsx rewrite — structure largely correct, placeholder copy throughout
* Made three changes to `Home.tsx`:
  * Proof section restructured: NLAP and Vaughan Brief now a visually connected pair with "running live as" connector; testimonial separate to the right
  * NLAP and Vaughan Brief copy replaced with real content based on actual project (dropped AI-speak, added real outcomes and 10-min runtime stat)
  * Phone field removed from contact form — name, email, pain point only
* Added `NA_website_build_plan.md` and `Website_Decisions.md` to `bwna-web/` repo for Nathan's reference

**Next**

* Ariel to write copy (pain points, offer block, hero subline, who-we-are story, contact microcopy)
* Nathan to wire CTAs to Cal.com link once Ariel provides it

---

**2026-05-17 — Website copy + offer strategy session**
**Log updated: 2026-05-17 9:19 PM**

**Offer architecture resolved**

* Identified contradiction in site copy: "no strings / you keep it either way" was actively disclaiming the managed service retainer, which is the actual revenue model
* Resolved via Claude.ai: model is Option C (two delivery modes) — free build is the on-ramp, fork at handoff: self-serve (one-time) or managed (recurring)
* Differentiator reframed from "no retainers" to "you own what we build" — true for both modes, doesn't close the managed path
* Copy track fully locked with Nathan's sign-off

**Copy implemented (Home.tsx + Footer.tsx)**

* Hero headline: "Your busywork. Automated." (ShinyText, animated)
* Hero subline: "We build the automation. You keep what we build."
* Hero tagline: "First automation free."
* Offer block: two-mode structure (self-serve or managed), ownership framing
* Who we are heading: "Built to ship." — replaced "We build things that matter."
* Who we are paragraph: real copy, "four hours to ten minutes" stat live
* Pain points: three specific trades/field-service examples (quote retyping, follow-up, job re-entry)
* Contact subtext: "Write what you'd automate if you could..."
* Submit button: "Start here"
* Footer CTA blurb: "Tell us what's wasting your time. First build is free."

**Style changes**

* Removed all italic serif (`<em className="serif">`) throughout — unified to plain spans
* Section labels bumped from 11px → 16px
* READY? letter-spacing fixed (0.7em → 0.14em)
* Proof card paragraphs 33% larger (14px → 19px)
* Footer wordmark: de-italicized, brightened to rgba(255,255,255,0.85)
* Merged Nathan's blue accent design pass (rgba(180,200,255) tints on borders/labels)

**Open items sent to Nathan**

* Footer BuildWithNA sizing/period
* Remove footer nav columns (site is single-scroll, no sub-pages yet)
* Standardize body text color (blue-tint vs white inconsistency)
* Standardize type scale to industry standard (labels 12–13px, body 16–18px, sub-lead 20–22px, h2 36–56px, hero 56–80px)

**Next**

* Nathan to action open items + wire CTAs to Cal.com

---

**2026-05-18 — Website build session: NLAP sub-page + type scale standardization**
**Log updated: 2026-05-18 1:02 PM**

**Pull + audit**

* Pulled Nathan's two latest commits (cb5234d, f2a20dd) — unused imports cleaned from Home.tsx and Footer.tsx, BuildWithNA wordmark removed from Footer
* Full audit of current site against Website_Decisions.md and NA_website_build_plan.md
* Cal.com removed from launch gate — Formspree to inbox confirmed as sufficient CTA path (team is small, response is fast)

**NLAP sub-page built (`src/Nlap.tsx`)**

* Created full sub-page: hero → pipeline diagram → key decisions → outcome stats → stack → CTA
* Pipeline diagram: 5 nodes (Ingest → Classify → Allocate → Generate → Export), horizontal on desktop, vertical on mobile via CSS flex-direction
* Content sourced from Decision_Log.md, VB_Portfolio_Case_Study.md, Vaughan_Metrics_Log.md — all copy is real and defensible
* Key decisions section: Airtable as editorial layer, rules-first AI, zero developer dependency
* Outcome block: "4 hrs → <10 min" in large type, "Live for Vaughan Brief. Expanding to a second newsletter."
* Type scale tokens (`T` object) defined in Nlap.tsx — canonical reference for all future pages
* Route `/nlap` added to `src/App.tsx`

**Footer cleanup (`src/components/ui/Footer.tsx`)**

* Removed nav columns (Work / Company / Connect) — single-scroll site, no sub-pages to link
* Removed italic from "meaningful." — per locked decisions
* Fixed "R E A D Y ?" → "Ready?" — label style
* Standardized to 12px labels, 18px body

**Type scale standardization (Home.tsx)**

* `SectionLabel` component: 16px → 12px, letter-spacing 0.14em → 0.12em
* Hero tagline "First automation free.": 16px → 12px
* Proof card labels: 11px → 12px
* Proof card body: 19px → 16px
* Offer body paragraphs: clamp(15–18px) → 18px (then normalized to 16px to match who-we-are)
* Who we are paragraph: 17px → 16px
* Tech stack label: 11px → 12px
* Contact "READY?" → "Ready?", 16px → 12px
* Contact h2 "Let's build something meaningful.": clamp(32–64px) → clamp(32–52px) — now matches "Built to ship." at same scale
* Contact subtext: 23px → 22px
* Form labels: 11px → 12px
* Both section h2s now on same scale: clamp(32px, 4vw, 52px)

**Hash scroll fix (Home.tsx)**

* Added `useEffect` that detects `#contact` hash on mount and scrolls to the contact section
* "Start here" CTA on the NLAP sub-page (`href="/#contact"`) now lands directly on the contact form

**Decisions made**

* Cal.com booking link removed from launch gate — Formspree form is the confirmed primary CTA
* NLAP sub-page: built as showcase (not full case study) — pipeline diagram + decisions + outcomes. Full deep-dive (ERD, architecture diagram) deferred post-launch
* "Full case study →" link on proof card now resolves — no copy change needed, teaser copy earns the click

**Open website items remaining**

* Testimonial placeholder still visible — remove or replace by May 21
* Vaughan Brief card: add "Live now, expanding to a second newsletter" clause
* Mobile: NLAP→VB connector stacking at narrow widths (untested)
* Conversion copy backlog: scarcity line, guarantee surfaced, their-outcome line (Website_Decisions.md §Conversion Backlog)
* About.tsx and Projects.tsx: lorem/placeholders still present — pages not linked but reachable by URL
* Type scale token object should be copied into About.tsx and Projects.tsx if those pages are ever used

**Next**

* Remove testimonial placeholder by May 21 if no client reply

---

**2026-05-18 — Website polish session: type scale, copy, decisions section**
**Log updated: 2026-05-18 8:56 PM**

**Full site audit + polish pass**

* Audited all font sizes, colors, and copy across Home.tsx, Nlap.tsx, Footer.tsx against the Done/Bucket checklist
* All section h2s standardized to `clamp(32px, 4vw, 52px)` — 5 headings previously had 3 different sizes
* All labels standardized to 13px, blue-tint `rgba(180,200,255,0.3)` — "Capability", "Live result", "Tech stack", "Ready?", section labels, pipeline node numbers
* Body copy color standardized to blue-tint across both pages (contact subtext was grey-white)
* NLAP/Vaughan Brief card headings matched to `clamp(24px, 2.5vw, 34px)`
* Nlap.tsx T object updated: label 13px, h3 matches home card scale, h1 matches h2
* Pipeline node stage names 16px, sub-labels 13px

**Key decisions section restructured (Nlap.tsx)**

* Rewrote from "here's what we built" to pain→solution card format with BorderGlow
* Each decision: pain (white h3) → arrow → solution body
* Copy rewritten — punchy pain lines, warm explanatory solution copy

**Copy changes (Home.tsx)**

* Hero CTA: "Get in touch ↓" → "Get your free automation ↓"
* Offer CTA: "Claim your free automation 🔗" → "Get your free automation"
* Form submit: "Let's talk." → "Start here"
* Offer body: "20-minute call" → "short call"
* Co-Founder titles: removed CEO/CTO — "Co-Founder" only
* Footer: "Build With NA" → "Built By NA"
* Nathan's name: "Nathan Chan" → "Nathaniel Chan" (his preference, resolved from merge conflict)

**Bucket status after this session**

* Bucket 2 (body text color) — closed
* Bucket 3 (VB clause) — dropped, would be misleading; testimonial still pending May 21
* Bucket 4 (conversion copy) — closed, no data to back claims
* Two new launch gates: mobile connector stacking (untested), Formspree delivery (unconfirmed)

**Next**

* Test Formspree — send real submission, confirm receipt in inbox before going live
* Test mobile — NLAP→VB connector stacking on phone
* Remove testimonial placeholder by May 21 if no client reply

---

**2026-05-19 — Website docs reorganization**
**Log updated: 2026-05-19 11:05 AM**

**Website_Decisions.md audited and split**

* Reviewed fix list against locked decisions — removed contradictory "low-friction secondary CTA" item (conflicts with REJECTED: free audit as CTA)
* Moved "Fix dark blue text visibility" from 🟢 Polish → 🟠 High Priority (credibility issue, not cosmetic)
* Moved "Add Vaughan Brief logo" from 🟠 High Priority → 🟢 Polish (optional aesthetic)
* Added guarantee and outcome line items from conversion backlog to fix list (🟠 Copy); crossed off in backlog
* Added bullet points to all fix list items
* Split `Website_Decisions.md` into two files: `Website_Decisions.md` (permanent locked/rejected decisions) and `Website_Fixlist.md` (active pre-launch checklist with checkboxes + priority tiers)
* Moved both files + build plan into `docs/` subfolder via `git mv`

**Build plan vs. current state cross-check**

* All build plan sections confirmed built (Hero, Problem, Offer, Proof, Who we are, Contact, NLAP sub-page)
* Two launch gates missing from fix list — added: real logo in nav, zero lorem/placeholder check
* `NA_website_build_plan.md` deleted from repo — build is done, all relevant items transferred
* Committed and pushed to `bwna-web` (rebased cleanly over Nathan's one commit ahead)

**Next**

* Complete fix list launch gates before going live

---

**2026-05-26 — Copy rewrite + mobile fixes**
**Log updated: 2026-05-26 9:54 PM**

**Copy rewrites (Home.tsx)**

* Hero headline: "Your busywork. Automated." → "Your multi-step process. Built into one pipeline." (split into two ShinyText lines)
* Hero subline: "We build the automation. You keep what we build." → "We build it. You own it."
* Hero CTA: "Get your free automation ↓" / "Get your free automation" → "Get a free build ↓" / "Get a free build" (both instances)
* "First automation free." tagline — commented out (not deleted; easy to restore)
* Offer headline: "Your first automation, on us." → "First build free."
* Offer body: fully rewritten — "One full pipeline. Built end-to-end. Yours to keep. / We scope it on a short call... / If it works, we keep building."
* Proof card label: "CAPABILITY" → "WHAT WE BUILT"
* Proof card title: "Newsletter Automation Pipeline" → "Automated Newsletter Pipeline"
* Proof card body: rewritten — operational description replacing AI-speak ("Rules handle the easy calls; AI handles the ambiguous ones.")
* Vaughan Brief card: "LIVE RESULT" label removed; body rewritten — "A Vaughan-area events newsletter. What used to take 4 hours... Running every week since launch."
* First client block: "a newsletter run by family. It's been running every week since launch." → "a local events newsletter in the GTA." (cut third mention of cadence, cut family line)
* Testimonial: tightened from 8 sentences to 4 — cut "Four hours down to ten minutes, every week" (stated 3x already) and redundant "When something is explained properly..." sentence
* "Built to ship." body: rewritten — "We build full pipelines for operators who run their business by hand. We scope it, build it, hand it over, support it."
* Contact headline: "Let's build something meaningful." → "Tell us what's eating your week."
* Contact subtitle: "Write what you'd automate if you could..." → "Drop us a note. We'll set up a short call and scope your free build."
* Contact subtitle font: 22px fixed → 18px (aligned with rest of body)
* Case study CTA: "See how we turned 4 hrs → 10 min ›" — added then removed chevron; left as-is (animated border is the click signal)

**Tech stack cleanup (Home.tsx + About.tsx)**

* LangChain and pgvector removed from AI/ML stack in both files

**Mobile fixes (Home.tsx)**

* Hero font: `text-7xl` → `text-4xl md:text-7xl` — 36px mobile, 72px desktop
* Hero CTA buttons: new `.hero-cta-group` class — row on desktop, column on mobile (≤480px)
* Pain points: `.pain-row` media query — column on mobile (≤480px), ordinal sits above bullet text at full width
* Case study CTA button: `whiteSpace: nowrap` + `alignSelf: center` — one line, centered

**Fix list items closed this session**

* "Newsletter Automation Pipeline heading too long" — closed (renamed)
* "Change 'Let's build something meaningful'" — closed (new headline)
* "FIRST AUTOMATION FREE. nearly invisible — remove" — closed (commented out)
* Mobile hero font size — closed
* Mobile CTA stacking — closed
* Mobile pain points ordinals — closed

---

**2026-05-26 — Website polish session: proof section + copy cleanup**
**Log updated: 2026-05-19 11:19 PM**

**Copy cleanup**

* Removed "expanding to a second newsletter" from Nlap.tsx — replaced with "Running every week since launch."
* Removed all user-visible "NLAP" references: heading → "Newsletter Automation Pipeline", Vaughan Brief card description → "The pipeline running live...", sub-page label → "Case Study"
* CTA button text → "See how we turned 4 hrs → 10 min" (was "Full case study →")

**Proof section improvements**

* Added continuous looping white glow animation to case study CTA button (conic-gradient border beam, 4s linear)
* Button sized up to match `.cta-primary` (15px / 500 weight / padding 14px 32px)
* Button width set to `fit-content` — was stretching full card width
* Tried left-align on offer section, reverted — center is correct for a centerpiece conversion block

**Fix list updated**

* Formspree, "expanding to second newsletter", "replace NLAP", "change panel glow" crossed off
* "Newsletter Automation Pipeline heading too long" added to 🟠 Design
* "Move testimonial higher" removed — decided to leave section order as-is

**Next**

* Complete remaining fix list launch gates before going live

---

**2026-05-27 — Color system standardization**
**Log updated: 2026-05-27 11:34 AM**

**Color system overhauled (Home.tsx, Nlap.tsx, Footer.tsx)**

* Replaced entire blue-tint text system with a single cool grey: `rgba(200,210,225,0.75)`
* Previous system had two tiers — labels at 0.3, body at 0.4 — both dim and hard to read on dark background
* New single value covers: body copy, section labels, ordinal numbers, form labels, form placeholders, attribution text, "running live as" connector + flanking lines, footer body text
* Near-white exceptions kept intentionally: pain points `rgba(255,255,255,0.65)`, testimonial quote `rgba(255,255,255,0.7)` — brighter for hierarchy
* "Editor, The Vaughan Brief" fixed from `#fff` (heading white) → `rgba(200,210,225,0.75)` — attribution, not a heading
* Card borders bumped from 0.1 → 0.15 opacity (`rgba(80,120,220,0.15)` and `rgba(255,255,255,0.15)`) — more visible on dark background
* Decision solution body text (`rgba(255,255,255,0.65)` in Nlap.tsx) — left open, not yet decided

**Fix list closed**

* Dark blue text visibility — closed
* Testimonial colours — closed
* NLAP→VB mobile connector — closed (tested, stacks cleanly)

**Next**

* Decide decision body text color (rgba(255,255,255,0.65) vs cool grey)
* Standardize type sizing — each panel should sit cleanly in viewport at 100% scroll

---

**2026-05-26 — Nlap.tsx copy + mobile fixes**
**Log updated: 2026-05-26 11:06 PM**

**Copy fixes (Nlap.tsx)**

* H1: "Automated." → "Built as one pipeline." — cleaner, avoids contradiction with Decision #3
* Hero subheading: removed "without manual intervention" — direct contradiction with Decision #3 (intentional human publish step); replaced with "Editor reviews and publishes weekly."
* Pipeline 02 sub: "AI segment routing" → "Rules + AI fallback" — old copy undercut the moat (Decision #2 is rules-first, not AI-first)
* Decision #3 body: colon after "We didn't" → period — punchier
* Result section: cut redundant trailing line — "running weekly since launch" already present two lines above
* CTA button: "Start here" → "Get a free build" — consistency with homepage; same offer, same button

**Stack section rebuilt (Nlap.tsx)**

* Replaced chip list with "Stack & why" block — each tool tied to a decision rationale, not just named
* Added n8n, reordered to match pipeline execution flow: n8n → Airtable → OpenAI → Node.js → Beehiiv
* Mobile layout: tool name on its own line (white, 15px), description below (muted, 14px)

**Mobile fixes (Nlap.tsx)**

* Stat row: stacks vertically on mobile (≤600px); arrow rotates 90° (↓), 18px, margin-left 40px to align with text
* Key Decisions: BorderGlow cards strip on mobile (no border/shadow/bg/radius); divider lines per item; grid collapses to single column — number → pain → body stacked full width (matches homepage pain-row treatment)
* `.wrap` mobile padding: 24px → 32px — more breathing room across the page

**Fix list updated**

* Closed: stat arrow mobile, decisions mobile layout
* Added: homepage `.wrap` padding still at 24px — needs the same update

---

**2026-05-27 — Fix list closeout session**
**Log updated: 2026-05-27 12:35 PM**

**Fix list pruned**

* Parked: nav anchor links, animations on remaining sections, volume signal, positioning rewrite, case study pipeline node specifics
* Deleted entirely (ChatGPT-sourced, not actionable): "system energy" item, "reduce motion dependency" item
* All parked items moved to PARKED section at bottom of `Website_Fixlist.md`

**Sub-page CTA scroll fix (Home.tsx)**

* "Get a free build" on `/nlap` wasn't reliably scrolling to the contact form on homepage
* Root cause: 100ms timeout wasn't enough for Home component to finish mounting with FadeContent animations
* Fixed: timeout bumped to 800ms — now consistently lands on contact form

**Offer copy (Home.tsx)**

* "Yours to keep." → "Yours to keep, no strings." — makes ownership unconditional and explicit

**Vaughan Brief logo (Home.tsx)**

* Logo added to Vaughan Brief proof card above the heading
* File saved as `/public/vaughan-brief-logo.jpg`; 64px desktop / 56px mobile (`.vb-logo` class with media query)
* Border-radius 8px to match card aesthetic

**Case study CTA button (Home.tsx)**

* Changed from animated outline (white glow border) to white fill — matches `.cta-primary` treatment
* Animated border was white-on-transparent and wasn't giving the card visual weight
* White fill makes it the clear primary action on the card

**Fix list items closed this session**

* Sub-page → contact form scroll
* "You keep it" copy ambiguity — "Yours to keep, no strings."
* "Push See Our Work up" (dropped)
* Vaughan Brief logo
* NLAP case study visual dominance

**Remaining open**

* Real logo in nav — true launch gate
* Founder photos + credibility lines

---

**2026-05-27 — Header + wordmark rollout**
**Log updated: 2026-05-27 1:54 PM**

**Files added**

* `src/components/ui/Header.tsx` — new fixed header component; NA wordmark white SVG, 32px desktop / 20px mobile; dark semi-transparent bg + backdrop blur; links to `/`
* `public/NA-wordmark-white.svg`, `NA-wordmark-black.svg`, `NA-wordmark-white.png`, `NA-wordmark-black.png` — wordmark assets added to public folder (renamed from doubled extensions)

**Header wired into pages**

* `Home.tsx` — `<Header />` added at top of return
* `Nlap.tsx` — `<Header />` added; back nav padding bumped from 36px → 80px so "← Back" clears the fixed header; hero paddingTop adjusted to 36px

**Footer wordmark**

* `Footer.tsx` — NA wordmark white SVG (22px, opacity 0.55) added above copyright line in bottom bar

**Fix list closed**

* Real logo in nav

**Remaining open**

* Founder photos + credibility lines

---

**2026-07-23 — Case study + home page: accuracy pass, offer realignment, hero stat band**
**Log updated: 2026-07-23 5:16 PM**

Big website session, resumed after the May gap — triggered by needing a credible case-study link to send a referral lead (White Shark / Roger). Reworked `Nlap.tsx` (the `/nlap` case study) and `Home.tsx`. Committed + pushed to `bwna-web` master (`e7f32d2`), cleanly rebased over Nathan's concurrent favicon/cache commits. Vercel auto-deploy expected; if it's off, Nate triggers from the dashboard.

**Accuracy pass (both pages) — the core of the session**

* **Killed the overclaims.** `/nlap` Result was "<10 min / running weekly since launch" → **"1 review / the editor checks and sends"** (the after-time was never measured; "since launch" implied the system ran the newsletter for its whole life). Home mirrored: "4 hrs → 10 min" → "4 hrs → one review"; "under 10 min / running every week since launch" → "a single editor review / Live for Vaughan Brief".
* **Fixed the one claim the data contradicts.** Decision "AI handles the ambiguous ones / only sees ambiguous events" → **"a model should learn your taste"** (trained on the editor's own past decisions). The old line implied the LLM handles a minority; measured load is 86% LLM-touched, and that only flips once R7's classifier ships. New framing is honest *and* surfaces the classifier as a differentiator.
* **Removed every em dash** across both pages (9 spots, 5 of them pre-dating this session) — reads as an AI tell.
* **Stat number is 1,100+, not 1,500.** "Editorial decisions it learns from" = the 3-class training set (1,126), NOT the 1,506 total labeled — the 380 Local Aroma events are dropped and the model never learns from them, so "1,500 it learns from" would overstate.

**Offer realignment (strategy fix, not cosmetic)**

* **"First build free" / "Get a free build" → "Free workflow map" everywhere** (Home hero, offer section, contact line; `/nlap` CTA). A public *free build* offer contradicted the plan to steer leads into a *paid* engagement — a free build is weeks of unpaid work per lead. The free offer is now a call + a diagnostic map; the build is quoted from there.

**Design**

* **Hero 4-stat proof band added to `/nlap`** (13,000 subscribers · 10+ sources · 1,100+ decisions · 24× faster data collection, 14 min → 35 s), replacing the descriptive lede paragraph. Mobile-responsive 4→2→1 column.
* **Key Decisions**: adopted the 4-card principle-framed version (was 3, pain-framed) + a descriptive section heading; claim headline standardized from `T.h3` (24–34px, "massive") through the `T` scale to a settled 19px.
* **Serif-italic accents tried and reverted** — looked worse; the brand reserves italic for the testimonial quote, so plain sans is the on-brand choice.
* **Transfer thesis pulled into the hero** ("the newsletter is only the example, the shape is the product"); **CTA de-targeted** back to general (removed the field-service example list — White Shark targeting belongs in the outreach text, not the reusable page).
* **Kept**: Nathan as co-founder (confirmed still a co-founder); the Vaughan Brief testimonial (confirmed a real, cleared quote).

**Verification**

* `npm run build` (tsc + vite) clean, twice. **Mobile checked on a real device** via `--host` network preview — stat band collapses 4→1 col, decision cards stack, pipeline goes vertical, no horizontal overflow.

**Not done / handed off**

* **Deploy confirmation** — pushed to master; whether Vercel auto-deploys or Nate must trigger is unconfirmed (no Vercel access, and the SPA can't be verified by fetch). Ariel verifies the live page, loops in Nate if stale.
* **The Roger outreach itself** (the reason for the session) — the give-first text is written and waits on the live page; **not sent**. Networking layer → `/checkout` + `contacts.md`, not this log.

---
