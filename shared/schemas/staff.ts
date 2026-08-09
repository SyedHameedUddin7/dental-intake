import { z } from 'zod'

// Roles an admin can assign when creating a staff login. Mirrors the user_role
// pgEnum in the DB schema.
export const STAFF_ROLES = ['admin', 'front_desk', 'dentist'] as const
export const staffRoleSchema = z.enum(STAFF_ROLES)
export type StaffRole = (typeof STAFF_ROLES)[number]

// Payload for creating a staff login from the admin page.
export const createStaffSchema = z.object({
  fullName: z.string().trim().min(1, 'Required').max(100),
  email: z.email('Enter a valid email'),
  role: staffRoleSchema,
  // Supabase bcrypt caps effective length at 72 bytes.
  password: z.string().min(8, 'At least 8 characters').max(72),
})
export type CreateStaffInput = z.infer<typeof createStaffSchema>

// A staff member as listed on the admin page.
export type StaffMember = {
  id: string
  fullName: string
  role: StaffRole
  email: string | null
}
