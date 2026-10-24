---
description: TypeScript 7 is the compiler, so ESLint parses TypeScript with Babel
---

# TypeScript and ESLint

- TypeScript 7 is the compiler. `typescript-eslint` does not support it yet, so ESLint parses TypeScript with `@babel/eslint-parser`. There are no type-aware lint rules.
- `npm run typecheck` is the type gate. Run it, and do not rely on lint to catch type errors.
- Lint cannot see unused imports and variables in TypeScript, so `noUnusedLocals` and `noUnusedParameters` are on in every tsconfig. Prefix a parameter that must stay with `_`.
- Do not downgrade TypeScript to make a lint tool start.
- At the start of each sprint that touches dependencies, check whether `typescript-eslint` now allows the TypeScript version in `package.json`. If it does, tell the user before changing anything.
- Do not add `typescript-eslint` while the peer range excludes TypeScript 7. When the user agrees to switch, replace the Babel parser with `typescript-eslint`, turn `@typescript-eslint/no-unused-vars` on, and keep `jsx-a11y` as errors.
- Declare `typescript` once, in the root `package.json`. A second copy in a workspace can leave two compilers in `node_modules`.
- Ask before adding any other dependency, and say why an existing one will not do.
