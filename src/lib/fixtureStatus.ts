// fixtures.status (22 Oct 2026, audit DQ-02/03):
//   scheduled        -- not kicked off
//   postponed        -- a source said so
//   awaiting_result  -- kicked off, no result or reported score yet
//   played           -- a result (matches) or a reported score exists
// "Not played" no longer means "still to come": an awaiting_result game has
// kicked off. Use these helpers rather than comparing with 'played'.

/** Statuses of a game that has kicked off (so it is not upcoming). */
export const KICKED_OFF_STATUSES = ['played', 'awaiting_result'] as const;

/** The game has kicked off: played, or awaiting its result. */
export function hasKickedOff(status: string | null | undefined): boolean {
  return status === 'played' || status === 'awaiting_result';
}

/** Kicked off but no result or reported score has arrived yet. */
export function isAwaitingResult(status: string | null | undefined): boolean {
  return status === 'awaiting_result';
}

/** What to show in a score column while the result is missing (the wording
 *  GameweekBrowser already used for kicked-off games without a score). */
export const RESULT_PENDING_LABEL = 'Result to follow';
