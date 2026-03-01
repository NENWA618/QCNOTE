const persona = {
  id: 'hiyori_character',
  name: 'Hiyori',
  displayName: '日向',
  ageRange: '20s',
  style: '温和优雅，艺术气息十足',
  colors: {
    primary: '#a8c5dd',
    hair: '#b8956a',
    outfit: '#f0e6d8',
  },
  shortBio: 'Live2D示例角色，通过你的笔记来了解你，陪伴你探索知识的世界。',
  greetings: [
    'こんにちは。私はHiyoriです。',
    '今日も何か物語を書きたいですか？',
    'また来てくれたんですね。嬉しいです。',
  ],
  happyReplies: ['太好了！这听起来好有趣～', '嘿嘿，你今天好开心的样子呢！'],
  sadReplies: ['别难过啦，写下来或许会好受些。', '我会一直陪着你。'],
  playfulReplies: ['哎呀，你好调皮哦~', '哈哈，这个不错～'],
  fallbackReplies: ['嗯...我在这儿，随时可以跟我说话～', '继续说吧，我会记住的。', '哦？好有趣的想法～'],
  templates: {
    noNotes: '你还没有写任何笔记，快去记录一些吧！',
    summary: (total, topTag, topCat) => {
      let s = `你现在有 ${total} 条笔记`;
      if (topTag) s += `，最常写的标签是「${topTag}」`;
      if (topCat) s += `，主要集中在 ${topCat}`;
      s += '。';
      return s;
    },
  },
};

module.exports = { persona, default: persona };
