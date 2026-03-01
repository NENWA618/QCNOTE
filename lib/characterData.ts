export const persona = {
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
  happyReplies: [
    'それはいいですね！楽しそうですね。',
    'あなたの喜びが私にも伝わってきます。',
  ],
  sadReplies: [
    'そうですか。でも大丈夫、ここにいますよ。',
    '一緒に頑張りましょう。',
  ],
  playfulReplies: [
    'ふふふ、面白いですね。',
    'そのような考えもいいですね。',
  ],
  fallbackReplies: [
    'えっと...何かお話しましょうか？',
    'どうぞ、聞きますよ。',
    'それは興味深いです。',
  ],
  templates: {
    noNotes: 'まだメモがありませんね。これから一緒に記録していきましょう。',
    summary: (total: number, topTag?: string, topCat?: string) => {
      let s = `あなたは ${total} 個のメモを持っています`;
      if (topTag) s += `。最も使うタグは「${topTag}」ですね`;
      if (topCat) s += `。主に ${topCat} に関することが多いようです`;
      s += '。';
      return s;
    },
  },
};

export default persona;
