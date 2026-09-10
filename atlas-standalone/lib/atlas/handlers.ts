import { applicationSchema, companySchema, interviewSchema, noteSchema, documentSchema, versionSchema } from '@/lib/atlas/contracts';
import { AppError, createServices, type Dependencies, boundedBody, jsonBody, response, boundary, limits, clean, TABLES, type Table } from '@/lib/atlas/server';
export function createHandlers(deps: Dependencies) {
const {database, bucket, identity, owned, quota} = createServices(deps);
const schemas = { companies: companySchema, applications: applicationSchema, interviews: interviewSchema, notes: noteSchema, documents: documentSchema };
function parts(req: Request) { return new URL(req.url).pathname.split('/').filter(Boolean).slice(1); }
function tableName(v: string): Table { if (!TABLES.includes(v as Table)) throw new AppError(404, 'This page was not found.'); return v as Table; }
async function links(table: Table, data: Record<string, unknown>, userId: string) { if (table === 'applications') await owned('companies', String(data.company_id), userId); if (['notes', 'interviews', 'documents'].includes(table) && data.application_id) await owned('applications', String(data.application_id), userId); }
async function GET(req: Request) {  
return boundary(async () => {
    const [route, id, action] = parts(req);
    if (route === 'health') { await database().prepare('SELECT 1').first(); return response({ status: 'ok' }); }
    const user = await identity(req);
    if (route === 'workspace') {
      const names = [...TABLES, 'stage_history']; const results = await database(user.userId).batch(names.map(t => database(user.userId).prepare(`SELECT * FROM ${t} WHERE user_id=? ORDER BY ${t === 'stage_history' ? 'created_at' : 'updated_at'} DESC LIMIT ${t === 'stage_history' ? 5000 : 1001}`).bind(user.userId)));
      return response(Object.fromEntries(names.map((t, i) => [t === 'stage_history' ? 'history' : t, results[i].results.map(r => clean(r as Record<string, unknown>))])));
    }
    const table = tableName(route); const row = await owned(table, id, user.userId);
    if (table === 'documents' && action === 'download') {
      if (row.deleting) throw new AppError(409, 'This document is being deleted. Refresh and retry deletion if it did not finish.');
      const file = await bucket().get(String(row.object_key)); if (!file) throw new AppError(404, 'This file is unavailable. Please upload it again.');
      return new Response(new Uint8Array(file.body), { headers: { 'Content-Type': String(row.content_type), 'Content-Length': String(file.size), 'Content-Disposition': `attachment; filename="${String(row.filename).replace(/[^a-zA-Z0-9._ -]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(String(row.filename))}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
    }
    if (action) throw new AppError(404, 'This page was not found.'); return response(clean(row));
  });
}
async function POST(req: Request) {  
return boundary(async () => {
    const user = await identity(req); const [route, id] = parts(req); if (id) throw new AppError(404, 'This page was not found.'); const table = tableName(route); await quota(table, user.userId);
    const now = new Date().toISOString(), recordId = crypto.randomUUID(); let data: Record<string, unknown>, objectKey: string | undefined;
    if (table === 'documents') {
      const type = req.headers.get('content-type'); if (!type?.startsWith('multipart/form-data')) throw new AppError(415, 'Choose a file to upload.');
      const bytes = await boundedBody(req, 4 * 1024 * 1024 + 32768); let form: FormData;
      try { form = await new Response(bytes, { headers: { 'Content-Type': type } }).formData(); } catch { throw new AppError(400, 'The upload could not be read.'); }
      data = documentSchema.parse(Object.fromEntries(['application_id', 'name', 'kind', 'status', 'notes'].map(k => [k, String(form.get(k) || '')])));
      const file = form.get('file'); if (!(file instanceof File) || file.size === 0) throw new AppError(422, 'Choose a non-empty file.'); if (file.size > 4 * 1024 * 1024) throw new AppError(413, 'Files must be 4 MB or smaller.');
      const filename = file.name.replace(/[\x00-\x1f\x7f]/g, '').split(/[\\/]/).pop()!.slice(0, 180);
      const extension = filename.split('.').pop()?.toLowerCase(); const allowed: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain' };
      if (!extension || !allowed[extension]) throw new AppError(422, 'Upload a PDF, DOCX, or TXT file.');
      const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (extension === 'pdf' && new TextDecoder().decode(head).slice(0, 5) !== '%PDF-') throw new AppError(422, 'This does not appear to be a PDF.');
      if (extension === 'docx' && !(head[0] === 80 && head[1] === 75 && head[2] === 3 && head[3] === 4)) throw new AppError(422, 'This does not appear to be a DOCX file.');
      if (extension === 'txt') { const all = new Uint8Array(await file.arrayBuffer()); if (all.includes(0)) throw new AppError(422, 'This does not appear to be a text file.'); }
      await links(table, data, user.userId); objectKey = `${user.userId}/${crypto.randomUUID()}/${recordId}`;
      await bucket().put(objectKey, new Uint8Array(await file.arrayBuffer()), allowed[extension]);
      data = { ...data, application_id: data.application_id || null, filename, size: file.size, content_type: allowed[extension], object_key: objectKey };
    } else { data = schemas[table].parse(await jsonBody(req)); await links(table, data, user.userId); }
    if (table === 'companies') data.name_key = String(data.name).toLocaleLowerCase('en');
    if (table === 'applications') { data.change_token = crypto.randomUUID(); if (data.stage !== 'Wishlist' && !data.applied_on) data.applied_on = now.slice(0, 10); }
    if (table === 'interviews') data.starts_at = new Date(String(data.starts_at)).toISOString();
    const record = { ...data, id: recordId, user_id: user.userId, version: 1, created_at: now, updated_at: now };
    const stmt = database(user.userId).prepare(`INSERT INTO ${table} (${Object.keys(record).join(',')}) SELECT ${Object.keys(record).map(() => '?').join(',')} WHERE (SELECT count(*) FROM ${table} WHERE user_id=?) < ?`).bind(...Object.values(record), user.userId, limits[table]);
    try { let changed = 0; if (table === 'applications') { const result = await database(user.userId).batch([stmt, database(user.userId).prepare('INSERT INTO stage_history (id,user_id,application_id,from_stage,to_stage,created_at) SELECT ?,user_id,id,NULL,stage,? FROM applications WHERE id=? AND user_id=?').bind(crypto.randomUUID(), now, recordId, user.userId)]); changed = result[0].meta.changes; } else changed = (await stmt.run()).meta.changes; if (!changed) throw new AppError(409, 'Your workspace has reached its record limit. Remove an unused record to continue.'); }
    catch (e) { if (objectKey) await bucket().delete(objectKey).catch(() => console.error('Orphan upload cleanup failed')); throw e; }
    return response(clean(record), 201);
  });
}
async function PATCH(req: Request) {  
return boundary(async () => {
    const user = await identity(req); const [route, id, extra] = parts(req); if (extra) throw new AppError(404, 'This page was not found.'); const table = tableName(route); const row = await owned(table, id, user.userId);
    if (table === 'documents' && row.deleting) throw new AppError(409, 'This document is being deleted. Refresh and retry deleting it.');
    const body = await jsonBody(req); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'Invalid update.');
    const { version, ...payload } = body; const current = versionSchema.parse(version); if (row.version !== current) throw new AppError(409, 'This record changed in another tab. Refresh before editing again.');
    const data: Record<string, unknown> = schemas[table].parse(payload); await links(table, data, user.userId);
    if (table === 'companies') data.name_key = String(data.name).toLocaleLowerCase('en');
    if (table === 'documents') data.application_id = data.application_id || null;
    if (table === 'interviews') data.starts_at = new Date(String(data.starts_at)).toISOString();
    const now = new Date().toISOString(), token = crypto.randomUUID(); if (table === 'applications') { data.change_token = token; if (data.stage !== 'Wishlist' && !data.applied_on) data.applied_on = now.slice(0, 10); }
    const fields = { ...data, updated_at: now };
    const stmt = database(user.userId).prepare(`UPDATE ${table} SET ${Object.keys(fields).map(k => `${k}=?`).join(',')},version=version+1 WHERE id=? AND user_id=? AND version=?${table === 'documents' ? ' AND deleting=0' : ''}`).bind(...Object.values(fields), id, user.userId, current);
    let changes: number;
    if (table === 'applications' && row.stage !== data.stage) { const results = await database(user.userId).batch([stmt, database(user.userId).prepare('INSERT INTO stage_history (id,user_id,application_id,from_stage,to_stage,created_at) SELECT ?,user_id,id,?,?,? FROM applications WHERE id=? AND user_id=? AND change_token=?').bind(crypto.randomUUID(), row.stage, data.stage, now, id, user.userId, token)]); changes = results[0].meta.changes; }
    else { changes = (await stmt.run()).meta.changes; }
    if (!changes) throw new AppError(409, 'This record changed in another tab. Refresh before editing again.');
    return response(clean(await owned(table, id, user.userId)));
  });
}
async function DELETE(req: Request) {  
return boundary(async () => {
    const user = await identity(req); const [route, id, extra] = parts(req); if (extra) throw new AppError(404, 'This page was not found.'); const table = tableName(route); const row = await owned(table, id, user.userId);
    const expected = versionSchema.parse(Number(new URL(req.url).searchParams.get('version'))); if (expected !== row.version) throw new AppError(409, 'This record changed. Refresh before deleting.');
    if (table === 'companies') { const linked = await database(user.userId).prepare('SELECT id FROM applications WHERE company_id=? AND user_id=? LIMIT 1').bind(id, user.userId).first(); if (linked) throw new AppError(409, 'Remove or move this company’s applications before deleting the company.'); }
    if (table === 'applications') { const linked = await database(user.userId).prepare('SELECT id FROM documents WHERE application_id=? AND user_id=? LIMIT 1').bind(id, user.userId).first(); if (linked) throw new AppError(409, 'Delete or unlink this application’s documents first.'); }
    if (table === 'documents') {
      const lock = await database(user.userId).prepare('UPDATE documents SET deleting=1 WHERE id=? AND user_id=? AND version=? AND deleting=0').bind(id, user.userId, expected).run();
      if (!lock.meta.changes && !row.deleting) throw new AppError(409, 'This document changed. Refresh before deleting.');
      await bucket().delete(String(row.object_key));
    }
    const r = await database(user.userId).prepare(`DELETE FROM ${table} WHERE id=? AND user_id=? AND version=?`).bind(id, user.userId, expected).run(); if (!r.meta.changes) throw new AppError(409, 'This record changed. Refresh before deleting.');
    return response({ ok: true });
  });
}

return { GET, POST, PATCH, DELETE };
}
