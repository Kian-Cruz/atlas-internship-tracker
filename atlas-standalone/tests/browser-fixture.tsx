'use client';
// Isolated UI fixture. Temporarily mounted by the test-only route; never published.
import {useState} from 'react';
import Editor,{type EditorSpec,type Kind} from '@/components/atlas/editor';
import {sampleWorkspace} from '@/lib/atlas/sample';
export default function BrowserFixture(){
 const[spec,setSpec]=useState<EditorSpec|null>(null);const[result,setResult]=useState('');const[fail,setFail]=useState(false);const data=sampleWorkspace();
 return <main style={{padding:24,maxWidth:900,margin:'auto'}}><h1>Atlas isolated form tests</h1><p>Fictional data. Nothing is saved to a student account.</p><div className="inline-actions">{(['companies','applications','interviews','notes','documents'] as Kind[]).map(kind=><button className="btn secondary" key={kind} onClick={()=>setSpec({kind})}>{kind} form</button>)}<button className="btn secondary" onClick={()=>setFail(!fail)}>{fail?'Restore saves':'Simulate save error'}</button></div><output aria-label="Test result" style={{whiteSpace:'pre-wrap',display:'block',marginTop:30}}>{result}</output>{spec&&<Editor spec={spec} data={data} onClose={()=>setSpec(null)} onSave={async(kind,payload)=>{if(fail)throw new Error('Test service unavailable. Please try again.');setResult(kind+' saved: '+JSON.stringify(payload));}}/>}</main>;
}
