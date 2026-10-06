// Browser: copy to the clipboard, or download as a .txt file. Nothing is uploaded.
export const TEXT_EXPORT = { share: 'Copy', canSaveFile: true } as const;

export async function shareText(text: string): Promise<string> {
  try {
    await navigator.clipboard.writeText(text);
    return 'Copied to the clipboard';
  } catch {
    // Clipboard needs a secure context (https or localhost) and focus. Fall back to selection.
    return 'Copy blocked by the browser: select the text and press Ctrl/Cmd+C, or use Save .txt';
  }
}

export async function saveTextFile(filename: string, text: string): Promise<string> {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return `Saved ${filename}`;
}
