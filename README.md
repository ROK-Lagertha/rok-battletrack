# ROK BattleTrack – OP-025 v1.1

First integrated WebApp build.

## Apps Script files
Upload/create these files in the same Apps Script project:
- Code.gs
- Index.html
- Styles.html
- Scripts.html

`Code.gs` contains the existing BattleTrack Backend API V1 plus the WebApp entry and a client bridge.

## Behaviour
- Opening the deployed WebApp URL shows the BattleTrack UI.
- `?governorId=208886484` still returns the JSON API response.
- The UI uses `google.script.run` to call `getPlayerData(governorId)`.

No database schema assumptions were changed.
