# R7 — Where does the deciding signal sit? (cap eyeball, n=11)
**Purpose.** The serve-time recipe truncates descriptions at 300 characters. These are gate-slice events whose cleaned description runs past 600, so the cap is cutting real text. The question is whether the cap is cutting *signal* or *logistics*.
**What to mark.** For each row, find the first place the text tells you either (a) whether you would ever run this event, or (b) who it is for. Then set `signal_at` to `0-300`, `300-600`, `600+`, or `none` if the description never says.
**Blind by design.** No labels, gate scores, sections or error status appear here. Do not look them up before marking — the join to outcomes happens after.
**How this gets read.** Mostly `0-300` → keep the cap at 300, skip the cap arms and the section-classifier re-validation. Material share at `300-600` or `600+` → the cap is costing keepers and the arms are worth running.

---

## r76 — Let’s Bake Butter Tarts!
*vaughanpl.info · cleaned length 715 chars*

**[0–300] — what the model sees today**

> Let’s bake up a most Canadian treat, from scratch: butter tarts! Registration is $5 on Eventbrite. This program will be led by a guest speaker. Please note that we will be using butter and lard for this session. The room capacity is limited. All individuals planning to be inside the kitchen during t

**[300–600] — cut today, kept at a 600 cap**

> he program must be registered as a participant. This includes any adult accompanying a child. Please contact the VMC service desk if you have questions. We are a nut-aware space and do not use nuts in our programming, but we cannot guarantee a nut-free facility. Please alert us of any allergies when

**[600+] — kept only if uncapped**

>  registering on Eventbrite. Our kitchen programs are held in the VSES Teaching Kitchen, located on the third floor.

```
signal_at: TODO(ariel)      # 0-300 | 300-600 | 600+ | none
note:      TODO(ariel)      # optional: what phrase decided it
```

---

## r86 — Let's Talk  - Walk In  Counselling Sessions
*markham.bibliocommons.com · cleaned length 764 chars*

**[0–300] — what the model sees today**

> Audience: Adult, Older Adult, Youth Counselling is a conversation between an individual (including couples and families) and a professional counsellor to explore thoughts and feelings during a time of transition or difficulty in life. The Walk-In counselling program provides an opportunity for you t

**[300–600] — cut today, kept at a 600 cap**

> o work with a counsellor without a long wait time. The focus of your Walk-In will be on creating a short-term plan that will make a difference for you right away – using the strengths, resources, and supports you have right now. Available to all residents of York Region, regardless of religious affi

**[600+] — kept only if uncapped**

> liation. The sessions are run by certified counsellors from Catholic Community Services York Region and sessions can be conducted in English, Mandarin or Cantonese.

```
signal_at: TODO(ariel)      # 0-300 | 300-600 | 600+ | none
note:      TODO(ariel)      # optional: what phrase decided it
```

---

## r144 — Bake Club for All Ages
*vaughanpl.info · cleaned length 1096 chars*

**[0–300] — what the model sees today**

> Let's bake up something different together every session in this all-ages-welcome Bake Club! Registration is $7 on Eventbrite. Please note that while all ages are welcome to attend this program, children should register with an adult. Everyone is required to have their own ticket regardless of age, 

**[300–600] — cut today, kept at a 600 cap**

> as there is an occupancy limit in the kitchen space. Topics will be released online as they are confirmed. Registration for each session will open up on the Friday 3 weeks before the date of the session. The room capacity is limited. All individuals planning to be inside the kitchen during the progr

**[600+] — kept only if uncapped**

> am must be registered as a participant. This includes any adult accompanying a child. Please contact the VMC service desk if you have questions. We are a nut-aware space and do not use nuts in our programming, but we cannot guarantee a nut-free facility. Please alert us of any allergies when registering on Eventbrite. Our kitchen programs are held in the VSES Teaching Kitchen, located on the third floor. Our kitchen programs are held in the VSES Teaching Kitchen , located on the third floor.

```
signal_at: TODO(ariel)      # 0-300 | 300-600 | 600+ | none
note:      TODO(ariel)      # optional: what phrase decided it
```

---

## r218 — 10 Health Financial Management Habits
*markham.bibliocommons.com · cleaned length 1218 chars*

**[0–300] — what the model sees today**

> Audience: Adult, Older Adult Take Charge of Your Financial Fitness! This 60‑minute session helps participants become more confident and effective money managers by exploring the essentials of financial literacy. Attendees will assess their own financial fitness, learn the Ten Healthy Habits of Finan

**[300–600] — cut today, kept at a 600 cap**

> cial Management, and understand how goal‑setting and values shape smart financial decisions. The program also highlights common financial challenges, practical strategies for getting your financial house in order, and the social issues tied to money management. Participants leave with useful tools—i

**[600+] — kept only if uncapped**

> ncluding budgeting, goal‑setting, and self‑assessment resources—to support healthier financial habits. Presenter's bio: This workshop is facilitated by Chartered Professional Accountants of Canada (CPA Canada). CPA Canada is one of the largest national accounting organizations globally, representing over 220,000 members. It promotes transparency in financial markets, prepares members for a changing business environment, and contributes to standard setting and public policy. It also collaborates with international bodies to strengthen the global accounting profession. For more information, visit www.cpacanada.ca

```
signal_at: TODO(ariel)      # 0-300 | 300-600 | 600+ | none
note:      TODO(ariel)      # optional: what phrase decided it
```

---

## r233 — Join us at the Toronto Fancon! TGC&Sports Collectibles,Cosplay,Kpop,fashion
*eventbrite.ca · cleaned length 2190 chars*

**[0–300] — what the model sees today**

> Buy, Sell, Trade & Celebrate! Make amazing deals, watch energetic Kpop performances, cosplay events & fashion shows &much more! Toronto Spring FanCon 2026 Sports Colelctibles,TCG/pokemon,Toys, Anime, Cosplay, K-Pop, fashion & Pop Culture Convention in Toronto Toronto Spring FanCon 2026 is taking ove

**[300–600] — cut today, kept at a 600 cap**

> r The International Centre from June 12–14, 2026—get ready for a high-energy weekend packed with Sports & TCG action, anime, cosplay, K-pop, fashion, and pop culture all under one roof. Explore a massive show floor featuring hundreds of TCG and anime vendors, with a huge spotlight on the Pokémon TCG

**[600+] — kept only if uncapped**

>  scene—from trading and collecting to discovering rare Pokémon cards, sports cards, and must-have collectibles. Whether you're a serious collector or just getting started, this is your place. Meet special guest Neala (Whimsy's Balloons) and enjoy creative, family-friendly entertainment throughout the weekend. Catch live stage performances from LJB Hunter Trio & Soda Pop Boys, Gabe, plus an exciting lineup of fan-favourite programming: Hundreds of Sports cards, TCG, Toys, Kpop, Cosplay & Anime vendors Autograph signings by Emma Maltais & Felix Potvin Cosplay Spotlight Competition Yume Arcade free play! KRPD Dance Performance K-Pop Stage and Fan Experiences Fashion Runway Snacckbox Cosplay Gameshow Convention Scavenger Hunt – race across the show floor, collect stamps from hidden checkpoints, and win exclusive FanCon prizes Mini Games Zone – test your anime trivia, TCG knowledge, and reflexes in fun activities running all weekend Photo Studios – strike a pose in themed cosplay, anime, and Pokémon backdrops and walk away with share-ready shots And much more! Whether you're searching for a Toronto cosplay event, anime convention, K-pop fan experience, Pokémon TCG event, or the ultimate card show, Toronto FanCon brings together fans of gaming, anime, K-pop, collectibles, and live entertainment for one unforgettable weekend. Kids 12 & under get in FREE with a paying adult Free parkin …[truncated for the sheet]

```
signal_at: TODO(ariel)      # 0-300 | 300-600 | 600+ | none
note:      TODO(ariel)      # optional: what phrase decided it
```

---

## r247 — Introduction to Renting and Tenant Rights
*markham.bibliocommons.com · cleaned length 958 chars*

**[0–300] — what the model sees today**

> Audience: Adult, Older Adult Renting a home in Ontario comes with rights, responsibilities, and protections that many tenants are not fully aware of until a problem arises. Whether it’s issues with repairs, rent increases, evictions, or communication with a landlord, misunderstandings can quickly tu

**[300–600] — cut today, kept at a 600 cap**

> rn into stressful and costly situations. This workshop is designed to empower tenants with practical knowledge of their rights under Ontario’s Residential Tenancies Act . We will break down complex legal information into plain language, helping you understand what landlords can and cannot do, what y

**[600+] — kept only if uncapped**

> our responsibilities are as a tenant, and what steps you can take when issues arise. Our goal is to ensure you leave this session feeling informed, confident, and better equipped to advocate for yourself in the rental housing market. Knowing your rights is not about creating conflict—it’s about protecting your housing stability, dignity, and peace of mind.

```
signal_at: TODO(ariel)      # 0-300 | 300-600 | 600+ | none
note:      TODO(ariel)      # optional: what phrase decided it
```

---

## r269 — Teen Chess Tournament
*allevents.in · cleaned length 629 chars*

**[0–300] — what the model sees today**

> Test your strategy in our library chess tournament! Compete against fellow players over several rounds, climb the rankings, and play for a prize. Whether you're experienced or just love the game, all are welcome. For grades 9-12. Connect and compete with other chess enthusiasts! Matches will be time

**[300–600] — cut today, kept at a 600 cap**

> d using chess clocks for 20 minutes: 10 minutes per player for a minimum of 5 rounds. Our teen programs are created to give teens their own space to connect and learn. For that reason, registration is limited to grades 9–12. To explore library programs and events for children and adults, please see 

**[600+] — kept only if uncapped**

> VPL's Library Program Guide .

```
signal_at: TODO(ariel)      # 0-300 | 300-600 | 600+ | none
note:      TODO(ariel)      # optional: what phrase decided it
```

---

## r293 — Supporting Our Youth: Teen Stress & Anxiety
*vaughanpl.info · cleaned length 807 chars*

**[0–300] — what the model sees today**

> How does stress turn into anxiety for young people? How can parents and caregivers support youth through these challenging times? This program is run by CMHA York Region South Simcoe. How does stress turn into anxiety for young people? How can youth overcome perfectionism and thought distortions, an

**[300–600] — cut today, kept at a 600 cap**

> d how can we, as parents, educators, and caregivers, support our youth through their most challenging times? This presentation by the Canadian Mental Health Association will identify the most common stressors currently experienced by youth and make connections to the mental health challenges youth a

**[600+] — kept only if uncapped**

> re facing. They will provide strategies for identifying serious mental health concerns among youth, and explore techniques for encouraging, and engaging in, safe, supportive, and compassionate conversations.

```
signal_at: TODO(ariel)      # 0-300 | 300-600 | 600+ | none
note:      TODO(ariel)      # optional: what phrase decided it
```

---

## r297 — How to Monogram a Towel with Brother Digital Embroidery Machine
*markham.bibliocommons.com · cleaned length 752 chars*

**[0–300] — what the model sees today**

> Audience: Adult, Youth Learn the basics of how to set up the embroidery machine and monogram a small face towel. Participants are asked to prepare 2-3 design ideas prior to the class. Further instruction and image criteria will be provided closer to the session date. Please check your spam folders p

**[300–600] — cut today, kept at a 600 cap**

> rior to the program for any communication from staff. The cost of the program is $50+tax. Participants will need to provide their own laptop for the program. All other materials will be provided. Become Maker Certified Please note: if you are looking to use our makerspaces independently, you must be

**[600+] — kept only if uncapped**

>  13+ and complete this online Makerspace module prior to this program. Once completed, our staff can update your profile and you will be maker certified

```
signal_at: TODO(ariel)      # 0-300 | 300-600 | 600+ | none
note:      TODO(ariel)      # optional: what phrase decided it
```

---

## r320 — Let’s Bake Butter Tarts!
*vaughanpl.info · cleaned length 715 chars*

**[0–300] — what the model sees today**

> Let’s bake up a most Canadian treat, from scratch: butter tarts! Registration is $5 on Eventbrite. This program will be led by a guest speaker. Please note that we will be using butter and lard for this session. The room capacity is limited. All individuals planning to be inside the kitchen during t

**[300–600] — cut today, kept at a 600 cap**

> he program must be registered as a participant. This includes any adult accompanying a child. Please contact the VMC service desk if you have questions. We are a nut-aware space and do not use nuts in our programming, but we cannot guarantee a nut-free facility. Please alert us of any allergies when

**[600+] — kept only if uncapped**

>  registering on Eventbrite. Our kitchen programs are held in the VSES Teaching Kitchen, located on the third floor.

```
signal_at: TODO(ariel)      # 0-300 | 300-600 | 600+ | none
note:      TODO(ariel)      # optional: what phrase decided it
```

---

## r338 — Let's Talk  - Walk In  Counselling Sessions
*markham.bibliocommons.com · cleaned length 764 chars*

**[0–300] — what the model sees today**

> Audience: Adult, Older Adult, Youth Counselling is a conversation between an individual (including couples and families) and a professional counsellor to explore thoughts and feelings during a time of transition or difficulty in life. The Walk-In counselling program provides an opportunity for you t

**[300–600] — cut today, kept at a 600 cap**

> o work with a counsellor without a long wait time. The focus of your Walk-In will be on creating a short-term plan that will make a difference for you right away – using the strengths, resources, and supports you have right now. Available to all residents of York Region, regardless of religious affi

**[600+] — kept only if uncapped**

> liation. The sessions are run by certified counsellors from Catholic Community Services York Region and sessions can be conducted in English, Mandarin or Cantonese.

```
signal_at: TODO(ariel)      # 0-300 | 300-600 | 600+ | none
note:      TODO(ariel)      # optional: what phrase decided it
```

---

## Tally (fill after marking)

| signal_at | count |
|---|---:|
| 0-300 | |
| 300-600 | |
| 600+ | |
| none | |
