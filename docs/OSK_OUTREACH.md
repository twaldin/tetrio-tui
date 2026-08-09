# Outreach plan: contacting osk about tetrio-tui

Research date: 2026-08-09. Sources: tetr.io (rules / terms / api / support / in-client mod warning),
osk.sh, txt.osk.sh knowledge base, github.com/lemoncove/tetrio-bot-docs, gitlab.com/UniQMG/tetrio-plus,
ch.tetr.io bot profiles, TETR.IO Discord.

---

## 1. Who osk is and where to reach him

osk (stylized lowercase, pronounced /ɔsk/) is the solo founder/lead developer of TETR.IO
(~5–9M players). Netherlands-based. Personal site: https://osk.sh — GitHub: **o5k** —
X: **@tetriogame** (project) / **@oskdev** (personal) — Discord username: **osk**.

His own contact page says: *"I try to read all e-mails and DMs I get, but since I get a lot,
I might not be able to reply."* The community-maintained protocol docs (lemoncove/tetrio-bot-docs)
describe the established permission process: *"To get [a bot account], message osk on Discord with a
short outline of your bot's intended functionality (or email them, but they do not check emails as
frequently)."*

**Channel ranking:**
1. **Discord DM to `osk`** (join the official TETR.IO Discord first: https://discord.com/invite/tetrio,
   ~50k members). This is the channel osk himself uses for exactly this kind of permission request.
2. **Email via osk.sh** as a fallback after ~2–3 weeks of silence (he reads mail less frequently).
   Do NOT email security@osk.sh (that box is for vulnerabilities, PGP-only) and do NOT use
   support@tetr.io (staff handle accounts/bans, not project consent; ban-type mail there is marked spam).
3. Not recommended: X DMs (personal space per his site), GitHub issues on tetrio/issues (that's a
   bug tracker, not a permission channel), public Discord posts (a public "is this allowed?" thread
   invites pile-ons and forces a public ruling; a DM lets him answer informally).

**⚠️ CRITICAL — the AI-slop factor.** osk's Responsible Disclosure Policy (txt.osk.sh, updated
2026-05-17) contains an unusually aggressive notice: *"I do not accept ANY AI slop. Ever… FUCK OFF &
STOP SENDING AUTOMATED LLM SLOP EMAILS, YOU WILL BE BLOCKED AND REPORTED"* (repeated ~30×). He is
being flooded with LLM-generated messages and is primed to pattern-match and block them. The outreach
message MUST read as written by a human: short, plain, first-person, specific, no marketing tone, no
bullet-point fireworks, no "I hope this message finds you well". (Ironically: yes, the project was
built with AI assistance — don't volunteer that unprompted, don't lie if asked, and never let the
message itself look machine-written.)

## 2. The policy landscape (what the written rules actually say)

- **Community Rules, rule 2 (cheating):** *"Using any third-party utilities, loopholes or exploits of
  any kind to get any sort of advantage is not OK. This includes… macro programs, timescale programs,
  bots, replay forgery, lagswitches, assistance tools (like solution finders)…"* — the prohibition is
  advantage-scoped. A human-played TUI confers no advantage (arguably a handicap vs. the web client).
- **API page (tetr.io/about/api):** the TETRA CHANNEL REST API is public and documented. But:
  *"Usage of the main game API is NOT ALLOWED without explicit, written consent. Unauthorized usage
  of the main game API may result in permanent suspension of your account."* — **this is the one rule
  tetrio-tui formally trips**, since any playable client must authenticate and speak Ribbon. This is
  also exactly why asking first is the right move: the doc defines the remedy (get written consent).
- **Official in-client mod warning (shipped in tetr.io itself):** *"Third-party modifications to
  TETR.IO are not supported by the TETR.IO team and may have compatibility, performance and safety
  issues. Do not report any issues while using third-party modifications. **Modifications that alter
  gameplay are strictly forbidden.**"* — i.e. osk's shipped code distinguishes tolerated cosmetic
  mods from forbidden gameplay-altering ones. tetrio-tui reproduces stock gameplay (SRS+, official
  attack tables, human inputs) rather than altering it, which is the right side of that line — but
  note it is a *replacement* client, not a mod of the official one, so it needs its own consent.
- **Bot account system (precedent for sanctioned non-human clients):** bots on user accounts are
  banned on sight *"together with their creators"* (per the approved-bot profile tag, e.g.
  ch.tetr.io/u/cobra), but osk grants **approved bot accounts** on request via Discord DM. Approved
  bots may use custom games/social but **may not** play singleplayer, Quick Play, or Tetra League.
  Takeaway: osk's red line is competitive integrity (leaderboards/League), not third-party code per se.
- **Branding policy (txt.osk.sh/branding):** fan tools are explicitly contemplated — *"it's OK to
  call it 'Skin Editor for TETR.IO'… not OK to call it 'TETR.IO Skin Editor'"* — don't imply
  affiliation, don't reuse/distort logos, and stylize the name "TETR.IO"/"tetr.io" ("Tetrio" is
  listed as wrong). "If in doubt, please contact me first!" — a natural opening line for the DM.
  Note: "tetrio-tui" as a name is arguably off-policy in stylization; be ready to adjust presentation
  ("a terminal client for TETR.IO", keep the non-affiliation disclaimer — README already has one).
- **ToS proper** is a generic web-service ToS (NL jurisdiction); the operative documents are the
  Community Rules + API terms above. They cross-reference: breaking Community Rules = breaching ToS.

## 3. Precedents: how osk has treated third-party protocol/client projects

| Project | What it is | osk's reaction |
|---|---|---|
| **lemoncove/tetrio-bot-docs** (GitHub, CC0, since ~2020) | Public reverse-engineered docs of the Ribbon protocol, explicitly "aiding in the creation of standalone bots" | Tolerated for 5+ years, never taken down; community wiki links it. Direct precedent that **protocol documentation itself is OK**. |
| **TETR.IO PLUS** (UniQMG, GitLab, since 2020, on addons.mozilla.org) | Client modification: skins, music, backgrounds, touch controls, map editor | Tolerated for years at large scale. Its only rules: don't report bugs to osk while using it, don't use it to cheat. Shows osk's actual enforcement posture: hands-off unless gameplay/support burden. |
| **Approved bots** (COBRA, Freybot et al., ahmedrangel/tetrio-bot etc.) | Standalone bots on sanctioned bot accounts | Formally approved via Discord-DM application; profile badge "This is an approved bot account." Proves osk says **yes** to well-scoped protocol projects that ask. |
| Unapproved bots/macros | Cheating tooling | Banned on sight, creators included. The contrast is the point: asking + scoping = accepted; sneaking + advantage = nuclear. |

No public precedent was found of osk approving (or being asked to approve) a full interactive
*play* client — tetrio-tui would be a first. That cuts both ways: no existing rubber stamp, but also
no hostile precedent, and the bot-account process shows he handles novel requests case-by-case.

## 4. Risk assessment for tetrio-tui specifically

**Will he be OK with the MIT license?** Almost certainly yes. MIT/CC0 fan code is the norm in this
ecosystem (tetrio-plus is MIT; tetrio-bot-docs is CC0). License is a non-issue.

**Will he be OK with the protocol walkthrough?** Probably yes, with nuance:
- FOR: tetrio-bot-docs has published the same class of material for 5 years without objection;
  osk's own API page implicitly acknowledges third-party protocol work (bot accounts exist *because*
  people build on the protocol); nothing in the docs is a vulnerability or exploit (no auth bypass,
  no anti-tamper forgery — README explicitly states fingerprints are NOT forged).
- AGAINST (the honest deltas): docs/PROTOCOL.md covers the **current** client (v1.7.8) including the
  human-account auth flow, the X-Connection-ID AES detail, and server-signature material — a step
  beyond the 2022 bot-docs; and the repo pairs the docs with **working League-capable client code**,
  which lowers the effort for a bad actor to build an undetectable League bot. osk's sensitivity is
  not hypothetical: the AI-slop notice shows abuse of his services is at an all-time high in 2026.
- The realistic worst case is not legal action (nothing here infringes; clean-room RE of a network
  protocol + MIT fan client is standard fan-project territory, and TETR.IO is free) — it is:
  (a) no reply, (b) "please don't", or (c) server-side countermeasures (client detection / account
  action against users). Asking first converts (b)/(c) from a surprise into a conversation, and a
  "yes" (even a tacit "don't cheat with it and don't bug my support team") is durable cover.

**The genuinely sensitive feature is Tetra League.** Bots are barred from League/QP precisely
because that's where integrity matters. A custom client that can enter League is one config change
away from a League bot. Expect this to be the crux of his answer. Options to offer (in order of
preference): full consent as-is; consent with League disabled until/if he says otherwise; or
custom-rooms/spectate/TETRA-CHANNEL-only scope.

## 5. Recommended plan

1. **Before sending:** tighten the repo so the first 30 seconds of reading it make the right
   impression — README already leads with the fair-play notice (good); make sure the demo GIF shows
   human play; keep the "does not forge anti-tamper fingerprints" line; add a line offering to
   gate League behind his consent. Do not announce publicly anywhere else first.
2. **Send one Discord DM to `osk`.** One message, <150 words, human voice. Lead with what it is and
   the ask, not apologies. Explicitly offer the scoping options so he can say a cheap "yes" to a
   subset rather than a hard yes/no to everything.
3. **If no reply in ~3 weeks:** one short follow-up email via osk.sh referencing the DM. Then stop —
   silence ≠ consent; keep the League/online features clearly flagged as at-your-own-risk in the
   README (as they already are) and don't interpret non-response as approval.
4. **If he says no to any part:** comply immediately and visibly (gate the feature, add the note).
   His history says compliance keeps the rest of the project safe; defiance gets projects and
   accounts removed.
5. **If he says yes:** ask whether he wants anything in return — a disclaimer wording, a heads-up
   before releases, a "report issues to us, not to TETR.IO" note (mirror the TETR.IO PLUS wording).
   Then add the consent (screenshot/quote, with his permission) to the README.

## 6. Draft message (Discord DM — adapt to your own voice before sending; do not paste verbatim)

> Hey osk — I built tetrio-tui, a fan-made terminal client for TETR.IO: you log in with your own
> account and play League/custom rooms/solo, rendered in a TUI. MIT, no affiliation, human inputs
> only — it doesn't touch anti-tamper or automate anything.
>
> I know the main game API is marked "not allowed without written consent", so I'd rather ask than
> assume: are you OK with this existing? Happy to gate off Tetra League (or anything else) if you'd
> rather I keep it to custom rooms + spectate. Repo: github.com/twaldin/tetrio-tui — the README has
> a demo GIF and a fair-play section.
>
> Either way, thanks for TETR.IO — and no worries if you'd rather I didn't; I'll comply.

Why this shape: states the ask in the first two lines; shows he already knows and respects the
written-consent rule; pre-answers osk's two likely worries (bot? — no, human inputs; League? —
offered to gate); gives him a one-word "yes"/"no"/"yes-but" path; zero flattery padding, zero
markdown-slop. Keep your own phrasing — if it reads like this paragraph was generated, rewrite it.

## 7. Emphasize / de-emphasize

**Emphasize:**
- Human-played, interactive, own account; no automation, no advantage (a terminal is strictly worse
  than the web client for competitive play).
- Respects server rules as they exist (no anti-tamper forgery, anonymous accounts kept out of
  League, rate limits honored on TETRA CHANNEL).
- MIT fan project, clear non-affiliation, will comply with any scoping (League gate, disclaimers,
  rename away from the wordmark if he wants).
- You asked first — that is the behavior his ecosystem rewards (bot accounts, tetrio-plus coexistence).

**De-emphasize / avoid:**
- Don't lead with "reverse-engineered the protocol" — the docs speak for themselves; framing the
  project as protocol research first makes it sound like bot tooling.
- Don't mention that the docs could help someone build a bot — he knows; volunteering it reads as
  either naïve or fishing for praise for restraint.
- Don't ask for endorsement, promotion, or a badge — ask only for toleration/consent.
- Don't compare to tetrio-bot-docs/tetrio-plus as a legal argument ("you let them, so…") — precedents
  are for our analysis, not for negotiating with him.
- Don't CC staff, post publicly, or ask in #general. Don't send a second DM if the first is ignored
  (use the email fallback once).
- Don't write anything that smells like LLM output (see §1) — this is the single easiest way to get
  blocked in 2026.

## 8. Bottom line

osk has a 5-year, multi-project track record of tolerating — and on request, formally approving —
third-party protocol work, provided it (1) asks first, (2) doesn't confer competitive advantage, and
(3) doesn't create support burden. tetrio-tui satisfies (2) and (3) by design; the outreach message
satisfies (1). The realistic risk is concentrated in Tetra League access and the current-client
protocol docs; both are addressed by offering to gate League and by the fact that equivalent docs
have been public for years. Probability he is OK with MIT + the walkthrough: high. Probability he
ignores the message: moderate (he gets a lot of DMs — plan the one email follow-up, then carry on
with the README's existing risk warnings intact).
