import Link from 'next/link';
export default function NotFound(){return <main className="fallback"><h1>That page isn’t here.</h1><p>Return to your workspace to continue.</p><Link className="btn primary" href="/">Back to dashboard</Link></main>;}
