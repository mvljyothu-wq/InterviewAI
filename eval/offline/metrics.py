import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
import json, random, numpy as np
from scipy.stats import spearmanr, binomtest
d=json.load(open('preds.json'))['rows']; m=[r for r in d if not r['variant']]
L=['correct','partially_correct','incorrect','off_topic']
def prf(y,p):
    o=[]
    for c in L:
        tp=sum(a==c and b==c for a,b in zip(y,p)); fp=sum(a!=c and b==c for a,b in zip(y,p)); fn=sum(a==c and b!=c for a,b in zip(y,p))
        pr=tp/(tp+fp) if tp+fp else 0; rc=tp/(tp+fn) if tp+fn else 0; o.append((pr,rc,2*pr*rc/(pr+rc) if pr+rc else 0))
    return o
mac=lambda y,p: float(np.mean([x[2] for x in prf(y,p)]))
ordm={'correct':3,'partially_correct':2,'incorrect':1,'off_topic':0}
SC={'b1':'b1_hit','b2':'b2_cos','b3':'b3_score','ours':'ours_score','nocal':'nocal_score','noconcept':'noconcept_score','fix':'fix_score','fb':'fb_score'}
qids=sorted(set(r['q'] for r in m)); res={}
for g,sc in SC.items():
    rng=random.Random(7); y=[r['gold'] for r in m]; p=[r[g] for r in m]
    A=[];F=[]
    for _ in range(2000):
        rr=[r for q in [rng.choice(qids) for _ in qids] for r in m if r['q']==q]
        A.append(np.mean([r[g]==r['gold'] for r in rr])); F.append(mac([r['gold'] for r in rr],[r[g] for r in rr]))
    v=[r for r in d if r['variant']]; pairs=[(r,next(o for o in m if o['q']==r['q'] and o['case']==r['case'])) for r in v]
    res[g]=dict(acc=float(np.mean([a==b for a,b in zip(y,p)])),acc_ci=np.percentile(A,[2.5,97.5]).tolist(),mf1=mac(y,p),mf1_ci=np.percentile(F,[2.5,97.5]).tolist(),
      rho=float(spearmanr([ordm[r['gold']] for r in m],[r[sc] for r in m]).correlation),
      per={c:list(x) for c,x in zip(L,prf(y,p))},
      case={k:float(np.mean([r[g]==r['gold'] for r in m if r['case']==k])) for k in 'ABCDEF'},
      cm=[[sum(r['gold']==a and r[g]==b for r in m) for b in L] for a in L],
      flips=sum(a[g]!=b[g] for a,b in pairs), shift=float(np.mean([abs(a[sc]-b[sc]) for a,b in pairs])),
      dev=float(np.mean([r[g]==r['gold'] for r in m if int(r['q'][1:])<=6])), test=float(np.mean([r[g]==r['gold'] for r in m if int(r['q'][1:])>6])))
for a,b in [('ours','b3'),('ours','b1'),('ours','b2'),('b3','b1'),('fix','ours'),('fb','ours'),('fb','b3')]:
    n01=sum(r[a]==r['gold'] and r[b]!=r['gold'] for r in m); n10=sum(r[a]!=r['gold'] and r[b]==r['gold'] for r in m)
    res[f'mc_{a}_{b}']=[n01,n10,binomtest(min(n01,n10),n01+n10,0.5).pvalue if n01+n10 else 1.0]
# similarity stats by case for ours
res['sim_by_case']={k:[float(np.mean([r['sim'] for r in m if r['case']==k])), float(np.mean([r['simfix'] for r in m if r['case']==k])), float(np.mean([r['b2_cos'] for r in m if r['case']==k]))] for k in 'ABCDEF'}
res['flags_D']=sum(r['flags']>0 for r in m if r['case']=='D'); res['flags_other']=sum(r['flags']>0 for r in m if r['case']!='D')
res['words']={k:float(np.mean([r['words'] for r in m if r['case']==k])) for k in 'ABCDEF'}
json.dump(res,open('metrics.json','w'),indent=1)
for g in SC: x=res[g]; print(g, round(x['acc'],3), np.round(x['acc_ci'],3), round(x['mf1'],3), np.round(x['mf1_ci'],3), 'rho',round(x['rho'],3),'flip',x['flips'],'shift',round(x['shift'],2),'dev',round(x['dev'],3),'test',round(x['test'],3))
for k in res:
    if k.startswith('mc') or k in('sim_by_case','flags_D','flags_other','words'): print(k,res[k])
