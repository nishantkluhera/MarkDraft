# Contributing to MarkDraft

Thanks for wanting to contribute! This project is pretty straightforward, so contributing should be too.

## How to contribute

1. Fork the repo
2. Make your changes
3. Test them
4. Submit a pull request

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/MarkDraft.git
cd MarkDraft
npm install
npm run dev
```

## Code style

We use ESLint and Prettier to keep things consistent:

```bash
npm run lint
npm run lint:fix
npm run format
```

## Tests

Please add tests for new features and make sure existing tests still pass:

```bash
npm test
```

If you're fixing a bug, add a test that would have caught it.

## What to contribute

- Bug fixes
- New features (but keep it simple)
- Documentation improvements
- Performance improvements
- UI/UX enhancements

## Pull requests

Just make sure your PR:
- Has a clear description of what it does
- Includes tests if needed
- Doesn't break existing functionality
- Follows the existing code style

## Issues

Found a bug? Want to request a feature? Just open an issue and describe:
- What happened (for bugs)
- What you expected to happen
- How to reproduce it
- What you'd like to see (for features)

## Development tips

- The app is pretty simple - most logic is in `server.js`
- Frontend is vanilla JS/CSS (no frameworks)
- Tests are in the `tests/` directory
- Use `npm run dev` for hot reloading during development

## Security

Don't commit any secrets or sensitive data. If you find a security issue, please email me directly instead of opening a public issue.

That's it! Thanks for contributing. 