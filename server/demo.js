/**
 * Demo script to show server-side note indexing and retrieval
 * Run: node server/demo.js
 */

// Inline vector utilities (since we're running Node, can't load TS directly)
function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

function computeVector(text) {
  const tokens = tokenize(text);
  const vec = {};
  tokens.forEach((t) => {
    vec[t] = (vec[t] || 0) + 1;
  });
  // normalize by length
  const len = Math.sqrt(Object.values(vec).reduce((sum, v) => sum + v * v, 0));
  if (len > 0) {
    Object.keys(vec).forEach((k) => {
      vec[k] = vec[k] / len;
    });
  }
  return vec;
}

function cosine(a, b) {
  let sum = 0;
  for (const k in a) {
    if (b[k]) sum += a[k] * b[k];
  }
  return sum;
}

// Simulate some notes
const sampleNotes = [
  {
    id: '1',
    title: '今天的学习计划',
    content: '学习了 TypeScript 的泛型，理解了如何编写可复用的类型安全代码。很有收获！',
    category: '学习',
    tags: ['typescript', '编程'],
  },
  {
    id: '2',
    title: '周末旅游记录',
    content: '去了河边散步，看到了很美的日落。天气很好，心情也很舒适。',
    category: '生活',
    tags: ['旅游', '自然'],
  },
  {
    id: '3',
    title: '项目复盘',
    content: '这个项目虽然遇到了一些困难，但最终成功上线了。很为团队骄傲！',
    category: '工作',
    tags: ['项目', 'react'],
  },
];

console.log('\n=== 笔记服务器端处理演示 ===\n');

// Build vectors for each note
console.log('1️⃣ 为每条笔记建立向量表示：');
const vectors = {};
sampleNotes.forEach((note) => {
  const text = `${note.title} ${note.content}`;
  vectors[note.id] = computeVector(text);
  console.log(`   ${note.title} -> 向量维度 ${Object.keys(vectors[note.id]).length}`);
});

// Simulate sentiment (simplified)
console.log('\n2️⃣ 分析每条笔记的情感：');
const sentiments = {};
sampleNotes.forEach((note) => {
  // Simple sentiment: count positive/negative words
  const positive = (note.content.match(/很好|开心|骄傲|收获|有趣|美/g) || []).length;
  const negative = (note.content.match(/困难|悲伤|难过/g) || []).length;
  const score = positive - negative;
  sentiments[note.id] = { score, comparative: score / note.content.split(/\s+/).length };
  const mood = score > 0 ? '😊 积极' : score < 0 ? '😢 消极' : '😐 中性';
  console.log(`   ${note.title} -> 情感分数: ${score} ${mood}`);
});

// Simulate vector search
console.log('\n3️⃣ 用户搜索 "心情很好"：');
const query = '心情很好';
const qvec = computeVector(query);
const scores = sampleNotes.map((note) => ({
  id: note.id,
  title: note.title,
  score: cosine(qvec, vectors[note.id]),
}));
scores.sort((a, b) => b.score - a.score);
scores.slice(0, 2).forEach((s, idx) => {
  const note = sampleNotes.find((n) => n.id === s.id);
  console.log(`   ${idx + 1}. ${note.title} (相似度: ${(s.score * 100).toFixed(2)}%)`);
  console.log(`      → "${note.content.slice(0, 50)}..."`);
});

console.log('\n4️⃣ 搜索 "TypeScript 编程"：');
const query2 = 'TypeScript 编程';
const qvec2 = computeVector(query2);
const scores2 = sampleNotes.map((note) => ({
  id: note.id,
  title: note.title,
  score: cosine(qvec2, vectors[note.id]),
}));
scores2.sort((a, b) => b.score - a.score);
const topResult = scores2[0];
const topNote = sampleNotes.find((n) => n.id === topResult.id);
console.log(`   最相关笔记: ${topNote.title} (相似度: ${(topResult.score * 100).toFixed(2)}%)`);
console.log(`   → "${topNote.content}"`);

console.log('\n5️⃣ 后端 /reply 端点的增强回复示例：');
const reply = `你这个话题让我想起了你之前的笔记：\n"${topNote.content}"\n看起来你对这方面很感兴趣呢！`;
console.log(`   你: ${query2}`);
console.log(`   诺特: ${reply}`);

console.log('\n✅ 演示完成！服务器功能包括：');
console.log('   • lunr 关键字索引');
console.log('   • 向量语义搜索');
console.log('   • 情感分析');
console.log('   • 笔记持久化');
console.log('   • 实时索引重建\n');
