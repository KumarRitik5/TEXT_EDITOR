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
            'text/plain': [
              '.txt', '.md', '.mdx', '.json',
              '.js', '.mjs', '.cjs', '.jsx',
              '.ts', '.mts', '.cts', '.tsx',
              '.html', '.css',
              '.py', '.java',
              '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp',
              '.cs', '.go', '.rs', '.php',
              '.sh', '.bash', '.zsh',
              '.yml', '.yaml',
              '.xml', '.svg',
              '.sql',
            ],
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
  input.accept = '.txt,.md,.mdx,.json,.js,.mjs,.cjs,.jsx,.ts,.mts,.cts,.tsx,.html,.css,.py,.java,.c,.h,.cpp,.cc,.cxx,.hpp,.cs,.go,.rs,.php,.sh,.bash,.zsh,.yml,.yaml,.xml,.svg,.sql,text/plain';

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
          accept: {
            'text/plain': [
              '.txt', '.md', '.mdx', '.json',
              '.js', '.mjs', '.cjs', '.jsx',
              '.ts', '.mts', '.cts', '.tsx',
              '.html', '.css',
              '.py', '.java',
              '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp',
              '.cs', '.go', '.rs', '.php',
              '.sh', '.bash', '.zsh',
              '.yml', '.yaml',
              '.xml', '.svg',
              '.sql',
            ],
          },
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
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript';
  if (lower.endsWith('.jsx')) return 'javascript';
  if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')) return 'typescript';
  if (lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) return 'markdown';
  if (lower.endsWith('.html')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.java')) return 'java';
  if (lower.endsWith('.c') || lower.endsWith('.h')) return 'cpp';
  if (lower.endsWith('.cpp') || lower.endsWith('.cc') || lower.endsWith('.cxx') || lower.endsWith('.hpp')) return 'cpp';
  if (lower.endsWith('.cs')) return 'csharp';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.php')) return 'php';
  if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh')) return 'shell';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
  if (lower.endsWith('.xml') || lower.endsWith('.svg')) return 'xml';
  if (lower.endsWith('.sql')) return 'sql';
  return 'plaintext';
}
