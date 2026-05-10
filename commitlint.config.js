// Conventional Commits — viz CLAUDE.md
// Akceptované typy: feat, fix, chore, refactor, test, docs, style, perf, build, ci

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],
    'body-max-line-length': [1, 'always', 120],
    'footer-max-line-length': [1, 'always', 120],
  },
};
