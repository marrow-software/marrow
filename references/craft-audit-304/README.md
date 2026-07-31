# Current-state craft & IA audit — Marrow

**Ticket:** [#304 — Current-state craft & IA audit of the Marrow app](https://github.com/marrow-software/marrow/issues/304) · part of map [#302 — A competitive design direction for the Marrow app](https://github.com/marrow-software/marrow/issues/302)
**Date:** 2026-07-30 · **Surfaces:** app (`web/`), marketing (`web-marketing/`), docs (Starlight)

This grounds the map's identity and shell prototypes in *real defects* rather than taste in the abstract. It pairs a live drive-through of the running app (seeded workspace, dark + light) with a source-level sweep of the component tree; screenshots are in [`screenshots/`](./screenshots).

---

## Method

- **App:** seeded a realistic org/workspace (`Acme HQ` — folders, pages, an RFC with properties + code + checklist, comments, inbox, stars), minted a session, and drove the real Next.js app with Playwright at 1440×900 @2× in both themes. Captured home, workspace landing, editor, RFC page, comments drawer, Cmd+K search, admin, org settings, login.
- **Marketing / docs:** built the static exports and screenshotted landing / product / pricing and two docs pages, both themes.
- **Source sweep:** read the `web/` component tree against the rubric to attach `file:line` to each visual tell.

Rubric (per surface): **alignment & grid · spacing consistency · type hierarchy & rhythm · color/surface discipline · interactive states (hover/focus/empty/loading/error) · density · motion · iconography.** Severity: **🔴 BLOCKER** (ships something broken/fake to a customer) · **🟠 MAJOR** (clearly reads amateur) · **🟡 MINOR** (polish).

---

## Headline finding: three surfaces, three craft tiers, one nominal brand

The single biggest IA/identity fact is not that Marrow *lacks* an identity — it's that the identity **already exists and is executed well on marketing, retrofitted onto docs, and barely present in the app.** "Amateur" is overwhelmingly an **app execution + cross-surface consistency** gap, not an identity-absent problem.

| Surface | Craft tier | Character |
|---|---|---|
| **Marketing** ([landing](./screenshots/mkt-dark-01-landing.png)) | **Highest — deliberate** | Editorial hero, confident Fraunces-italic wordmark, disciplined terracotta accent, real vertical rhythm, considered comparison table + terminal mock. This is a designed page. |
| **Docs** ([home](./screenshots/docs-dark-01-home.png)) | **Middle — generic + retrofit** | Stock Starlight chrome with the Marrow logo and Fraunces headings bolted on. Competent, readable, but it's a *third* visual system — not the editorial voice of marketing, more finished than the app. |
| **App** ([RFC page](./screenshots/app-dark-04-page-rfc.png)) | **Lowest — functional, unfinished** | The identity tokens are present (terracotta, Fraunces title, dark surfaces) but the surface is riddled with fake UI, native controls, type/spacing chaos, and dead affordances. |

**Implication for the map:** the "refined-current" direction is not hypothetical — marketing *is* a partial proof of it. The open identity question is really "does the marketing voice scale into a dense app shell, or does the app need its own quieter register?" — and the app's job is first to reach the bar marketing already sets. See [inputs for downstream tickets](#inputs-for-downstream-tickets).

---

## The root causes (systemic — these generate most individual defects)

Three structural facts produce ~80% of the tells below. The rebuild spec should target these, not the symptoms one by one.

1. **The design system exists but is bypassed.** The token layer (`web/app/globals.css`) and the `ui/` primitives (`button.tsx`, `input.tsx`, `dialog.tsx`, `skeleton.tsx`) are sound stock shadcn-for-Base-UI with proper `focus-visible`/`disabled`/`aria-invalid` states and a `cva` size scale. **But the feature surface hand-rolls its own buttons, menus, inputs, sizes and colors instead of consuming them.** Almost every defect lives in the hand-rolled components.
2. **Placeholder / fake UI is shipped as if real.** Fake collaborator avatars, a dead "copy" button on every code block, "coming soon" menu items, and seven stub admin sections all present identically to working UI.
3. **No explicit scales.** There is no shared type ramp, spacing scale, icon-size scale, or control-height scale — so equivalent things are sized by eye, differently, everywhere (including a literal half-pixel `text-[13.5px]`).

---

## Per-surface audit

### 1. App shell — rail + sidebar + inset header
Screens: [RFC page (dark)](./screenshots/app-dark-04-page-rfc.png) · [editor (light)](./screenshots/app-light-03-page-editor.png)

- 🔴 **Fake collaborator avatars on every page.** `inset-header.tsx:20-24,53-70` hardcodes `MOCK_AVATARS` (`#8a5a3a`,`#3a6b4a`,`#4a6b8a`) rendering three invented users "A/S/L" in the top-right of *every* page header. Visible in every editor screenshot. Ships invented people to the customer. **(color/surface, states)**
- 🟠 **Brand mark collides with the workspace-switcher avatar** top-left of the sidebar on *every* app screen — the orange rounded logo tile sits underneath the dark "N" avatar circle (see any app shot, top-left corner). A z-index/layout bug on the most-seen pixel of the product. **(alignment)**
- 🟠 **Sidebar is cramped and misaligned.** Tree indentation uses three different magic formulas (`depth*12+8` for rows vs `(depth+1)*12+28` for create-rows / the "Empty" label, `app-sidebar.tsx:158,307,321,352,456`), so new-item rows and empty labels don't align to the sibling icon column. Rows are `py-0.5` with `h-3` icons — far denser than every other list surface. **(alignment, density)**
- 🟠 **Long page names truncate without ellipsis padding** — "RFC-014: Search Rearchitectur" is hard-clipped at the panel edge in every sidebar shot. **(density)**
- 🟡 **Dead control:** the WorkspaceHeader chevron button has `aria-label`/`title` but no `onClick` (`app-sidebar.tsx:505-512`). **(states)**
- 🟡 Left-edge rhythm breaks on the editor screen: header + attachment bar are `px-6` (`inset-header.tsx:86`, `page-editor.tsx:532`) while the title + properties are `px-10` (`page-editor.tsx:537`, `property-editor.tsx:65`) — header, body and metadata sit on three different left edges (visible: "Attachments" starts left of the title). **(spacing)**

### 2. Home vs. workspace landing — IA redundancy
Screens: [global Home](./screenshots/app-dark-01-home.png) · [workspace landing](./screenshots/app-dark-02-workspace.png)

- 🟠 **Two landings, near-identical content, two different chromes.** `/home` renders "Welcome back, Dana / Recently edited / Inbox / Starred" in the slim `global-chrome` top bar; `/w/{id}` renders the *same* "Welcome back, Dana / Recently edited" inside the full sidebar shell. Same widget, same data, two frames — the hierarchy between "global home" and "workspace home" is unclear and the duplication reads unfinished. A core IA decision for the shell ticket. **(IA)**
- 🟡 The `✨ For you` eyebrow + serif "Welcome back" is the app's one genuinely editorial moment — worth preserving as a reference for the good direction.

### 3. Page / editor surface
Screens: [RFC (dark)](./screenshots/app-dark-04-page-rfc.png) · [Team Handbook (light)](./screenshots/app-light-03-page-editor.png)

- 🔴 **Dead "copy" button mislabels every code block.** `globals.css:229-246` stamps `content: "shell · copy"` on *every* `codeBlock` regardless of language, with `pointer-events:none`. The RFC's **Python** block is labelled "shell", and "copy" can't copy. **(color/surface, states, iconography)**
- 🟠 **The page title renders twice, in two type treatments.** The chrome title (serif, inline `fontSize:40/weight:400`, `page-editor.tsx:541`) sits directly above the content's own H1 (bold sans, ~56px) — "RFC-014: Search Rearchitecture" appears twice, once serif once sans. **(type hierarchy)**
- 🟠 **Native OS form controls in the property editor.** "Status" is a raw `<select>` with the browser-default chevron; "Owner" is a bare bordered input (`property-editor.tsx:88,97,152`) — no focus ring, no token styling, visibly not-of-the-app. **(states, color/surface)**
- 🟡 Attachment download link is `text-blue-600` (`page-editor.tsx:747`) — a non-token color that ignores the terracotta system. **(color/surface)**
- 🟡 Save status flips `saved→idle` via a bare `setTimeout(2000)` with no fade (`page-editor.tsx:251`). **(motion)**
- ✅ The custom checklist checkboxes (green, `globals.css:196-217`) render nicely — a rare bit of intentional component craft.

### 4. Comments drawer
Screen: [comments open](./screenshots/app-dark-05-comments.png)

- 🟠 **Opening the drawer clips the page content** instead of reflowing its width — the body H1 is cut off ("Search Rearchitect…") behind the drawer. The editor column doesn't respond to the drawer. **(alignment, states)**
- 🟠 **"Unknown" author.** The system reply (null `author_user_id`) renders the literal string "Unknown" as the author name — no graceful fallback. **(states)**
- 🟠 The composer "Send" / "Reply" buttons are raw `<button>`s (`comments-drawer.tsx:203`) with only `disabled:opacity-50` — no focus-visible ring, not the `Button` primitive. Keyboard hint "⌘↵ to send" is a text glyph. **(states, iconography)**
- 🟡 The drawer's shadow is a hardcoded fixed-black RGBA (`comments-drawer.tsx:130`) identical in light and dark. **(color/surface)**

### 5. Dialogs — search / export / share
Screen: [Cmd+K search](./screenshots/app-dark-06-search.png)

- 🟠 **Export dialog uses native radios/checkboxes** (`export-dialog.tsx:76-128`) and an ad-hoc amber warning block built from raw palette classes (`text-amber-600 … bg-amber-50 … border-amber-200`, line 139) though a `--color-warning` token exists. **(states, color/surface)**
- 🟠 Share dialog: native date input (`share-dialog.tsx:91-96`); empty state is one bare muted line "No active links."; icon-only copy/revoke buttons have no `focus-visible`. **(states)**
- 🟡 Font-size soup inside these dialogs: `text-[9px|10px|11px|13px|13.5px|17px]` across search/share/rail/header instead of a ramp. **(type)**
- ✅ The `Dialog` primitive itself animates correctly (`fade-in/zoom-in-95`) — the problem is that custom popovers/menus (`page-menu.tsx`, the rail + global-chrome dropdowns) have **zero** enter/exit animation, so menus pop while dialogs animate. **(motion)**

### 6. Admin dashboard
Screen: [Mission control](./screenshots/app-dark-07-admin.png)

- 🟠 **Seven stub sections wired into the live admin nav** (Analytics, Audit log, Automation, Export permissions data, User access, Announcements, Import from other tools, Groups) all render `StubSection` "not yet implemented" (`admin/page.tsx:24-80`). Presented identically to the two that work. **(states)**
- 🟠 **Raw internal slug leaked to users** — the workspace card shows "1 space · main-60ab6272". **(color/surface / content)**
- 🟠 The admin shell repeats the top-left logo/avatar collision, and its "‹ Workspaces / ADMIN / Acme Corporation" stack overlaps the avatar. **(alignment)**
- ✅ The Mission-control stat cards (Workspaces / Spaces / Members) are clean and well-proportioned — a decent baseline for the card system.

### 7. States, onboarding, auth
- 🔴 **A `Skeleton` primitive exists and is imported nowhere.** Every loading state is bare text "Loading…" / "Searching…" / "Loading comments…" (10+ sites incl. `starred-panel.tsx:26`, `inbox-panel.tsx:108`, `admin/layout.tsx:84`, `side-drawer.tsx:88`). No layout-preserving loading anywhere. **(states)**
- 🟠 **Empty states are two different species** — rich centered icon+heading+subtext (`inbox-panel.tsx:113`, `starred-panel.tsx:31`, workspace empty) vs. one bare muted line ("No results found.", "No attachments yet.", "Empty"). **(states)**
- 🟠 **Error surfaces are inconsistent** — most failures are fire-and-forget `toast.error`, but restore/subscribe/onboarding render inline error blocks and starred folds error into its empty state. No unified error component. **(states)**
- 🟠 **No H1 system across top-level screens** — page titles are inline `fontSize:40`, onboarding `text-2xl font-bold`, workspaces `font-heading text-3xl`, subscribe `text-3xl`, subscribe/success `text-xl`, mission-control `text-2xl`. Five treatments; `font-heading` (Fraunces) applied at random. **(type)**

### 8. Marketing site
Screens: [landing](./screenshots/mkt-dark-01-landing.png) · [product](./screenshots/mkt-dark-02-product.png) · [pricing](./screenshots/mkt-dark-03-pricing.png)

- ✅ **This is the reference bar.** Editorial hero with Fraunces-italic "marrow", disciplined single-accent terracotta, real vertical rhythm, a considered "what you're trading" comparison table, an in-context editor/terminal mock, and a coherent CTA ladder. It reads as a designed, confident product.
- 🟡 Minor: dense feature-grid copy runs small and low-contrast in a few muted-on-dark spots; the hero product mock is a static image, not the real app (acceptable for marketing, but it sets an expectation the app doesn't meet).
- 🟡 The gap between this page's polish and the app it links to is itself a risk — a visitor who clicks "Open Marrow" lands two craft tiers down.

### 9. Docs (Starlight)
Screens: [home](./screenshots/docs-dark-01-home.png) · [quickstart](./screenshots/docs-light-02-quickstart.png)

- 🟠 **Generic Starlight with the brand retrofitted.** Fraunces headings + terracotta links + the Marrow "M" logo sit on otherwise-default Starlight chrome (default sidebar, default search box, default "On this page" rail, Inter body). It's neither the editorial marketing voice nor the app's shell — a third register. **(consistency)**
- 🟡 Serif H1/H2 + sans body reads well and is closer to marketing than the app is — docs is the *easier* surface to pull onto the chosen direction once it's set.

---

## Top 10 worst offenders (ranked)

1. 🔴 **Fake `MOCK_AVATARS`** on every page header (`inset-header.tsx:20-24`) — invented collaborators shipped to customers.
2. 🔴 **Dead "shell · copy" chrome** on every code block, mislabeling language (`globals.css:229`).
3. 🔴 **`Skeleton` primitive exists, used nowhere** — bare "Loading…" in 10+ places.
4. 🟠 **Brand-mark / avatar collision** top-left on every app screen.
5. 🟠 **Home ≡ workspace landing** — same widget, two chromes, unclear IA.
6. 🟠 **Seven "not yet implemented" stub sections** live in the admin nav (`admin/page.tsx:24-80`), plus "coming soon" toast menu items (`page-menu.tsx:226`).
7. 🟠 **Native OS form controls** — export radios, property `<select>`, share date input bypass `Input`, no focus states.
8. 🟠 **No type / spacing / icon-size / control-height scales** — `text-[13.5px]` half-pixels, `h-5/6/7/9` one-off buttons, four list-row heights (`py-0.5`→`py-3`).
9. 🟠 **Comments drawer clips page content** and shows "Unknown" authors.
10. 🟠 **Non-token colors + fixed-black shadows** (`text-blue-600`, ad-hoc amber blocks, `bg-[#4a6b8a]`, `shadow-[…rgba(0,0,0,…)]`) that don't adapt to theme; **leaked internal slug** in admin.

---

## Inputs for downstream tickets

- **Identity direction:** don't start from zero — marketing is a working proof of a "refined-current" terracotta/Fraunces/dark direction. The live question is whether that editorial voice scales into a dense app shell or needs a quieter app register. The app's *floor* is "reach marketing's bar."
- **Shell / IA:** resolve the **home-vs-workspace-landing** duplication and the **rail logo/avatar collision** first — they're structural, not cosmetic. Decide whether the drawer reflows or overlays.
- **State system:** the biggest single win is cheap — **wire up the `Skeleton` that already exists** and define one empty-state and one error-state component. This alone removes three of the top offenders.
- **Component layer:** the rebuild is mostly *routing the hand-rolled surface through the existing `ui/` primitives* + defining explicit type/spacing/icon/height scales — not a from-scratch redesign. Delete the fake avatars, dead copy button, and stub/"coming soon" items.
- **Density:** the sidebar (very tight) and Home/admin (loose) read as two products; the density scale needs a single decision.

*Screenshots: 28 PNGs (app + marketing + docs, dark + light) in [`screenshots/`](./screenshots).*
