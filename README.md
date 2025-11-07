# Agustin Gonzalez Nicolini — Leadership & Engineering Coaching

A modern, conversion-focused single-page portfolio for engineering leadership coaching.

**Live Site**: https://agusgonzaleznic.github.io

## Features

- 🎨 **Premium Design System**: Minimal grayscale palette with electric coral accent
- ⚡ **Performance Optimized**: Vite-powered builds with optimized assets
- 🔍 **SEO-Ready**: Complete meta tags, JSON-LD schema, sitemap, and robots.txt
- 📱 **Fully Responsive**: Mobile-first design with adaptive layouts
- ♿ **Accessible**: WCAG 2.1 AA compliant with semantic HTML and Radix UI primitives
- 🎭 **Smooth Animations**: Tasteful transitions with reduced-motion support
- 🔒 **Type-Safe**: Built with TypeScript for reliability
- ✅ **Quality Assured**: ESLint with pre-commit hooks via Husky
- 🚀 **CI/CD Ready**: Automated deployments with GitHub Actions

## Tech Stack

### Core
- **[Vite](https://vitejs.dev/)** 5.4.19 - Build tool and dev server
- **[React](https://react.dev/)** 18.3.1 - UI library
- **[TypeScript](https://www.typescriptlang.org/)** 5.8.3 - Type safety
- **[React Router](https://reactrouter.com/)** 6.30.1 - Client-side routing

### Styling & UI
- **[Tailwind CSS](https://tailwindcss.com/)** 3.4.17 - Utility-first CSS framework
- **[shadcn/ui](https://ui.shadcn.com/)** - High-quality React components
- **[Radix UI](https://www.radix-ui.com/)** - Accessible component primitives
- **[Lucide React](https://lucide.dev/)** - Icon library

### Forms & Validation
- **[React Hook Form](https://react-hook-form.com/)** 7.61.1 - Form state management
- **[Zod](https://zod.dev/)** 3.25.76 - Schema validation

### Development Tools
- **[ESLint](https://eslint.org/)** 9.32.0 - Code linting
- **[Husky](https://typicode.github.io/husky/)** 9.1.7 - Git hooks
- **[lint-staged](https://github.com/lint-staged/lint-staged)** 16.2.6 - Pre-commit linting
- **[SWC](https://swc.rs/)** - Fast TypeScript/JavaScript compiler

## Getting Started

### Prerequisites

- **Node.js** 20.x or higher
- **npm** (comes with Node.js)

Install Node.js via [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) (recommended):
```bash
nvm install 20
nvm use 20
```

### Installation

```bash
# Clone the repository
git clone git@github.com:agusgonzaleznic/agusgonzaleznic.github.io.git

# Navigate to project directory
cd agusgonzaleznic.github.io

# Install dependencies
npm install

# Start development server
npm run dev
```

The site will be available at `http://localhost:8080`

### Available Scripts

```bash
npm run dev          # Start development server (port 8080)
npm run build        # Build for production
npm run build:dev    # Build in development mode
npm run preview      # Preview production build locally
npm run lint         # Run ESLint
```

### Pre-commit Hooks

This project uses [Husky](https://typicode.github.io/husky/) to automatically run linting on staged files before each commit:

- **Auto-configured**: Hooks are set up automatically when you run `npm install`
- **What runs**: ESLint on all staged `.ts`, `.tsx`, `.js`, `.jsx` files
- **Auto-fix**: Fixable issues are automatically corrected
- **Blocks commits**: Commits are blocked if there are unfixable linting errors

To bypass hooks (not recommended):
```bash
git commit --no-verify
```

## Deployment

### Automatic Deployment (GitHub Actions)

This project uses **reusable GitHub Actions workflows** for automated CI/CD:

- **Deploy Workflow** (`.github/workflows/deploy.yml`)
  - Triggers on push to `main` branch
  - Runs linting and build
  - Deploys to GitHub Pages automatically
  - Uses reusable workflow from [`agusgonzaleznic/github-reusable-workflows`](https://github.com/agusgonzaleznic/github-reusable-workflows)

- **CI Workflow** (`.github/workflows/ci.yml`)
  - Runs on pull requests to `main`
  - Validates code quality with ESLint
  - Ensures build succeeds

### GitHub Pages Setup

1. Go to **Repository → Settings → Pages**
2. Under "Source", select **GitHub Actions**
3. Push to `main` branch to trigger deployment
4. Site will be live at: `https://agusgonzaleznic.github.io`

### Manual Deployment

Build and deploy to any static hosting service:

```bash
# Build for production
npm run build

# The dist/ directory contains the production build
# Upload dist/ to your hosting provider
```

### Custom Domain

To use a custom domain:

1. Add a `CNAME` file to `public/` with your domain:
   ```bash
   echo "yourdomain.com" > public/CNAME
   ```

2. Configure DNS:
   - For apex domain (`example.com`):
     - Add A records pointing to GitHub Pages IPs
   - For subdomain (`www.example.com`):
     - Add CNAME record pointing to `agusgonzaleznic.github.io`

3. See: [GitHub Pages Custom Domain Documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)

## Project Structure

```
.
├── .github/
│   └── workflows/          # GitHub Actions CI/CD
├── .husky/                 # Git hooks
├── public/                 # Static assets
│   ├── .nojekyll          # Disable Jekyll processing
│   ├── favicon.ico
│   ├── robots.txt
│   └── sitemap.xml
├── src/
│   ├── components/         # React components
│   │   └── ui/            # shadcn/ui components
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utility functions
│   ├── pages/             # Page components
│   ├── assets/            # Images and media
│   ├── App.tsx            # Root component
│   ├── main.tsx           # Entry point
│   └── index.css          # Global styles
├── index.html             # HTML template (Vite entry point)
├── vite.config.ts         # Vite configuration
├── tailwind.config.ts     # Tailwind CSS configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Dependencies and scripts
```

## Code Quality

- **Linting**: ESLint with TypeScript support
- **Type Checking**: Strict TypeScript configuration
- **Pre-commit Hooks**: Automatic linting via Husky + lint-staged
- **CI/CD**: Automated checks on every PR and push

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run linting: `npm run lint`
5. Commit your changes (pre-commit hooks will run automatically)
6. Push to your fork: `git push origin feature/your-feature`
7. Open a Pull Request

## License

This project is private and proprietary.

## Contact

**Agustin Gonzalez Nicolini**
- Website: https://agusgonzaleznic.github.io
- GitHub: [@agusgonzaleznic](https://github.com/agusgonzaleznic)
