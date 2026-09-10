import { getUser } from '@/lib/auth/server';
import Workspace from '@/components/atlas/workspace';
export const dynamic = 'force-dynamic';
export default async function Home() {
 const user = await getUser();
 return <Workspace user={user ? {name:user.fullName || user.email.split('@')[0],email:user.email} : null} signInPath="/login" signOutPath="/api/auth/logout" initialView="dashboard" />;
}
