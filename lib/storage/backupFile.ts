/** Offers `data` to the user as a downloaded JSON file. */
export function downloadJSON(data: unknown, filename: string): void {
  const dataBlob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Reads `file` as text; rejects with a user-facing message. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => resolve(e.target?.result as string);
    reader.onerror = () => reject('读取文件失败');
    reader.readAsText(file);
  });
}
