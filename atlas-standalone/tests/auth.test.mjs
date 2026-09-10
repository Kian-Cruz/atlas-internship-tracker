import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {authAction} from '../lib/auth/actions.ts';
import {completeAuth} from '../lib/auth/callbacks.ts';
import {safeReturnPath} from '../lib/auth/config.ts';
import {validatedIdentity} from '../lib/auth/identity.ts';
import {AppError} from '../lib/atlas/server.ts';
const origin='https://atlas.example';
const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'student@example.test',email_confirmed_at:'2026-09-09T00:00:00Z',role:'authenticated',aud:'authenticated',user_metadata:{full_name:'Student'},app_metadata:{provider:'email'},created_at:'2026-09-09T00:00:00Z'};
const token=()=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),aud:'authenticated',role:'authenticated',email:user.email})).toString('base64url'),'test-only-signature'].join('.');
const session=()=>({access_token:token(),refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user});
function provider(){
 const calls=[];let mode='ok';const jar=new Map();
 const fetcher=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url||String(input));
  const body=init.body?JSON.parse(init.body):{};
  calls.push({path:url.pathname,query:url.search,body,headers:init.headers});
  const fail=mode==='fail';
  if(fail)return Response.json({msg:'Invalid test credentials',code:'invalid_credentials'},{status:400});
  if(url.pathname.endsWith('/token'))return Response.json(session());
  if(url.pathname.endsWith('/signup'))return Response.json({...user,identities:[]});
  if(url.pathname.endsWith('/user'))return Response.json(mode==='unconfirmed'?{...user,email_confirmed_at:null}:user);
  if(url.pathname.endsWith('/verify'))return Response.json(session());
  return Response.json({});
 };
 const client=createServerClient('https://fixture.supabase.co','fixture-public-key',{global:{fetch:fetcher},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(v=>jar.set(v.name,v.value))}});
 return {client,calls,jar,setMode:v=>{mode=v;}};
}
function request(action,body,headers={}){return new Request(origin+'/api/auth/'+action,{method:'POST',headers:{origin,'x-atlas-request':'1','content-type':'application/json',...headers},body:JSON.stringify(body)});}
await test('Supabase authentication contracts and cookie sessions',async t=>{
 const p=provider();const attempts=[];let limited=false;
 const action=authAction({client:async()=>p.client,origin:()=>origin,consumeAttempt:async(a,email)=>{attempts.push({a,email});if(limited)throw new AppError(429,'Too many attempts');}});
 const run=async(a,b,status=200,h={})=>{const r=await action(request(a,b,h),a);const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));assert.match(r.headers.get('cache-control'),/no-store/);return data;};
 await t.test('Account writes reject cross-origin requests before calling Auth',async()=>{await run('login',{email:user.email,password:'example-long-password'},403,{origin:'https://evil.example'});assert.equal(p.calls.length,0);});
 await t.test('Signup validates email, strong passwords and unknown fields',async()=>{await run('signup',{email:'not-email',password:'short',name:''},422);await run('signup',{email:user.email,password:'example-long-password',name:'Student',role:'admin'},422);assert.equal(p.calls.length,0);});
 await t.test('Signup sends confirmation to the configured site and normalizes email',async()=>{const r=await run('signup',{email:' Student@Example.test ',password:'example-long-password',name:'Student'});assert.match(r.message,/Check your email/);const c=p.calls.find(c=>c.path.endsWith('/signup'));assert.equal(c.body.email,user.email);assert.equal(c.body.data.full_name,'Student');assert.ok(c.query.includes(encodeURIComponent(origin+'/auth/callback')));});
 await t.test('Login rejects incorrect credentials',async()=>{p.setMode('fail');await run('login',{email:user.email,password:'wrong-password'},401);p.setMode('ok');});
 await t.test('Login persists a cookie session and blocks open redirects',async()=>{const r=await run('login',{email:user.email,password:'example-long-password',next:'https://evil.example'});assert.equal(r.redirect,'/');assert.ok([...p.jar.keys()].some(k=>k.includes('auth-token')));});
 await t.test('User identity is revalidated with Auth and not read from headers',async()=>{const r=await validatedIdentity(p.client.auth);assert.equal(r.userId,user.id);assert.equal(r.fullName,'Student');assert.ok(p.calls.some(c=>c.path.endsWith('/user')));});
 await t.test('Unconfirmed and rejected sessions fail closed',async()=>{p.setMode('unconfirmed');assert.equal(await validatedIdentity(p.client.auth),null);p.setMode('fail');assert.equal(await validatedIdentity(p.client.auth),null);p.setMode('ok');});
 await t.test('Recovery sends a safe callback and gives a generic response',async()=>{const r=await run('forgot',{email:user.email});assert.match(r.message,/If this email has an account/);assert.ok(p.calls.some(c=>c.path.endsWith('/recover')&&c.query.includes(encodeURIComponent('/auth/callback?next=/reset-password'))));});
 await t.test('Confirmation and recovery tokens reach their proper destinations',async()=>{assert.equal(await completeAuth(new URL(origin+'/auth/confirm?type=signup&token_hash=test-token'),p.client.auth,'confirm'),'/');assert.equal(await completeAuth(new URL(origin+'/auth/confirm?type=recovery&token_hash=test-token'),p.client.auth,'confirm'),'/reset-password');});
 await t.test('Expired, missing and unsupported confirmation links fail closed',async()=>{assert.match(await completeAuth(new URL(origin+'/auth/confirm?type=invite&token_hash=x'),p.client.auth,'confirm'),/invalid-link/);p.setMode('fail');assert.match(await completeAuth(new URL(origin+'/auth/confirm?type=recovery&token_hash=x'),p.client.auth,'confirm'),/invalid-link/);p.setMode('ok');});
 await t.test('PKCE callback exchanges its code and restricts redirects',async()=>{assert.equal(await completeAuth(new URL(origin+'/auth/callback?code=test-code&next=//evil.example'),p.client.auth,'callback'),'/');await run('forgot',{email:user.email});assert.equal(await completeAuth(new URL(origin+'/auth/callback?code=test-code&next=/reset-password'),p.client.auth,'callback'),'/reset-password');});
 await t.test('Password reset rejects weak passwords and requires a verified session',async()=>{await run('reset',{password:'short'},422);p.setMode('fail');await run('reset',{password:'replacement-password-123'},401);p.setMode('ok');});
 await t.test('Password reset updates the account and signs out all sessions',async()=>{const r=await run('reset',{password:'replacement-password-123'});assert.equal(r.redirect,'/login?message=password-updated');assert.ok(p.calls.some(c=>c.path.endsWith('/user')&&c.body.password==='replacement-password-123'));assert.ok(p.calls.some(c=>c.path.endsWith('/logout')&&c.query.includes('scope=global')));});
 await t.test('Sign-out clears the active session cookie',async()=>{await run('login',{email:user.email,password:'example-long-password'});const r=await run('logout',{});assert.equal(r.redirect,'/login');assert.equal([...p.jar.values()].filter(Boolean).length,0);});
 await t.test('Account attempts are rate limited before hitting the provider',async()=>{limited=true;const before=p.calls.length;await run('login',{email:user.email,password:'example-long-password'},429);assert.equal(p.calls.length,before);assert.ok(attempts.length);});
 await t.test('Unknown account actions cannot resolve inherited properties',async()=>{await run('toString',{},404);await run('delete-everything',{},404);});
});

test('Return destinations reject external and authentication loops',()=>{for(const path of ['//evil.example','/\\evil.example','https://evil.example','/login','/auth/confirm','/api/workspace',undefined])assert.equal(safeReturnPath(path),'/');assert.equal(safeReturnPath('/applications?filter=active'),'/applications?filter=active');});

test('A new client with no session cannot authenticate',async()=>{const client=createClient('https://fixture.supabase.co','fixture-public-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>{throw new Error('Anonymous requests must not contact network');}}});assert.equal(await validatedIdentity(client.auth),null);});
