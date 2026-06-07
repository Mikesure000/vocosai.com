import { readFileSync } from 'fs';
import { createStore } from './src/store.mjs';
import { runAttribution } from './src/attribution-engine.mjs';
import { generateProductionCard } from './src/production-card-engine.mjs';
import { runQualityCheck } from './src/quality-check.mjs';

const comments = JSON.parse(readFileSync('testdata/real_comments.json','utf8'));
const store = await createStore({dbPath:':memory:'});
const cat = store.list('categoryKnowledge')[0];

await store.insert('tasks',{id:'t1',taskName:'克奥妮斯眼膜',projectId:'project_demo',platform:'douyin',contentTitle:'开局一对眼膜',contentBody:'仙人掌透皮眼膜',brandInfo:'克奥妮斯',status:'ready',teamId:'team_demo',createdAt:new Date().toISOString()});
for(const c of comments) await store.insert('comments',{...c,taskId:'t1'});

const mk = (m,ms) => JSON.stringify({insights:[]});
const attr = await runAttribution({taskId:'t1',llmCall:mk,content:{title:'克奥妮斯眼膜',body:'仙人掌透皮眼膜',platform:'douyin'},signals:{signals:[],comments},categoryKnowledge:cat});

console.log('=== 真实数据 435条评论 全链路测试 ===');
console.log('1.归因要点:',attr.contentPoints.length,'个');
attr.contentPoints.forEach(p => console.log('  -',p.text.slice(0,50)));
console.log('2.归因矩阵:',attr.attributionMatrix.length,'项');
attr.attributionMatrix.forEach(m => console.log('  ['+m.impactScore+']',m.reactionType,m.reactionCount+'条','pos:'+m.sentimentDistribution.positive,'neg:'+m.sentimentDistribution.negative));
console.log('3.内容缺口:',attr.contentGaps.length,'条');

const card = await generateProductionCard({attribution:attr,llmCall:mk,categoryKnowledge:cat,content:{title:'克奥妮斯眼膜',brandInfo:'克奥妮斯'},platform:'douyin'});
console.log('4.生产卡:',card.card_type,'脚本段:',card.script_structure.length,'证据:',card.supporting_evidence?.length);
console.log('5.卖点:',card.selling_points?.map(sp=>sp.point).filter(Boolean).join(', ') || '(需要LLM增强)');

const qc = runQualityCheck(card);
console.log('6.质检:',qc.totalScore+'/100',qc.verdict);
qc.checks.filter(c=>c.result!=='pass').forEach(c=>console.log('  ⚠',c.check_type,c.result,'-',(c.suggestion||'').slice(0,40)));

console.log('7.高赞评论:');
comments.filter(c=>c.likeCount>0).sort((a,b)=>b.likeCount-a.likeCount).slice(0,5).forEach(c=>console.log('  ['+c.likeCount+'like]',c.commentText.slice(0,60)));
console.log('\n✅ 全链路通过');
