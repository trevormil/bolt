// @vellum/scheduler — light per-persona check-ins (0018). On a cadence, each
// persona reviews its budget / free-form balance / unsettled txs and surfaces a
// nudge worth the human's attention — staying quiet when nothing matters.
export {
  checkIn,
  formatCheckIn,
  type CheckIn,
  type CheckInOptions,
} from "./checkin.ts";
export {
  CheckInScheduler,
  type SchedulerDeps,
  type Deliver,
} from "./scheduler.ts";
