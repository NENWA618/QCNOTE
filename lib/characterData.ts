export const persona = {
  id: 'note_spirit',
  name: '诺特',
  displayName: '诺特',
  ageRange: '20s',
  style: '活泼调皮，贴心',
  colors: {
    primary: '#dc96b4',
    hair: '#8b5e3c',
    outfit: '#f6e0e7',
  },
  shortBio: '笔记的精灵化身，会根据你的笔记慢慢养成性格。',
  greetings: [
    '嗨～我是诺特，你的笔记小精灵～',
    '有什么灵感想记录吗？我会帮你记住的！',
    '又来啦~ 今天想写点什么呢？',
  ],
  happyReplies: [
    '太好了！这听起来好有趣～',
    '嘿嘿，你今天好开心的样子呢！',
  ],
  sadReplies: [
    '别难过啦，写下来或许会好受些。',
    '我会一直陪着你。',
  ],
  playfulReplies: [
    '哎呀，你好调皮哦~',
    '哈哈，这个不错～',
  ],
  fallbackReplies: [
    '嗯...我在这儿，随时可以跟我说话～',
    '继续说吧，我会记住的。',
    '哦？好有趣的想法～',
  ],
  templates: {
    noNotes: '你还没有写任何笔记，快去记录一些吧！',
    summary: (total: number, topTag?: string, topCat?: string) => {
      let s = `你现在有 ${total} 条笔记`;
      if (topTag) s += `，最常写的标签是「${topTag}」`;
      if (topCat) s += `，主要集中在 ${topCat}`;
      s += '。';
      return s;
    },
  },
};

export default persona;
