# ⚔️ ROK BattleTrack – Kingdom 3903

**Current stable release: v1.5.0.1**

ROK BattleTrack is a mobile-first **Rise of Kingdoms performance and analytics dashboard for Kingdom 3903**. It turns tracked KvK data from Google Sheets into a fast, player-friendly Google Apps Script WebApp where governors can review their own performance, requirements, historical KvKs and kingdom rankings.

The project started as a simple Governor ID lookup and has grown into a broader BattleTrack platform for player transparency, performance tracking and Kingdom 3903 analytics.

## ✨ What BattleTrack can do

### Governor lookup & battle profile
- Search by **Governor ID**.
- Display governor name, kingdom, classification and tracked KvKs.
- Show the current/latest Season with a compact battle profile.
- Mobile-first layout designed for quick access from Discord and phones.

### Current Season performance
- KvK Kill Points.
- T4 Kills.
- T5 Kills.
- T4 + T5 Kills.
- Deads.
- Start Power and Power Change.
- Requirement progress and overall progress.
- Achieved / required values plus remaining amount or completion status.

### Requirements
BattleTrack evaluates the governor against the configured KvK requirements and clearly displays progress for:
- **Kills Requirement**
- **Deads Requirement**
- **Overall Progress**

Requirement status is presented directly in the player profile before optional ranking information.

### Battle Archive
- Historical KvK results for the governor.
- Interactive accordion with one KvK open at a time.
- Most recent KvKs shown first, with older history available on demand.
- Historical performance and requirement progress remain accessible without overcrowding the mobile UI.

## 🏆 Personal Kingdom Ranking

The Current Season profile contains an optional, collapsible **Kingdom Ranking** panel.

Players can switch instantly between:

| Metric | Meaning |
| --- | --- |
| **DKP** | Weighted battle contribution using Deads, T4 Kills and T5 Kills |
| **KPR** | KvK Kill Points relative to Start Power |
| **KP** | KvK Kill Points |
| **KILLS** | T4 + T5 Kills |

The panel includes:
- Personal rank, e.g. **#59 of 188 Governors**.
- **Ahead of X% of Governors** position.
- Dynamic **Ranking Neighborhood** with up to three governors above and three below the player.
- The current governor highlighted in the neighborhood.
- Equal metric values share the same rank.
- KPR displayed as a percentage.

The ranking panel is collapsed by default to keep the profile compact on mobile.

## 📊 Full Kingdom Ranking

Since **v1.5.0**, BattleTrack also provides a complete Kingdom 3903 ranking independent of the individual governor profile.

Features include:
- Full tracked governor list for the selected KvK / Season.
- Historical Season selection.
- Interactive **DKP | KPR | KP | KILLS** switching.
- Consistent ranking and tie logic with the personal ranking module.
- Mobile-friendly scrollable ranking area.
- Client-side sorting and caching for fast metric switching without repeated Google Sheets requests.

### Ranking formulas

**DKP**

```text
(Deads × 10) + (T4 Kills × 5) + (T5 Kills × 15)
```

**KPR**

```text
KvK Kill Points / Start Power
```

KPR is presented in the UI as a percentage.

**KILLS**

```text
T4 Kills + T5 Kills
```

## 🗺️ Season-aware data

Season names are sourced from the BattleTrack database rather than hard-coded into the frontend. The current tracked history includes Kingdom 3903 KvKs such as:
- Season 2
- Season 3 – King of All Britain
- Season 4 – Heroic Anthem

This allows the UI and historical rankings to follow the database as new KvKs are added.

## 🏗️ Architecture

```text
Google Sheets database
        ↓
Google Apps Script backend
        ↓
BattleTrack WebApp
        ↓
Governor Profile / Requirements / Rankings / Battle Archive
```

The Apps Script source is stored in [`apps-script/`](apps-script/):
- `Code.gs` – backend, data loading and calculations
- `Index.html` – WebApp structure
- `Styles.html` – responsive BattleTrack UI
- `Scripts.html` – client-side interaction and rendering

Project documentation is stored in [`docs/`](docs/).

## 📱 Design goals

BattleTrack is built around a few core principles:
- **Mobile first** – players frequently open the tool from Discord or their phone.
- **Requirements first** – the player should see what matters for their KvK obligations before optional ranking data.
- **Progressive disclosure** – large modules such as rankings and archives can be expanded when needed.
- **Fast interaction** – ranking metric switches are handled client-side where possible.
- **Single source of truth** – Season and battle data come from the BattleTrack database rather than duplicated frontend mappings.

## 🚧 Roadmap

Planned BattleTrack modules include:
- Flag Filler Registry integration with Main ↔ Flag Filler navigation.
- Mobile Hero / Keyvisual optimization.
- Player FAQ and ranking metric explanations.
- About BattleTrack and How It Works pages.
- Kingdom-wide KvK statistics dashboard.
- Historical Kingdom trends for KP, Kills, Deads and transferred RSS.
- Additional Kingdom analytics and performance comparisons across KvKs.

## 🔒 Data & repository scope

This public repository contains the BattleTrack application source code and documentation. Production Google Sheets data, governor datasets, credentials, tokens and other internal Kingdom 3903 data are **not included** in the repository.

---

**Built for Kingdom 3903 ⚔️**
