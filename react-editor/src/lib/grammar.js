function pushIssue(list, seen, issue) {
  const key = `${issue.start}:${issue.end}:${issue.message}`
  if (seen.has(key)) return
  seen.add(key)
  list.push(issue)
}

function addRegexIssues(text, list, seen, regex, message) {
  for (const match of text.matchAll(regex)) {
    const value = match[0] || ''
    if (!value) continue
    const start = match.index ?? -1
    if (start < 0) continue
    const end = start + value.length
    pushIssue(list, seen, { start, end, message })
  }
}

export function checkGrammarMistakes(text) {
  const input = String(text || '')
  const issues = []
  const seen = new Set()

  // Repeated words: "the the"
  addRegexIssues(
    input,
    issues,
    seen,
    /\b([A-Za-z]+)\s+\1\b/gi,
    'Repeated word'
  )

  // Common grammar/spelling mistakes in casual writing.
  const commonMistakes = [
    { regex: /\bdont\b/gi, message: "Use " + '"don\'t"' + ' instead of "dont"' },
    { regex: /\bcant\b/gi, message: "Use " + '"can\'t"' + ' instead of "cant"' },
    { regex: /\bwont\b/gi, message: "Use " + '"won\'t"' + ' instead of "wont"' },
    { regex: /\bim\b/gi, message: "Use " + '"I\'m"' + ' instead of "im"' },
    { regex: /\bive\b/gi, message: "Use " + '"I\'ve"' + ' instead of "ive"' },
    { regex: /\bcould of\b/gi, message: "Use " + '"could have"' + ' instead of "could of"' },
    { regex: /\bwould of\b/gi, message: "Use " + '"would have"' + ' instead of "would of"' },
    { regex: /\bshould of\b/gi, message: "Use " + '"should have"' + ' instead of "should of"' },
    { regex: /\balot\b/gi, message: "Use " + '"a lot"' + ' instead of "alot"' },
    { regex: /\bdefinately\b/gi, message: 'Did you mean "definitely"?' },
    { regex: /\brecieve\b/gi, message: 'Did you mean "receive"?' },
    { regex: /\bseperate\b/gi, message: 'Did you mean "separate"?' },
    { regex: /\bteh\b/gi, message: 'Did you mean "the"?' },
    { regex: /\bthier\b/gi, message: 'Did you mean "their"?' },
    { regex: /\btheir is\b/gi, message: 'Did you mean "there is"?' },
    { regex: /\byour welcome\b/gi, message: 'Did you mean "you\'re welcome"?' },
  ]

  for (const entry of commonMistakes) {
    addRegexIssues(input, issues, seen, entry.regex, entry.message)
  }

  // Simple article usage check: "a apple" -> "an apple"
  for (const match of input.matchAll(/\ba\s+([aeiouAEIOU][a-zA-Z]*)\b/g)) {
    const full = match[0] || ''
    const start = match.index ?? -1
    if (!full || start < 0) continue
    pushIssue(issues, seen, {
      start,
      end: start + full.length,
      message: `Use "an ${match[1]}" instead of "a ${match[1]}"`,
    })
  }

  // Sentence should usually start with a capital letter.
  for (const match of input.matchAll(/(^|[.!?]\s+)([a-z])/g)) {
    const sentenceStart = (match.index ?? -1) + (match[1]?.length || 0)
    if (sentenceStart < 0) continue
    pushIssue(issues, seen, {
      start: sentenceStart,
      end: sentenceStart + 1,
      message: 'Sentence should start with a capital letter',
    })
  }

  return issues
    .sort((a, b) => a.start - b.start)
    .slice(0, 200)
}
