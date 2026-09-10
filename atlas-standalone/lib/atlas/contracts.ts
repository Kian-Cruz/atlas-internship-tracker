import { z } from 'zod';
export const STAGES = ['Wishlist', 'Applied', 'Screening', 'Interview', 'Offer', 'Accepted', 'Rejected', 'Withdrawn'] as const;
export type Stage = typeof STAGES[number];
export const WORK_MODES = ['On-site', 'Hybrid', 'Remote'] as const;
export const DOC_KINDS = ['Resume', 'Cover letter', 'Portfolio', 'Transcript', 'Other'] as const;
export const DOC_STATUSES = ['Draft', 'Ready', 'Submitted'] as const;
export const INTERVIEW_STATUSES = ['Scheduled', 'Completed', 'Cancelled'] as const;
const text = (max: number) => z.string().trim().max(max);
const id = z.string().uuid('Choose an existing record.');
const optionalDate = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date').refine(v => { const d = new Date(v + 'T00:00:00Z'); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; }, 'Use a valid calendar date')]).default('');
export const safeUrl = z.union([z.literal(''), z.string().trim().max(1000).url('Enter a full https:// or http:// URL').refine(v => /^https?:\/\//i.test(v), 'Only https:// or http:// links are allowed')]).default('');
const email = z.union([z.literal(''), text(254).email('Enter a valid email')]).default('');
export const companySchema = z.object({ name: text(120).min(1, 'Company name is required'), industry: text(100).default(''), location: text(160).default(''), website: safeUrl, contact_email: email, notes: text(3000).default('') }).strict();
export const applicationSchema = z.object({ company_id: id, role: text(160).min(1, 'Role is required'), stage: z.enum(STAGES).default('Wishlist'), location: text(160).default(''), work_mode: z.enum(WORK_MODES).default('Hybrid'), job_url: safeUrl, applied_on: optionalDate, deadline: optionalDate, priority: z.enum(['Normal', 'High', 'Low']).default('Normal'), compensation: text(120).default(''), next_step: text(400).default('') }).strict();
export const interviewSchema = z.object({ application_id: id, title: text(160).min(1, 'Interview title is required'), starts_at: z.string().datetime({ offset: true, message: 'Choose a valid date and time' }), duration_minutes: z.number().int().min(5).max(480), format: z.enum(['Video call', 'Phone', 'In person']), location: text(500).default(''), meeting_url: safeUrl, interviewer: text(160).default(''), status: z.enum(INTERVIEW_STATUSES).default('Scheduled'), notes: text(3000).default('') }).strict();
export const noteSchema = z.object({ application_id: id, body: text(4000).min(1, 'Write a note first') }).strict();
export const documentSchema = z.object({ application_id: z.union([id, z.literal('')]).default(''), name: text(160).min(1, 'Document name is required'), kind: z.enum(DOC_KINDS), status: z.enum(DOC_STATUSES), notes: text(500).default('') }).strict();
export const versionSchema = z.number().int().positive();
export type CompanyInput = z.infer<typeof companySchema>;
export type ApplicationInput = z.infer<typeof applicationSchema>;
export type InterviewInput = z.infer<typeof interviewSchema>;
export type DocumentInput = z.infer<typeof documentSchema>;
export type Company = CompanyInput & { id: string; version: number; created_at: string; updated_at: string };
export type Application = ApplicationInput & { id: string; version: number; created_at: string; updated_at: string };
export type Interview = InterviewInput & { id: string; version: number; created_at: string; updated_at: string };
export type Note = { id: string; application_id: string; body: string; version: number; created_at: string; updated_at: string };
export type Document = DocumentInput & { id: string; filename: string; size: number; content_type: string; version: number; created_at: string; updated_at: string };
export type History = { id: string; application_id: string; from_stage: Stage | null; to_stage: Stage; created_at: string };
export type Snapshot = { companies: Company[]; applications: Application[]; interviews: Interview[]; notes: Note[]; documents: Document[]; history: History[] };
export const EMPTY: Snapshot = { companies: [], applications: [], interviews: [], notes: [], documents: [], history: [] };
export function isActive(stage: Stage) { return !['Wishlist', 'Accepted', 'Rejected', 'Withdrawn'].includes(stage); }
export function analytics(data: Snapshot, now = new Date()) {
  const submitted = data.applications.filter(a => a.applied_on || a.stage !== 'Wishlist');
  const replied = new Set(data.history.filter(h => ['Screening', 'Interview', 'Offer', 'Accepted', 'Rejected'].includes(h.to_stage)).map(h => h.application_id));
  const responseCount = submitted.filter(a => replied.has(a.id) || ['Screening', 'Interview', 'Offer', 'Accepted', 'Rejected'].includes(a.stage)).length;
  const offers = data.applications.filter(a => ['Offer', 'Accepted'].includes(a.stage)).length;
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1)); return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en', { month: 'short', timeZone: 'UTC' }), count: 0 }; });
  for (const a of submitted) { const m = months.find(m => m.key === a.applied_on.slice(0, 7)); if (m) m.count++; }
  return { total: data.applications.length, active: data.applications.filter(a => isActive(a.stage)).length, offers, submitted: submitted.length, responseCount, responseRate: submitted.length ? Math.round(responseCount / submitted.length * 100) : 0, offerRate: submitted.length ? Math.round(offers / submitted.length * 100) : 0, upcoming: data.interviews.filter(i => i.status === 'Scheduled' && new Date(i.starts_at) >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at)), stages: STAGES.map(stage => ({ stage, count: data.applications.filter(a => a.stage === stage).length })), months };
}
