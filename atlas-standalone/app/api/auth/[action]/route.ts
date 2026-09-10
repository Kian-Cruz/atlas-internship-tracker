import { authAction } from '@/lib/auth/actions';
import { authClient } from '@/lib/auth/server';
import { appOrigin } from '@/lib/auth/config';
import { consumeAttempt } from '@/lib/auth/rate-limit';
export const runtime = 'nodejs';
const actionHandler = authAction({ client: authClient, origin: appOrigin, consumeAttempt });
export async function POST(request: Request, {params}: {params: Promise<{action:string}>}) {
  return actionHandler(request, (await params).action);
}

