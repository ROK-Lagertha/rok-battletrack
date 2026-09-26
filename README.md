# ROK BattleTrack – Kingdom 3903

Current stable release: **v1.4.1.3**

ROK BattleTrack is the Kingdom 3903 governor performance dashboard built with Google Apps Script and Google Sheets.

### Current ranking module
- Interactive categories: **DKP | KPR | KP | KILLS**
- Ranking updates without reloading the governor profile.
- **KPR** is displayed as a percentage.
- **KILLS** uses T4 + T5 kills.
- All governors in the selected KvK Results population participate; equal values share the same rank.
- Current Season information order: **Stats → Requirements → Kingdom Ranking**.

### DKP formula
`(Deads × 10) + (T4 Kills × 5) + (T5 Kills × 15)`

Apps Script source files are in `apps-script/`.
