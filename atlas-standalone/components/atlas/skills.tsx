'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Sparkles, Target, Trash2, TriangleAlert, Link as LinkIcon, FileText, CheckCircle2, CircleAlert, Circle, BookOpen, ArrowRight, Info } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { toast } from 'sonner';
import { Choice } from './editor';
import { api, type ApiFailure } from '@/lib/atlas/client';
import { safeUrl } from '@/lib/atlas/contracts';
import type { Document, Application, SkillAnalysis, SkillStatus } from '@/lib/atlas/contracts';

type Props = { documents: Document[]; applications: Application[]; companyName: (companyId: string) => string; protect: () => boolean; onNeedResume: () => void };

const STEPS: { key: SkillStatus; label: string; icon: typeof Circle }[] = [{ key: 'todo', label: 'To learn', icon: Circle }, { key: 'learning', label: 'Learning', icon: BookOpen }, { key: 'done', label: 'Learned', icon: CheckCircle2 }];
function ProgressToggle({ status, onChange }: { status: SkillStatus; onChange: (s: SkillStatus) => void }) {
  return <div className="progress-toggle" role="group" aria-label="Progress on this skill">{STEPS.map(s => <button key={s.key} type="button" className={`progress-btn progress-${s.key}${status === s.key ? ' active' : ''}`} aria-pressed={status === s.key} title={s.label} onClick={() => onChange(s.key)}><s.icon size={13} /></button>)}</div>;
}

function scoreTone(score: number) { return score >= 70 ? 'good' : score >= 40 ? 'fair' : 'low'; }

// Analyses saved before short explanations existed have no "action", so we show a sensible default.
const FALLBACK_WHY = 'Mentioned in the job description but not found on your résumé.';
const fallbackAction = (skill: string) => `Take a short course or build a small project that uses ${skill}.`;
const PRIORITY_COUNT = 3;

export default function SkillsPanel({ documents, applications, companyName, protect, onNeedResume }: Props) {
  const resumes = documents.filter(d => d.kind === 'Resume');
  const [analyses, setAnalyses] = useState<SkillAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [documentId, setDocumentId] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [companyField, setCompanyField] = useState('');
  const [mode, setMode] = useState<'text' | 'url'>('text');
  const [jobDescription, setJobDescription] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { let alive = true; (async () => { try { const result = await api('skills'); if (alive) setAnalyses(result as unknown as SkillAnalysis[]); } catch { /* the panel still works without history */ } finally { if (alive) setLoading(false); } })(); return () => { alive = false; }; }, []);

  // A linked application supplies the role, company and job description the user leaves empty.
  const selectedApp = applications.find(a => a.id === applicationId) || null;
  const appCompany = selectedApp ? companyName(selectedApp.company_id) : '';
  const previousForApp = selectedApp ? analyses.find(a => a.application_id === selectedApp.id && a.job_description) : undefined;
  const appSource: 'link' | 'previous' | 'none' = !selectedApp ? 'none' : selectedApp.job_url ? 'link' : previousForApp ? 'previous' : 'none';
  const manualEntered = mode === 'text' ? jobDescription.trim().length > 0 : sourceUrl.trim().length > 0;
  const sourceNote = manualEntered ? 'From what you enter below' : appSource === 'link' ? 'Read from the application’s job link' : appSource === 'previous' ? 'Reused from your last analysis of this application' : 'Not available yet. Paste a description or a link below.';

  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy || !protect()) return; setError('');
    if (!documentId) { setError('Choose which résumé to analyze.'); return; }
    if (manualEntered) {
      if (mode === 'text' && jobDescription.trim().length < 30) { setError('Paste the job description (at least a few sentences).'); return; }
      if (mode === 'url') { const parsed = safeUrl.safeParse(sourceUrl); if (!parsed.success || !sourceUrl) { setError('Paste a valid job posting link.'); return; } }
    } else if (!selectedApp || appSource === 'none') {
      if (selectedApp) setError('This application has no job link or earlier analysis yet. Paste the job description or a link below.');
      else setError(mode === 'text' ? 'Paste the job description (at least a few sentences).' : 'Paste a valid job posting link.');
      return;
    }
    setBusy(true);
    try {
      const payload = { document_id: documentId, application_id: applicationId, job_title: jobTitle, company_name: companyField, job_description: mode === 'text' ? jobDescription : '', source_url: mode === 'url' ? sourceUrl : '' };
      const created = await api('skills', 'POST', payload) as unknown as SkillAnalysis;
      setAnalyses(a => [created, ...a]);
      setJobDescription(''); setSourceUrl(''); setJobTitle(''); setCompanyField('');
      toast.success('Skill analysis ready.');
    } catch (e) { const err = e as ApiFailure; setError(err.message); } finally { setBusy(false); }
  }

  async function remove(id: string, version: number) {
    if (!protect()) return;
    const previous = analyses; setAnalyses(a => a.filter(x => x.id !== id));
    try { await api(`skills/${id}?version=${version}`, 'DELETE'); toast.success('Analysis deleted.'); }
    catch (e) { setAnalyses(previous); toast.error((e as Error).message); }
  }

  async function setProgress(a: SkillAnalysis, skill: string, status: SkillStatus) {
    if (!protect()) return;
    const previous = analyses;
    setAnalyses(list => list.map(x => x.id === a.id ? { ...x, skill_progress: { ...x.skill_progress, [skill]: status }, version: x.version + 1 } : x));
    try { const updated = await api(`skills/${a.id}`, 'PATCH', { skill, status, version: a.version }) as unknown as SkillAnalysis; setAnalyses(list => list.map(x => x.id === a.id ? updated : x)); }
    catch (e) { setAnalyses(previous); toast.error((e as Error).message); }
  }

  if (!resumes.length) return <div className="panel"><Blank icon={Target} title="Upload a résumé to get started" description="Add a résumé under Documents, then come back here to compare it against a job description."><button className="btn primary" onClick={onNeedResume}><FileText />Go to documents</button></Blank></div>;

  const applicationOptions = applications.map(a => ({ value: a.id, label: `${companyName(a.company_id)} · ${a.role}` }));

  const guide = <details className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed" open={!loading && analyses.length === 0}>
    <summary className="cursor-pointer font-semibold">How to use this page</summary>
    <ol className="mt-3 list-decimal space-y-1 pl-5">
      <li>Pick your résumé (upload a PDF, Word or text file under Documents first).</li>
      <li>Optional: pick an application. Its role, company and job link are used automatically.</li>
      <li>Or paste the <strong>full job description</strong>, including the requirements list, or paste a link to the posting.</li>
      <li>Click <strong>Analyze skills</strong> and wait a few seconds.</li>
      <li>Read the skills you have and the skills to learn, each with a short next step.</li>
      <li>Mark each skill to learn as To learn, Learning or Learned as you work on it.</li>
    </ol>
    <p className="mt-3 opacity-80">Tips: use a text-based PDF (scans can’t be read), run one analysis per job, and re-run after you update your résumé to see your score improve. The score is an AI estimate, so treat it as advice. If a link can’t be read, paste the text instead. If you see a busy message, wait a minute and retry.</p>
  </details>;

  return <>{guide}<div className="skills-layout">
    <section className="panel skills-form-panel">
      <div className="panel-heading"><div><h2>Analyze a job description</h2><p>See what matches your résumé and what to build next</p></div><Sparkles size={18} /></div>
      <form onSubmit={submit} className="skills-form">
        {error && <div className="error-banner" role="alert"><TriangleAlert size={18} /><span>{error}</span></div>}
        <div className="field"><Label htmlFor="skills-resume">Résumé</Label><Choice label="Résumé" id="skills-resume" value={documentId} onChange={setDocumentId} options={resumes.map(d => ({ value: d.id, label: d.name }))} /></div>
        <div className="field"><Label htmlFor="skills-app">Application (optional)</Label><Choice label="Application" id="skills-app" value={applicationId || 'none'} onChange={v => setApplicationId(v === 'none' ? '' : v)} options={[{ value: 'none', label: 'Not linked' }, ...applicationOptions]} /></div>
        <div className="field"><Label htmlFor="skills-title">Role title (optional)</Label><Input id="skills-title" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder={selectedApp ? selectedApp.role : 'e.g. Product Management Intern'} /></div>
        <div className="field"><Label htmlFor="skills-company">Company (optional)</Label><Input id="skills-company" value={companyField} onChange={e => setCompanyField(e.target.value)} placeholder={appCompany || 'e.g. Northstar'} /></div>
        {selectedApp && <div className="field full">
          <div className={`rounded-lg border p-3 text-sm ${manualEntered || appSource !== 'none' ? 'border-sky-500/30 bg-sky-500/5' : 'border-amber-500/30 bg-amber-500/5'}`} role="status">
            <p className="flex items-center gap-2 font-semibold"><Info size={14} />Using details from your application</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="opacity-70">Role</dt><dd>{jobTitle.trim() || selectedApp.role}</dd>
              <dt className="opacity-70">Company</dt><dd>{companyField.trim() || appCompany || 'Not set'}</dd>
              <dt className="opacity-70">Job description</dt><dd>{sourceNote}</dd>
            </dl>
            <p className="mt-2 text-xs opacity-70">Type or paste below to override any of these.</p>
          </div>
        </div>}
        <div className="field full">
          <Tabs value={mode} onValueChange={v => setMode(v as 'text' | 'url')}><TabsList><TabsTrigger value="text"><FileText size={14} />Paste text</TabsTrigger><TabsTrigger value="url"><LinkIcon size={14} />Paste link</TabsTrigger></TabsList></Tabs>
          {mode === 'text'
            ? <Textarea aria-label="Job description" value={jobDescription} onChange={e => setJobDescription(e.target.value)} rows={8} maxLength={20000} placeholder={selectedApp && appSource !== 'none' ? 'Optional. Leave empty to use the application’s job details, or paste a description to override them…' : 'Paste the full job description here…'} />
            : <Input aria-label="Job posting link" type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder={selectedApp && appSource !== 'none' ? 'https://… (optional for this application)' : 'https://…'} />}
        </div>
        <div className="field full"><button className="btn primary" type="submit" disabled={busy}>{busy && <Loader2 className="spin" />}{busy ? 'Analyzing…' : 'Analyze skills'}<Target size={16} /></button><p className="skills-privacy-note">Your résumé text and this job description are sent to an AI service (Google Gemini) to generate the comparison.</p></div>
      </form>
    </section>

    <section className="panel skills-history-panel">
      <div className="panel-heading"><div><h2>Past analyses</h2><p>{analyses.length ? `${analyses.length} saved` : 'None yet'}</p></div></div>
      {loading ? <p className="quiet-empty">Loading…</p> : !analyses.length ? <Blank icon={Sparkles} title="Your first analysis will appear here" description="Run a comparison above to see matched and missing skills." /> : <div className="analysis-list">{analyses.map(a => { const detail = new Map(a.suggestions.map(s => [s.skill, s])); const learned = a.missing_skills.filter(s => a.skill_progress[s] === 'done').length; return <article className="analysis-card" key={a.id}>
        <div className="analysis-top"><div><strong>{a.job_title || 'Untitled role'}</strong><p>{a.company_name || (a.source_url ? new URL(a.source_url).hostname : 'No company listed')}</p></div><span className={`score-badge score-${scoreTone(a.match_score)}`}>{a.match_score}% match</span></div>
        <div className="score-track"><span className={`score-fill score-${scoreTone(a.match_score)}`} style={{ width: `${a.match_score}%` }} /></div>
        {a.summary && <p className="preserve-text analysis-summary">{a.summary}</p>}

        <section className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3" aria-label="Skills you have">
          <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={15} />Skills You Have</h3><span className="text-xs opacity-70">{a.matched_skills.length}</span></div>
          <p className="mt-1 text-xs opacity-70">Already on your résumé. Keep these visible in your application.</p>
          {a.matched_skills.length > 0
            ? <div className="chip-row mt-2">{a.matched_skills.map(s => <span className="skill-chip chip-matched" key={s}>{s}</span>)}</div>
            : <p className="mt-2 text-sm opacity-80">No direct matches yet. Start with the skills below.</p>}
        </section>

        <section className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3" aria-label="Skills to learn">
          <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><CircleAlert size={15} />Skills to Learn</h3><span className="text-xs opacity-70">{learned}/{a.missing_skills.length} learned</span></div>
          <p className="mt-1 text-xs opacity-70">Most important first. Mark your progress as you go.</p>
          {a.missing_skills.length > 0
            ? <div className="skill-track-list mt-2">{a.missing_skills.map((s, i) => { const d = detail.get(s); const status = a.skill_progress[s] || 'todo'; return <div className="skill-track-row" key={s}>
                <div>
                  <strong>{s}{i < PRIORITY_COUNT && status !== 'done' && <span className="ml-2 rounded-full border border-amber-500/40 px-2 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide">Priority</span>}</strong>
                  <p>{d?.why || FALLBACK_WHY}</p>
                  <p className="mt-1 flex items-start gap-1.5"><ArrowRight size={13} className="mt-0.5 shrink-0" /><span><span className="font-medium">Next step:</span> {d?.action || fallbackAction(s)}</span></p>
                </div>
                <ProgressToggle status={status} onChange={next => void setProgress(a, s, next)} />
              </div>; })}</div>
            : <p className="mt-2 text-sm opacity-80">You cover every skill we found in this job description.</p>}
        </section>

        <footer className="analysis-footer"><small>{new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</small><button className="icon-btn" aria-label="Delete analysis" onClick={() => void remove(a.id, a.version)}><Trash2 size={15} /></button></footer>
      </article>; })}</div>}
    </section>
  </div></>;
}

function Blank({ title, description, icon: Icon, children }: { title: string; description: string; icon: typeof Target; children?: React.ReactNode }) {
  return <Empty className="blank"><EmptyHeader><EmptyMedia variant="icon"><Icon /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{children}</Empty>;
}