function supportsFileSystemAccessAPI() {
  return typeof window !== 'undefined' &&
    'showOpenFilePicker' in window &&
    'showSaveFilePicker' in window;
}

export async function openTextFile() {
  if (supportsFileSystemAccessAPI()) {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: 'Text files',
          accept: {
            'text/plain': ['.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.py'],
          },
        },
      ],
    });

    const file = await handle.getFile();
    const text = await file.text();
    return {
      name: file.name,
      text,
      handle,
    };
  }

  // Fallback: hidden input element
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.md,.json,.js,.ts,.jsx,.tsx,.html,.css,.py,text/plain';

  const file = await new Promise((resolve, reject) => {
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => reject(new Error('cancelled')), { once: true });
    input.click();
  });

  if (!file) throw new Error('No file selected');
  const text = await file.text();
  return { name: file.name, text, handle: null };
}

export async function saveTextFile({ suggestedName, text, existingHandle }) {
  if (supportsFileSystemAccessAPI()) {
    const handle = existingHandle ?? await window.showSaveFilePicker({
      suggestedName: suggestedName || 'document.txt',
      types: [
        {
          description: 'Text files',
          accept: { 'text/plain': ['.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.py'] },
        },
      ],
    });

    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();

    return { handle };
  }

  // Fallback: download
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName || 'document.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);

  return { handle: null };
}

export function guessLanguageFromFilename(name) {
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.js')) return 'javascript';
  if (lower.endsWith('.jsx')) return 'javascript';
  if (lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.html')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.py')) return 'python';
  return 'plaintext';
}
