-- Private bucket: only the server secret can access files. No anon/authenticated policies.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('atlas-documents', 'atlas-documents', false, 4194304,
 ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain'])
ON CONFLICT (id) DO UPDATE SET public=false, file_size_limit=4194304, allowed_mime_types=excluded.allowed_mime_types;
