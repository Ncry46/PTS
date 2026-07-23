---
name: PTS Learning
description: Thanvasu Personal Assistant e-learning — warm rose brand, calm product UI
colors:
  primary: "#974258"
  primary-deep: "#7a2f42"
  primary-soft: "#f6e6ea"
  accent: "#3d5a4c"
  bg: "#f3f0f1"
  bg-top: "#faf7f8"
  bg-bottom: "#efeceb"
  surface: "#ffffff"
  text: "#1c1520"
  muted: "#5c4f55"
  border: "#97425824"
  error: "#ba1a1a"
  on-primary: "#ffffff"
typography:
  display:
    fontFamily: "Sora, IBM Plex Sans Thai, sans-serif"
    fontWeight: 700
    letterSpacing: "0.02em"
  body:
    fontFamily: "IBM Plex Sans Thai, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Sans Thai, sans-serif"
    fontSize: "13px"
    fontWeight: 600
rounded:
  sm: "12px"
  md: "18px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  page-x: "16px"
  content-max: "1120px"
  nav-h: "68px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    padding: "11px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "11px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "11px 14px"
  chip:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
---

# Design System: PTS Learning

## 1. Overview

**Creative North Star: "The Rose Studio Desk"**

PTS Learning should feel like a tidy professional desk at Thanvasu — soft rose light, clear paperwork, and tools that stay out of the way. It is a product UI first: learners come to enroll, study, schedule, and certify. Warmth comes from the rose brand and Thai typography, not from decorative chrome.

Density is moderate. Marketing-ish heroes on Home may breathe; dashboards, Settings, Admin, and lists stay structured and scannable. Prefer the shared shell in `components/navbar.js` and `site.css` (`--pts-*` tokens) over page-local reinvented UI.

This system rejects purple SaaS gradients, Inter monoculture, nested card stacks, and yellow guest-shame banners as primary messaging.

**Key Characteristics:**
- Rose primary (`#974258`) on soft tinted neutrals
- IBM Plex Sans Thai for UI; Sora for display/brand marks
- Pill primary actions; soft panels with light borders
- Max content width ~1120px under a fixed 68px nav

## 2. Colors

A restrained rose palette: one primary voice, one quiet green accent, tinted neutrals.

### Primary
- **PTS Rose** (#974258): primary actions, active links, chips, key emphasis. Keep rare enough that buttons still read as “the next step.”
- **Rose Deep** (#7a2f42): hover / pressed primary.
- **Rose Soft** (#f6e6ea): chip backgrounds, soft hover fills, date badges.

### Secondary
- **Studio Green** (#3d5a4c): secondary accent in background atmospheres and occasional supporting emphasis — never compete with primary CTAs.

### Neutral
- **Ink** (#1c1520): primary text.
- **Muted Ink** (#5c4f55): labels, helper text, secondary copy (must stay readable on soft backgrounds).
- **Paper White** (#ffffff): panels, cards, inputs.
- **Mist** (#f3f0f1 / #faf7f8 / #efeceb): page background wash (radial + linear gradient on `body.pts-body`).
- **Rose Hairline** (rgba(151,66,88,0.14)): borders and dividers.
- **Error** (#ba1a1a): destructive / error messages only.

### Named Rules
**The One Rose Rule.** Primary rose is for actions, selection, and brand emphasis — not large filled page backgrounds. Soft rose fills are for small affordances (chips, badges, hover).

**The Quiet Guest Rule.** Do not reintroduce yellow “read-only” banners as the main guest UX; let login CTAs appear where the action is needed.

## 3. Typography

**Display Font:** Sora (fallback IBM Plex Sans Thai)
**Body Font:** IBM Plex Sans Thai

**Character:** Thai-capable humanist UI type with a slightly sharper display face for brand and page titles — professional, not playful.

### Hierarchy
- **Display** (Sora, 600–700): brand name, page heroes (`pts-display`), large numerals in date badges.
- **Headline** (IBM Plex / Sora mix, bold): section titles (`h1`/`h2` around 1.75–2.25rem on product pages).
- **Title** (IBM Plex, 600–700, ~1.125rem): panel headings, card titles.
- **Body** (IBM Plex, 400–500, ~15px, line-height ~1.5): form copy, descriptions; keep prose readable.
- **Label** (IBM Plex, 600, ~12–13px): field labels, chips, nav meta.

### Named Rules
**The Product Type Rule.** Prefer IBM Plex Sans Thai for labels, buttons, and data. Reserve Sora for brand and major titles — not every heading.

## 4. Elevation

Hybrid: mostly flat white surfaces with soft rose-tinted borders; shadows are ambient and light.

### Shadow Vocabulary
- **Rest** (`0 2px 10px rgba(28, 21, 32, 0.04)` / `--pts-shadow-sm`): panels, rows, nav whisper.
- **Lift** (`0 10px 36px rgba(28, 21, 32, 0.07)` / `--pts-shadow`): dropdowns, hover cards, elevated sheets.
- **CTA glow** (`0 8px 18px rgba(151, 66, 88, 0.22)`): primary buttons only.

### Named Rules
**The Soft Desk Rule.** Elevation is gentle paperwork, not floating glassmorphism. No multi-layer neon shadows.

## 5. Components

Shared classes live in `site.css` / `components/site.css`. Prefer these over one-off Tailwind-only constructions when building product screens.

### Buttons
- **Shape:** full pill (`border-radius: 999px`)
- **Primary:** rose fill, white text, soft rose shadow; hover → rose deep
- **Outline:** transparent + rose border/text; hover soft rose fill
- **Ghost:** muted text; soft rose hover wash
- **States:** disabled at 50% opacity; active scales to 0.98

### Panels & cards
- **Panel (`.pts-panel`):** white, 18px radius, light border, small shadow, 20–24px padding — default container for Settings / forms
- **Card (`.pts-card`):** use sparingly for interactive collections (course grids); not for wrapping every section
- **Row (`.pts-row`):** list items for schedules/payments

### Inputs
- **Shape:** 12px radius, hairline rose border, 11×14 padding
- **Focus:** stronger rose border + 3px rose focus ring
- **Disabled:** muted fill `#f5f2f3`

### Chips & empty states
- **Chip:** soft rose pill, bold 12px label
- **Empty (`.pts-empty`):** dashed rose border, centered teaching copy + next action link

### Navigation
- Fixed top nav (68px) from `components/navbar.js`: brand left, links, notifications, profile drawer
- Admin stays in the profile drawer for admins — not a permanent top-nav chrome for everyone
- Favorites menu label: **รายการโปรด** (courses + liked posts)

### Messages
- `.pts-msg` muted; `.pts-msg--ok` rose emphasis; `.pts-msg--err` error red

## 6. Do's and Don'ts

### Do
- Use `--pts-*` tokens from `site.css` for new UI
- Keep primary CTAs pill-shaped rose buttons
- Write Thai empty states that point to the next action
- Put course favorites and liked posts under **รายการโปรด**
- Preserve brand rose + IBM Plex / Sora pairing

### Don't
- Don't add purple/indigo gradient themes or Inter/Roboto as the UI font
- Don't nest cards inside cards or card-wrap the entire page
- Don't put Admin in the global top nav for all users
- Don't revive yellow guest “โหมดอ่านอย่างเดียว” banners as default chrome
- Don't use bounce/elastic motion or decorative glow stacks
