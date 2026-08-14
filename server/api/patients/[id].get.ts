import { z } from 'zod'
import { eq, desc, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../../db'
import { patients, visits, intakeSubmissions, aiSummaries, profiles } from '../../db/schema'
import type { PatientDetail, TimelineVisit } from '#shared/schemas/patient'
import type { SummaryStructured } from '#shared/schemas/summary'
import { signedCardUrl } from '../../utils/storage'
import { serverSupabaseUser } from '#supabase/server'

const CAN_VIEW = ['admin', 'front_desk', 'dentist']

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null)

export default defineEventHandler(async (event): Promise<PatientDetail> => {
  const claims = await serverSupabaseUser(event)
  const userId = claims?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Profile not found' })
  if (!CAN_VIEW.includes(profile.role)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Valid patient id is required' })
  const patientId = id.data

  const [patient] = await db
    .select({
      id: patients.id,
      firstName: patients.firstName,
      lastName: patients.lastName,
      dateOfBirth: patients.dateOfBirth,
      phone: patients.phone,
      email: patients.email,
      createdAt: patients.createdAt,
      insuranceProvider: patients.insuranceProvider,
      insuranceMemberId: patients.insuranceMemberId,
      insuranceCardPath: patients.insuranceCardPath,
      insuranceStatus: patients.insuranceStatus,
    })
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1)
  if (!patient) throw createError({ statusCode: 404, statusMessage: 'Patient not found' })

  const insurance = {
    provider: patient.insuranceProvider,
    memberId: patient.insuranceMemberId,
    status: patient.insuranceStatus,
    hasCard: !!patient.insuranceCardPath,
    cardUrl: patient.insuranceCardPath ? await signedCardUrl(patient.insuranceCardPath) : null,
  }

  // Visits, newest first, with the assigned dentist's name.
  const provider = alias(profiles, 'provider')
  const visitRows = await db
    .select({
      id: visits.id,
      status: visits.status,
      reason: visits.reason,
      checkedInAt: visits.checkedInAt,
      createdAt: visits.createdAt,
      diagnosis: visits.diagnosis,
      comments: visits.comments,
      providerName: provider.fullName,
    })
    .from(visits)
    .leftJoin(provider, eq(visits.providerId, provider.id))
    .where(eq(visits.patientId, patientId))
    .orderBy(sql`${visits.checkedInAt} desc nulls last`, desc(visits.createdAt))

  // Intake history per visit.
  const intakeRows = await db
    .select({
      id: intakeSubmissions.id,
      visitId: intakeSubmissions.visitId,
      allergies: intakeSubmissions.allergies,
      conditions: intakeSubmissions.conditions,
      medications: intakeSubmissions.medications,
      symptoms: intakeSubmissions.symptoms,
    })
    .from(intakeSubmissions)
    .where(eq(intakeSubmissions.patientId, patientId))
  const intakeByVisit = new Map<string, (typeof intakeRows)[number]>()
  for (const it of intakeRows) if (it.visitId) intakeByVisit.set(it.visitId, it)

  // Latest AI summary per intake.
  const intakeIds = intakeRows.map((i) => i.id)
  const summaryByIntake = new Map<string, { summaryText: string; structured: SummaryStructured }>()
  if (intakeIds.length) {
    const summaryRows = await db
      .select({
        intakeId: aiSummaries.intakeId,
        summaryText: aiSummaries.summaryText,
        structured: aiSummaries.structured,
      })
      .from(aiSummaries)
      .where(inArray(aiSummaries.intakeId, intakeIds))
      .orderBy(desc(aiSummaries.createdAt))
    for (const s of summaryRows) {
      if (!summaryByIntake.has(s.intakeId)) {
        summaryByIntake.set(s.intakeId, {
          summaryText: s.summaryText,
          structured: s.structured as SummaryStructured,
        })
      }
    }
  }

  const timeline: TimelineVisit[] = visitRows.map((v) => {
    const it = intakeByVisit.get(v.id)
    return {
      id: v.id,
      status: v.status,
      reason: v.reason,
      checkedInAt: iso(v.checkedInAt),
      createdAt: iso(v.createdAt)!,
      providerName: v.providerName,
      diagnosis: v.diagnosis,
      comments: v.comments,
      history: it
        ? { allergies: it.allergies, conditions: it.conditions, medications: it.medications, symptoms: it.symptoms }
        : null,
      summary: it ? (summaryByIntake.get(it.id) ?? null) : null,
    }
  })

  return {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth,
    phone: patient.phone,
    email: patient.email,
    createdAt: iso(patient.createdAt)!,
    insurance,
    visits: timeline,
  }
})
