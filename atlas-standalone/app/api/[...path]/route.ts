import { createHandlers } from '@/lib/atlas/handlers';
import { getDatabase } from '@/lib/platform/postgres';
import { getUser, documentStorage } from '@/lib/auth/server';
import { appOrigin } from '@/lib/auth/config';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const handlers = createHandlers({database: getDatabase, authenticate: getUser, storage: documentStorage, origin: appOrigin});
export const { GET, POST, PATCH, DELETE } = handlers;
