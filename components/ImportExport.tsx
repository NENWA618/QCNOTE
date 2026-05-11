import React, { useRef } from 'react';

interface ImportExportProps {
  onExport: () => void;
  onImport: (file: File) => void;
  onClearAll: () => void;
}

const ImportExport: React.FC<ImportExportProps> = ({
  onExport,
  onImport,
  onClearAll
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImport(file);
      // Reset input
      event.target.value = '';
    }
  };

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <button
        onClick={onExport}
        className="btn-secondary flex items-center gap-2"
        title="导出所有笔记为JSON文件"
      >
        📤 导出数据
      </button>

      <button
        onClick={handleImportClick}
        className="btn-secondary flex items-center gap-2"
        title="从JSON文件导入笔记"
      >
        📥 导入数据
      </button>

      <button
        onClick={onClearAll}
        className="btn-danger flex items-center gap-2"
        title="删除所有笔记（不可恢复）"
      >
        🗑️ 清空所有
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};

export default ImportExport;