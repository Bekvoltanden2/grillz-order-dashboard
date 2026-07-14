export type Material = {
  id: string
  studio_id: string
  name: string
  color: string
  created_at: string
}

export type Order = {
  id: string
  studio_id: string
  order_number: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  grillz_type: string
  material: string
  price: number
  column_index: number
  impression_link_sent: boolean
  impression_date: string | null
  fitting_link_sent: boolean
  fitting_date: string | null
  notes: string[]
  materials_recorded: boolean
  created_at: string
  updated_at: string
}

export type StockItem = {
  id: string
  studio_id: string
  name: string
  grams: number
  low_threshold: number
  created_at: string
}

export type StockMovement = {
  id: string
  studio_id: string
  stock_item_id: string
  change_grams: number
  reason: string | null
  order_id: string | null
  created_at: string
}

export type Studio = {
  id: string
  name: string
  city: string
  owner_id: string
  webhook_send_url: string | null
  webhook_poll_url: string | null
  cal_impression_url: string | null
  cal_fitting_url: string | null
  cal_webhook_secret: string | null
  contact_email?: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled' | null
  created_at: string
}

export type Profile = {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'studio_owner'
  studio_id: string | null
  created_at: string
}

export const COLUMNS = [
  { label: 'New order',                    short: 'New order',        next: 'Approve' },
  { label: 'Dental impression appt.',      short: 'Impression appt.', next: 'Appointment done' },
  { label: 'Completed dental impressions', short: 'Impressions done', next: 'Start wax-up' },
  { label: 'Wax up',                       short: 'Wax up',           next: 'Wax-up done' },
  { label: 'Ready to be casted',           short: 'To cast',          next: 'Cast' },
  { label: 'Casted',                       short: 'Casted',           next: 'Ready for fitting' },
  { label: 'Ready for fitting',            short: 'Fitting',          next: 'Fitting done' },
  { label: 'Complete order',               short: 'Complete',         next: null },
] as const

export const IMPRESSION_COL = 1
export const FITTING_COL = 6
export const NOTE_PRESETS = ['Gem', 'Enamel', 'Diamond cut', 'Custom design', 'Rush order', 'VIP']
