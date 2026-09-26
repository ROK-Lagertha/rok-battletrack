/**
 * ROK BattleTrack data service.
 *
 * OP-025:
 * Google Sheets -> Apps Script -> Governor lookup -> WebApp dashboard
 */

/**
 * Placeholder for the Governor-ID lookup.
 * The real sheet mapping will be added once the current tracking
 * structure is connected.
 */
function getGovernorById(governorId) {
  if (!governorId) {
    throw new Error('Governor ID is required.');
  }

  return {
    governorId: String(governorId),
    status: 'placeholder'
  };
}
