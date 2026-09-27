'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Sparkles, Target, Trash2, TriangleAlert, Link as LinkIcon, FileText, CheckCircle2, CircleAlert, Circle, BookOpen } from 'lucide-react';
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

  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy || !protect()) return; setError('');
    if (!documentId) { setError('Choose which résumé to analyze.'); return; }
    if (mode === 'text' && jobDescription.trim().length < 30) { setError('Paste the job description (at least a few sentences).'); return; }
    if (mode === 'url') { const parsed = safeUrl.safeParse(sourceUrl); if (!parsed.success || !sourceUrl) { setError('Paste a valid job posting link.'); return; } }
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

  return <div className="skills-layout">
    <section className="panel skills-form-panel">
      <div className="panel-heading"><div><h2>Analyze a job description</h2><p>See what matches your résumé and what to build next</p></div><Sparkles size={18} /></div>
      <form onSubmit={submit} className="skills-form">
        {error && <div className="error-banner" role="alert"><TriangleAlert size={18} /><span>{error}</span></div>}
        <div className="field"><Label htmlFor="skills-resume">Résumé</Label><Choice label="Résumé" id="skills-resume" value={documentId} onChange={setDocumentId} options={resumes.map(d => ({ value: d.id, label: d.name }))} /></div>
        <div className="field"><Label htmlFor="skills-app">Application (optional)</Label><Choice label="Application" id="skills-app" value={applicationId || 'none'} onChange={v => setApplicationId(v === 'none' ? '' : v)} options={[{ value: 'none', label: 'Not linked' }, ...applicationOptions]} /></div>
        <div className="field"><Label htmlFor="skills-title">Role title (optional)</Label><Input id="skills-title" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Product Management Intern" /></div>
        <div className="field"><Label htmlFor="skills-company">Company (optional)</Label><Input id="skills-company" value={companyField} onChange={e => setCompanyField(e.target.value)} placeholder="e.g. Northstar" /></div>
        <div className="field full">
          <Tabs value={mode} onValueChange={v => setMode(v as 'text' | 'url')}><TabsList><TabsTrigger value="text"><FileText size={14} />Paste text</TabsTrigger><TabsTrigger value="url"><LinkIcon size={14} />Paste link</TabsTrigger></TabsList></Tabs>
          {mode === 'text'
            ? <Textarea aria-label="Job description" value={jobDescription} onChange={e => setJobDescription(e.target.value)} rows={8} maxLength={20000} placeholder="Paste the full job description here…" />
            : <Input aria-label="Job posting link" type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://…" />}
        </div>
        <div className="field full"><button className="btn primary" type="submit" disabled={busy}>{busy && <Loader2 className="spin" />}{busy ? 'Analyzing…' : 'Analyze skills'}<Target size={16} /></button><p className="skills-privacy-note">Your résumé text and this job description are sent to Anthropic’s API to generate the comparison.</p></div>
      </form>
    </section>

    <section className="panel skills-history-panel">
      <div className="panel-heading"><div><h2>Past analyses</h2><p>{analyses.length ? `${analyses.length} saved` : 'None yet'}</p></div></div>
      {loading ? <p className="quiet-empty">Loading…</p> : !analyses.length ? <Blank icon={Sparkles} title="Your first analysis will appear here" description="Run a comparison above to see matched and missing skills." /> : <div className="analysis-list">{analyses.map(a => { const suggestionFor = Object.fromEntries(a.suggestions.map(s => [s.skill, s.why])); const learned = a.missing_skills.filter(s => a.skill_progress[s] === 'done').length; return <article className="analysis-card" key={a.id}>
        <div className="analysis-top"><div><strong>{a.job_title || 'Untitled role'}</strong><p>{a.company_name || (a.source_url ? new URL(a.source_url).hostname : 'No company listed')}</p></div><span className={`score-badge score-${scoreTone(a.match_score)}`}>{a.match_score}% match</span></div>
        <div className="score-track"><span className={`score-fill score-${scoreTone(a.match_score)}`} style={{ width: `${a.match_score}%` }} /></div>
        {a.summary && <p className="preserve-text analysis-summary">{a.summary}</p>}
        {a.matched_skills.length > 0 && <div className="chip-group"><span className="subtle-label"><CheckCircle2 size={12} /> YOU HAVE THESE</span><div className="chip-row">{a.matched_skills.map(s => <span className="skill-chip chip-matched" key={s}>{s}</span>)}</div></div>}
        {a.missing_skills.length > 0 && <div className="chip-group"><span className="subtle-label"><CircleAlert size={12} /> WORTH BUILDING · {learned}/{a.missing_skills.length} LEARNED</span><div className="skill-track-list">{a.missing_skills.map(s => <div className="skill-track-row" key={s}><div><strong>{s}</strong>{suggestionFor[s] && <p>{suggestionFor[s]}</p>}</div><ProgressToggle status={a.skill_progress[s] || 'todo'} onChange={status => void setProgress(a, s, status)} /></div>)}</div></div>}
        <footer className="analysis-footer"><small>{new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</small><button className="icon-btn" aria-label="Delete analysis" onClick={() => void remove(a.id, a.version)}><Trash2 size={15} /></button></footer>
      </article>; })}</div>}
    </section>
  </div>;
}

function Blank({ title, description, icon: Icon, children }: { title: string; description: string; icon: typeof Target; children?: React.ReactNode }) {
  return <Empty className="blank"><EmptyHeader><EmptyMedia variant="icon"><Icon /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{children}</Empty>;
}