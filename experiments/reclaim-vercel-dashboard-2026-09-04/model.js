export const vendors=['Northstar Logistics','Atlas Software','Meridian Supplies','Fieldwork Studio','Juniper Cloud','Oak & Union','Beacon Telecom','Harbor Freight Co.','Evergreen Office','Cobalt Services','Pioneer Security','Summit Travel'];
const entries=[
 ['Northstar Logistics','Duplicate invoice paid twice',680000,'ready','Duplicate payment','NS-2048'],
 ['Atlas Software','Annual license billed twice',360000,'ready','Duplicate payment','AT-8812'],
 ['Meridian Supplies','Credit not applied to payment',54000,'ready','Unapplied credit','MS-1106'],
 ['Fieldwork Studio','Invoice total exceeds agreement',42000,'ready','Price mismatch','FW-0921'],
 ['Juniper Cloud','Service charge paid after cancellation',18400,'ready','Canceled service','JC-0407'],
 ['Oak & Union','Duplicate delivery surcharge',14000,'ready','Duplicate payment','OU-0208'],
 ['Beacon Telecom','Bank details changed before payment',420000,'review','Bank change','BT-3801'],
 ['Harbor Freight Co.','Second payment may cover separate delivery',218000,'review','Duplicate payment','HF-7134'],
 ['Evergreen Office','Invoice quantity differs from order',125000,'review','Price mismatch','EO-4190'],
 ['Cobalt Services','Payment has no matching invoice',89440,'review','Missing invoice','CS-2387'],
 ['Pioneer Security','Rate increase needs contract verification',64000,'review','Price mismatch','PS-1910'],
 ['Summit Travel','Possible overlapping reimbursement',40000,'review','Duplicate payment','ST-6103'],
 ['Meridian Supplies','Credit memo needs allocation',23000,'review','Unapplied credit','MS-1114'],
 ['Juniper Cloud','Unused seat renewal approaching',12000,'prevent','Unused subscription','JC-0412'],
 ['Atlas Software','Inactive add-on renews next month',5000,'prevent','Unused subscription','AT-8820'],
 ['Beacon Telecom','Retired phone line remains active',3000,'prevent','Unused subscription','BT-3821'],
];
export function seed(){const findings=entries.map((x,i)=>({id:`F-${String(101+i).padStart(4,'0')}`,vendor:x[0],title:x[1],cents:x[2],kind:x[3],type:x[4],invoice:x[5],state:'open',note:'',draft:'',history:[],recordIds:x[4]==='Duplicate payment'?[`PAY-${1001+i*2}`,`PAY-${1002+i*2}`]:[`PAY-${1001+i*2}`]}));const records=Array.from({length:80},(_,i)=>{const candidate=findings[Math.floor(i/2)],f=candidate?.recordIds.includes(`PAY-${1001+i}`)?candidate:null;const gross={'F-0103':254000,'F-0104':342000,'F-0109':625000,'F-0111':384000,'F-0113':123000};return {id:`PAY-${1001+i}`,vendor:candidate?.vendor||vendors[i%12],invoice:f?.invoice||`INV-${6200+i}`,cents:f?(gross[f.id]||f.cents):((i*791)%18000+10000),date:`2026-08-${String((i%28)+1).padStart(2,'0')}`,reference:`ACH-${700001+i}`,source:'August-payments.csv',finding:f?.id||null,description:f?'Payment linked to investigation':'Ledger payment',role:i%2?'Comparison':'Flagged'};});return {version:1,findings,records,preferences:{compact:false,motion:true},savedAt:null};}
export function supportingFacts(f){const facts={
 'F-0103':{source:'Credit-register.csv · CM-1106',rows:[['Gross invoice','$2,540'],['Available credit','$540'],['Net obligation','$2,000'],['Paid','$2,540'],['Proposed credit recovery','$540']]},
 'F-0104':{source:'Contract-register.csv · FW-2026',rows:[['Agreed service fee','$3,000'],['Paid invoice','$3,420'],['Unagreed excess','$420']]},
 'F-0105':{source:'Service-register.csv · JC-CANCEL-07',rows:[['Cancellation effective','Jul 31, 2026'],['Service billed','August 2026'],['Expected charge','$0'],['Paid after cancellation','$184']]},
 'F-0107':{source:'Vendor-change-log.csv · BT-07',rows:[['Previous bank suffix','•••• 1842'],['Updated bank suffix','•••• 7709'],['Change recorded','Aug 12, 2026'],['Payment date','Aug 13, 2026'],['Independent confirmation','Not supplied'],['Payment requiring verification','$4,200']]},
 'F-0109':{source:'Order-register.csv · PO-4190',rows:[['Ordered quantity','100 units × $50'],['Billed quantity','125 units × $50'],['Expected total','$5,000'],['Paid total','$6,250'],['Difference to verify','$1,250']]},
 'F-0110':{source:'Invoice-register.csv · unmatched payment',rows:[['Payment reference','ACH-700019'],['Matched invoice','Not found in provided source'],['Payment requiring verification','$894.40'],['Next evidence needed','Original invoice and approver']]},
 'F-0111':{source:'Rate-register.csv · PS-2026',rows:[['Prior contract rate','$3,200'],['Paid total','$3,840'],['Difference to verify','$640'],['Signed rate amendment','Not supplied']]},
 'F-0113':{source:'Credit-register.csv · CM-1114',rows:[['Gross invoice','$1,230'],['Credit memo','$230'],['Allocation status','Unverified'],['Proposed net obligation','$1,000']]},
};return facts[f.id]||{source:`Service-register.csv · ${f.invoice}`,rows:[['Service status','Marked inactive'],['Next renewal','Sep 2026'],['Next-period charge',money(f.cents)],['Owner confirmation','Required before cancellation']]};}
export const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:c%100?2:0}).format(c/100);
export function totals(data){let t={ready:0,review:0,prevent:0,claims:0,recovered:0,dismissed:0};for(const f of data.findings){const key=f.state==='dismissed'?'dismissed':f.state==='recovered'?'recovered':['draft','submitted'].includes(f.state)?'claims':f.kind;t[key]+=f.cents;}return t;}
export function transition(data,id,action,note=''){const next=structuredClone(data);const f=next.findings.find(x=>x.id===id);if(!f)throw Error('Finding not found');if(action==='confirm'){if(f.state!=='open'||f.kind!=='review')throw Error('Only unverified open findings can be confirmed');if(!note.trim())throw Error('Add your verification note first');f.kind='ready';}
 else if(action==='draft'){if(f.kind!=='ready'||f.state!=='open')throw Error('Confirm evidence before preparing recovery');f.state='draft';f.draft=`Subject: Payment review — ${f.invoice}\n\nHello ${f.vendor},\n\nOur review identified ${f.title.toLowerCase()} for invoice ${f.invoice}. We are requesting a review of ${money(f.cents)}.\n\nPayment records: ${f.recordIds.join(', ')}. Please verify these references and advise on a credit or refund.\n\nThank you,\nAccounts Payable`;}
 else if(action==='submitted'){if(f.state!=='draft')throw Error('Prepare a draft first');f.state='submitted';}
 else if(action==='recovered'){if(f.state!=='submitted')throw Error('Only submitted claims can be resolved');f.state='recovered';}
 else if(action==='dismissed'){if(f.state!=='open')throw Error('Only open findings can be dismissed');if(!note.trim())throw Error('A dismissal reason is required');f.state='dismissed';}
 else if(action==='reopen'){if(f.state!=='dismissed')throw Error('Finding is not dismissed');f.state='open';}
 else throw Error('Invalid transition');f.history.push({action,note,at:new Date().toISOString()});next.savedAt=new Date().toISOString();return next;}
export function filterFindings(data,{q='',kind='',type='',state='',sort='amount'}={}){return data.findings.filter(f=>(!q||`${f.id} ${f.title} ${f.vendor} ${f.invoice}`.toLowerCase().includes(q.toLowerCase()))&&(!kind||(f.kind===kind&&f.state==='open'))&&(!type||f.type===type)&&(!state||f.state===state)).sort((a,b)=>sort==='vendor'?a.vendor.localeCompare(b.vendor):b.cents-a.cents);}
