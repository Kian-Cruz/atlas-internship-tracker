// Works out which role, company and job description a skills analysis should use.
// Manual input always wins; a linked application fills in whatever the user left empty.
// Pure logic with injected dependencies, so it can be unit tested without a database or network.
import { AppError } from './server';

export type JobInput = { job_title: string; company_name: string; job_description: string; source_url: string };
export type JobOrigin = 'pasted_text' | 'pasted_link' | 'application_link' | 'previous_analysis';
export type ResolvedJob = { jobTitle: string; companyName: string; jobText: string; sourceUrl: string; origin: JobOrigin };

type Deps = {
  input: JobInput;
  /** The user's linked application row, or null when none is linked. */
  application: Record<string, unknown> | null;
  /** Looks up the linked application's company name (called only when needed). */
  companyName: () => Promise<string>;
  /** Fetches readable text from a job posting URL (throws AppError when it cannot). */
  fetchPosting: (url: string) => Promise<string>;
  /** The most recent saved job description for this application, if any. */
  previousDescription: () => Promise<string | null>;
};

export async function resolveJobInput({ input, application, companyName, fetchPosting, previousDescription }: Deps): Promise<ResolvedJob> {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const jobTitle = input.job_title.trim() || text(application?.role);
  const company = input.company_name.trim() || (application ? await companyName().catch(() => '') : '');
  const done = (jobText: string, sourceUrl: string, origin: JobOrigin): ResolvedJob => ({ jobTitle, companyName: company, jobText, sourceUrl, origin });

  const pasted = input.job_description.trim();
  if (pasted) return done(pasted, input.source_url, 'pasted_text');
  if (input.source_url) return done(await fetchPosting(input.source_url), input.source_url, 'pasted_link');

  if (application) {
    const applicationUrl = text(application.job_url);
    if (applicationUrl) {
      try { return done(await fetchPosting(applicationUrl), applicationUrl, 'application_link'); }
      catch (error) { if (!(error instanceof AppError)) throw error; /* fall back to an earlier analysis of this application */ }
    }
    const previous = await previousDescription();
    if (previous && previous.trim()) return done(previous.trim(), '', 'previous_analysis');
    throw new AppError(422, 'We could not read a job description for this application. Paste the description or a link to the posting.');
  }
  throw new AppError(422, 'Paste a job description or a link to one.');
}