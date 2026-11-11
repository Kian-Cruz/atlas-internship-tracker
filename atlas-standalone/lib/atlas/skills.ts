import 'server-only';
import { lookup } from 'node:dns/promises';
import { AppError, clean } from './server';
import { isBlockedHost, isPrivateAddress } from './url-guard';

export { analyzeSkillGap, type SkillGapResult } from './skill-ai';

/** Turns a raw DB row into the client-facing SkillAnalysis shape (JSON text columns parsed into real arrays/objects). */
export function parseSkillAnalysisRow(row: Record<string, unknown>) {
  const cleaned = clean(row) as Record<string, unknown>;
  for (const key of ['resume_skills', 'matched_skills', 'missing_skills', 'suggestions'] as const) {
    try { cleaned[key] = JSON.parse(String(cleaned[key] ?? '[]')); } catch { cleaned[key] = []; }
  }
  try { cleaned.skill_progress = JSON.parse(String(cleaned.skill_progress ?? '{}')); } catch { cleaned.skill_progress = {}; }
  return cleaned;
}

// --- Resume text extraction -------------------------------------------------

/** Pulls plain text out of an uploaded résumé. Throws AppError(422) for content we can't read. */
export async function extractResumeText(bytes: Uint8Array, contentType: string): Promise<string> {
  try {
    if (contentType === 'text/plain') return new TextDecoder('utf-8').decode(bytes).trim();
    if (contentType === 'application/pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: bytes });
      try { return (await parser.getText()).text.trim(); } finally { await parser.destroy(); }
    }
    if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      return result.value.trim();
    }
  } catch {
    throw new AppError(422, 'This document could not be read. Try re-uploading it as a PDF, Word document, or plain text file.');
  }
  throw new AppError(422, 'This document type is not supported for analysis.');
}

// --- Job posting URL fetch (SSRF-guarded) -----------------------------------

/** Fetches a job posting page and returns its readable text. Rejects requests aimed at internal/private networks. */
export async function fetchJobPostingText(rawUrl: string): Promise<string> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new AppError(422, 'That job posting link is not a valid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new AppError(422, 'Only http:// or https:// links are supported.');
  if (isBlockedHost(url.hostname)) throw new AppError(422, 'That link cannot be fetched.');
  try {
    const { address } = await lookup(url.hostname);
    if (isPrivateAddress(address)) throw new AppError(422, 'That link cannot be fetched.');
  } catch (e) { if (e instanceof AppError) throw e; throw new AppError(422, 'That job posting link could not be resolved.'); }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AtlasBot/1.0)' } });
  } catch {
    throw new AppError(422, 'That job posting could not be reached. Paste the description text instead.');
  } finally { clearTimeout(timeout); }
  if (!response.ok || !response.body) throw new AppError(422, 'That job posting could not be reached. Paste the description text instead.');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0; const max = 3 * 1024 * 1024;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > max) { await reader.cancel(); break; }
    chunks.push(value);
  }
  const all = new Uint8Array(size); let offset = 0; for (const c of chunks) { all.set(c, offset); offset += c.length; }
  const html = new TextDecoder('utf-8').decode(all);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|p|div|li|h[1-6])[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  if (!text) throw new AppError(422, 'No readable text was found at that link. Paste the description text instead.');
  return text;
}