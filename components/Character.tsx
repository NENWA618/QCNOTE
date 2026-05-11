import React from 'react';

const Character: React.FC = () => {
  return (
    <div className="character-component text-center p-4 rounded-lg bg-white/80 shadow-lg">
      <h3 className="text-lg font-semibold">Live2D 看板娘 已加载</h3>
      <p className="text-sm text-gray-500">请查看页面右下角的看板娘界面（由脚本 public/js/waifu.js 管理）。</p>
      <p className="text-sm text-gray-400">旧的聊天/养成/提醒模块已全部移除。</p>
    </div>
  );
};

export default Character;
