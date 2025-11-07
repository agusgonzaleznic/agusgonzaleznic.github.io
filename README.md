# Agustin Gonzalez Nicolini — Leadership & Engineering Coaching

**Live Site**: https://agusgonzaleznic.github.io

## About This Project

A modern, conversion-focused single-page portfolio for engineering leadership coaching. Built with React, TypeScript, Tailwind CSS, and shadcn/ui, featuring:

- 🎨 **Premium Design System**: Minimal grayscale palette with electric coral accent
- ⚡ **Performance Optimized**: Lighthouse-friendly with optimized assets and animations
- 🔍 **SEO-Ready**: Complete meta tags, JSON-LD schema, and Open Graph
- 📱 **Fully Responsive**: Mobile-first design with sticky CTAs
- ♿ **Accessible**: WCAG 2.1 AA compliant with semantic HTML
- 🎭 **Tasteful Animations**: Subtle parallax, fade-ins, and hover effects

## Sections

1. **Hero** — Attention-grabbing introduction with profile image and trust indicators
2. **About** — Professional background and core values
3. **Philosophy** — Three coaching pillars: Clarity, Systems, and Empathy
4. **Services** — Three coaching programs (Executive, Team/Manager, Career Transition)
5. **Impact** — Quantified achievements and experience timeline
6. **Testimonials** — Social proof from engineering leaders
7. **Contact** — Lead capture form with social links
8. **Footer** — Quick navigation and branding

## Key Features

- Persistent "Book a Session" CTA in navigation
- Sticky mobile CTA bar
- Animated stats and impact metrics
- Professional testimonials with avatars
- Email-based contact form
- Smooth scroll navigation
- Reduced-motion support

## Development Setup

To work on this project locally, you'll need Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Deployment

This project is automatically deployed to GitHub Pages using GitHub Actions.

**Setup:**

1. Go to Repository → Settings → Pages
2. Set Source to "GitHub Actions"
3. Push to the `main` branch to trigger automatic deployment

**Manual Deployment:**

You can also build and deploy manually:

```sh
# Build the project
npm run build

# The dist/ folder contains the production build
# Deploy the dist/ folder to any static hosting service
```

## Custom Domain

To use a custom domain with GitHub Pages:

1. Add a `CNAME` file to the `public/` directory with your domain name
2. Configure your domain's DNS settings to point to GitHub Pages
3. Read more: [GitHub Pages Custom Domain Documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
