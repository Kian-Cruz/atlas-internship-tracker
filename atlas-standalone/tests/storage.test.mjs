import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createStorage} from '../lib/platform/storage.ts';
await test('Private Supabase Storage adapter contracts',async t=>{
 const calls=[];let mode='ok';const bytes=new TextEncoder().encode('%PDF-1.4 test');
 const client=createClient('https://fixture.supabase.co','test-server-only-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init={})=>{
  const url=new URL(String(input));calls.push({url,method:init.method||'GET',headers:new Headers(init.headers),body:init.body});
  if(mode==='missing')return Response.json({statusCode:'404',error:'not_found',message:'Object not found'},{status:404});
  if(mode==='offline')return Response.json({statusCode:'503',error:'offline',message:'Unavailable'},{status:503});
  if((init.method||'GET')==='GET')return new Response(bytes,{headers:{'content-type':'application/pdf'}});
  if(init.method==='DELETE')return Response.json([]);
  return Response.json({Key:'atlas-documents/student/resume',Id:'fixture'});
 }}});
 const storage=createStorage(client);
 await t.test('Uploads target only the private bucket without overwrites',async()=>{await storage.put('student/resume',bytes,'application/pdf');const call=calls.at(-1);assert.equal(call.url.pathname,'/storage/v1/object/atlas-documents/student/resume');assert.equal(call.method,'POST');assert.equal(call.headers.get('x-upsert'),'false');assert.ok(call.headers.get('authorization'));});
 await t.test('Downloads use authenticated storage and preserve bytes',async()=>{const file=await storage.get('student/resume');assert.equal(file.size,bytes.length);assert.deepEqual(file.body,bytes);assert.equal(calls.at(-1).url.pathname,'/storage/v1/object/atlas-documents/student/resume');assert.ok(calls.at(-1).headers.get('authorization'));assert.ok(!calls.at(-1).url.pathname.includes('/public/'));});
 await t.test('Missing objects return null',async()=>{mode='missing';assert.equal(await storage.get('student/missing'),null);});
 await t.test('Provider outages propagate for retry without reporting success',async()=>{mode='offline';await assert.rejects(storage.get('student/resume'),/download failed/);await assert.rejects(storage.put('student/resume',bytes,'application/pdf'),/upload failed/);await assert.rejects(storage.delete('student/resume'),/retry to finish/);});
 await t.test('Deletion targets the exact private object',async()=>{mode='ok';await storage.delete('student/resume');const call=calls.at(-1);assert.equal(call.method,'DELETE');assert.deepEqual(JSON.parse(call.body),{prefixes:['student/resume']});});
});
