# lyric-ui

Shared React component library for Lyric-based UIs.

`lyric-ui` provides a set of accessible, themeable UI primitives for building front-end applications that interact with the [Lyric](https://github.com/overture-stack/lyric) data submission system.

---

## Features

- **Themeable** — Theming can be customized using css variables in the main .css file in your application. Please see section [Theming].
- **Variant-driven components** — built with [`class-variance-authority`](https://cva.style/) so each component exposes a clean, type-safe variant API.
- **Dual-format build** — ships both ES module (`lyric-ui.js`) and CommonJS (`lyric-ui.cjs`) outputs so it works in both modern bundlers and legacy setups.
- **Storybook** — every component has stories for interactive development and visual documentation.

---

### Utilities

| Export           | Description                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `cn(...inputs)`  | Merges Tailwind class strings, resolving conflicts via `tailwind-merge` and conditional logic via `clsx`.     |
| `buttonVariants` | The underlying CVA variant factory for `Button`, useful when you need the class string without the component. |

---

## Technologies

| Technology                                                                                           | Role                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [React 18](https://react.dev/)                                                                       | Component runtime                                 |
| [TypeScript](https://www.typescriptlang.org/)                                                        | Authoring language; types shipped in `dist/`      |
| [Tailwind CSS v4](https://tailwindcss.com/)                                                          | Utility-first styling                             |
| [class-variance-authority](https://cva.style/)                                                       | Variant and slot management for components        |
| [clsx](https://github.com/lukeed/clsx) + [tailwind-merge](https://github.com/dcastil/tailwind-merge) | Conditional class composition without conflicts   |
| [Vite](https://vitejs.dev/)                                                                          | Library build (ESM + CJS, bundled CSS)            |
| [Storybook 8](https://storybook.js.org/)                                                             | Component development environment and visual docs |

The theming system follows a similar [shadcn/ui](https://ui.shadcn.com/) convention: design tokens are declared as CSS custom properties in a `@layer base` block, then referenced by Tailwind via `@theme`. shadcn uses HSL to apply their themes by default, this implementation will also be able to support other formats. Ultimately, callers can override the full palette simply by redefining the CSS variables in their own stylesheet which will be explained further in the next section.

### Theming

Tailoring lyric-ui components to a target application is done by overriding CSS variables in your application's main `.css` file. The following tokens control the full palette:

| Variable                         | Default value            | Description                                                         |
| -------------------------------- | ------------------------ | ------------------------------------------------------------------- |
| `--color-background`             | `hsl(0 0% 100%)`         | Page/surface background                                             |
| `--color-foreground`             | `hsl(222.2 84% 4.9%)`    | Default text and icon color                                         |
| `--color-primary`                | `hsl(222.2 47.4% 11.2%)` | Primary action color (buttons, links)                               |
| `--color-primary-foreground`     | `hsl(210 40% 98%)`       | Text/icons rendered on a primary-colored surface                    |
| `--color-secondary`              | `hsl(210 40% 96.1%)`     | Secondary action or surface color                                   |
| `--color-secondary-foreground`   | `hsl(222.2 47.4% 11.2%)` | Text/icons rendered on a secondary-colored surface                  |
| `--color-muted`                  | `hsl(210 40% 96.1%)`     | Subdued background for non-interactive areas (badges, placeholders) |
| `--color-muted-foreground`       | `hsl(215.4 16.3% 46.9%)` | Text/icons rendered on a muted surface                              |
| `--color-accent`                 | `hsl(210 40% 96.1%)`     | Highlight or hover state background                                 |
| `--color-accent-foreground`      | `hsl(222.2 47.4% 11.2%)` | Text/icons rendered on an accent-colored surface                    |
| `--color-destructive`            | `hsl(0 84.2% 60.2%)`     | Destructive/error action color (delete, error states)               |
| `--color-destructive-foreground` | `hsl(210 40% 98%)`       | Text/icons rendered on a destructive-colored surface                |
| `--color-border`                 | `hsl(214.3 31.8% 91.4%)` | Default border color for cards, inputs, and dividers                |
| `--color-input`                  | `hsl(214.3 31.8% 91.4%)` | Input field border color                                            |
| `--color-ring`                   | `hsl(222.2 84% 4.9%)`    | Focus ring color for interactive elements                           |
| `--radius`                       | `0.5rem`                 | Base border-radius used across components                           |
| `--color-pill-error`             | `#ffccc7`                | Background color for error/failed pill badges                       |
| `--color-pill-success`           | `#52c41a`                | Background color for success pill badges                            |
| `--color-pill-warning`           | `#ffff7a`                | Background color for warning pill badges                            |
| `--color-pill-default`           | `#f9fafb`                | Background color for default/neutral pill badges                    |

Your main css file should look something like this:

```css
@theme {
	--color-background: hsl(0 0% 100%);
	--color-foreground: hsl(222.2 84% 4.9%);
	--color-primary: hsl(222.2 47.4% 11.2%);
	--color-primary-foreground: hsl(210 40% 98%);
	--color-secondary: hsl(210 40% 96.1%);
	--color-secondary-foreground: hsl(222.2 47.4% 11.2%);
	--color-muted: hsl(210 40% 96.1%);
	--color-muted-foreground: hsl(215.4 16.3% 46.9%);
	--color-accent: hsl(210 40% 96.1%);
	--color-accent-foreground: hsl(222.2 47.4% 11.2%);
	--color-destructive: hsl(0 84.2% 60.2%);
	--color-destructive-foreground: hsl(210 40% 98%);
	--color-border: hsl(214.3 31.8% 91.4%);
	--color-input: hsl(214.3 31.8% 91.4%);
	--color-ring: hsl(222.2 84% 4.9%);
}

:root {
	--background: var(--color-background);
	--foreground: var(--color-foreground);
	--primary: var(--color-primary);
	--primary-foreground: var(--color-primary-foreground);
	--secondary: var(--color-secondary);
	--secondary-foreground: var(--color-secondary-foreground);
	--muted: var(--color-muted);
	--muted-foreground: var(--color-muted-foreground);
	--accent: var(--color-accent);
	--accent-foreground: var(--color-accent-foreground);
	--destructive: var(--color-destructive);
	--destructive-foreground: var(--color-destructive-foreground);
	--border: var(--color-border);
	--input: var(--color-input);
	--ring: var(--color-ring);
	--radius: 0.5rem;
}
```

You could theoretically add values directly into `:root`, but defining them in `@theme` exposes the custom variables across Tailwind's utility classes, making them applicable to a broader set of components beyond the shadcn defaults.

> NOTE: Because tailwind is being bundled with these exported components, it's worth noting that a project also using tailwind may possibly overlap on styles. This won't functionally affect the project, but may cause unintended visual issues.

---

## Adding new components from Shadcn

From the component library from [shadcn](https://ui.shadcn.com/docs/components), select targeted component and run the command they give you for that component.
For example, `pnpm dlx shadcn@latest add card` will add a card component. All components added through this method will be added to the path `components/ui/*`.

NOTE: Some components may also install third-party libraries.
For example `pnpm dlx shadcn@latest add popover` will add `@radix-ui/react-popover`.

## Installation

<!--
```bash
pnpm add @overture-stack/lyric-ui
```-->
