'use client';
import Link from 'next/link';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <main className="fallback"><h1>Let’s try that again.</h1><p>The workspace could not load. Your saved records are still there.</p><button className="btn primary" onClick={reset}>Try again</button><Link href="/">Return to dashboard</Link></main>;}
