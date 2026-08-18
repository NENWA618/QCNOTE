import React from 'react';

const Character: React.FC = () => {
  return (
    <div className="character-component text-center p-4 rounded-lg bg-white/80 dark:bg-dark-surface-light/80 shadow-lg border border-gray-200/50 dark:border-dark-border">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-dark-text">
        Live2D 看板娘 已加载
      </h3>
      <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
        请查看页面右下角的看板娘界面（由脚本 public/js/waifu.js 管理）。
      </p>
      <p className="text-sm text-gray-400 dark:text-dark-text-secondary/70">
        旧的聊天/养成/提醒模块已全部移除。
      </p>
    </div>
  );
};

export default Character;
