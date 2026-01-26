// Registers Monaco language contributions so opened files tokenize correctly.
// These imports have side effects (they register languages, tokenizers, and some language services).

// Core web languages (syntax highlighting + language features)
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution' // javascript + typescript
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import 'monaco-editor/esm/vs/language/css/monaco.contribution'
import 'monaco-editor/esm/vs/language/html/monaco.contribution'

// Extra tokenizers for the language picker
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution'
