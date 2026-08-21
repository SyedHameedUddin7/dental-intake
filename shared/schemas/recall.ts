// A patient is "due for recall" when their last visit is older than this window
// and they have no upcoming appointment booked.
export const RECALL_MONTHS = 6

export type RecallPatient = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  lastVisitAt: string
}
