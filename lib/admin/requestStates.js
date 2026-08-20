/**
 * What a made-to-order request can do next, and what each state means.
 *
 * SEPARATE FROM RequestService ON PURPOSE. This is pure data with no imports,
 * so it can be read by a test, by the queue UI and by anything else without
 * dragging in a database client. The service that needed it was the only
 * thing that could load it, which meant the one table worth checking against
 * the database was the one table nothing could check.
 *
 * These mirror check_request_transition() in migration 0011. THE DATABASE IS
 * THE AUTHORITY -- the trigger raises on anything not in its own list, so the
 * worst a mistake here can do is offer a button that gets refused, or hide a
 * move that was allowed. Offering fewer moves than the database permits is a
 * deliberate option: `rejected` may technically go back to `new`, but there
 * is no sense in which reopening a turned-down job makes it unexamined again,
 * so the queue only offers `accepted`.
 */

export const NEXT_STEPS = {
  new: [
    ["accepted", "Take it on"],
    ["awaiting_info", "Need more from them"],
    ["rejected", "Turn it down"],
  ],
  accepted: [
    ["in_production", "Start modelling"],
    ["awaiting_info", "Need more from them"],
    ["rejected", "Turn it down"],
  ],
  awaiting_info: [
    ["in_production", "Start modelling"],
    ["accepted", "Back in the queue"],
    ["rejected", "Turn it down"],
  ],
  in_production: [
    ["review", "Send for approval"],
    ["awaiting_info", "Need more from them"],
    ["rejected", "Turn it down"],
  ],
  review: [
    ["delivered", "Deliver"],
    ["in_production", "Back to modelling"],
    ["rejected", "Turn it down"],
  ],
  delivered: [["in_production", "Revise it"]],
  rejected: [["accepted", "Reopen"]],
};

/**
 * What each state means, in the words an operator would use.
 *
 * "Waiting on us" and "Waiting on them" are the whole point of having states
 * at all: a queue that cannot tell them apart is a list.
 */
export const STATE_LABELS = {
  new: "Waiting on us",
  accepted: "In the queue",
  awaiting_info: "Waiting on them",
  in_production: "Being made",
  review: "With them to approve",
  delivered: "Done",
  rejected: "Turned down",
};

/** States the queue view hides, because the work is over. */
export const CLOSED_STATES = ["delivered", "rejected"];
