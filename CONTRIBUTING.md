# Contributing to OpenVera

Thank you for your interest in contributing to OpenVera!

## How to Contribute

1. **Fork** the repository
2. **Create a branch** for your feature or fix: `git checkout -b feature/my-feature`
3. **Make your changes** and commit with clear messages
4. **Push** to your fork: `git push origin feature/my-feature`
5. **Open a Pull Request** against `main`

## Development Setup

```bash
git clone https://github.com/openvera/openvera.git
cd openvera
./setup.sh
```

The frontend lives in `frontend/` and uses React + TypeScript + Tailwind CSS.

```bash
cd frontend
npm install
npm run dev
```

## Guidelines

- Keep pull requests focused on a single change
- Follow existing code style and conventions
- Add tests for new functionality where applicable
- Update documentation if your change affects the user-facing behavior

## Reporting Issues

Use [GitHub Issues](https://github.com/openvera/openvera/issues) to report bugs or suggest features. Please include:

- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Environment details (OS, Docker version, browser)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
