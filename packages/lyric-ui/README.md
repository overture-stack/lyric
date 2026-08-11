# lyric-ui

Shared React component library for Lyric-based UIs.

`lyric-ui` provides a set of accessible, themeable UI primitives for building front-end applications that interact with the [Lyric](https://github.com/overture-stack/lyric) data submission system. It is part of the [Overture](https://www.overture.bio/) open-source platform, a collection of microservices for organizing and sharing genomics data.

---

## Features

- **Themeable design tokens** — colors, radii, and other design values are driven by CSS custom properties, making it straightforward to adapt the look to your application's brand.
- **Dark mode support** — components respond to a `.dark` class variant out of the box.
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
| [tailwindcss-animate](https://github.com/jamiebuilds/tailwindcss-animate)                            | Animation utilities                               |
| [class-variance-authority](https://cva.style/)                                                       | Variant and slot management for components        |
| [clsx](https://github.com/lukeed/clsx) + [tailwind-merge](https://github.com/dcastil/tailwind-merge) | Conditional class composition without conflicts   |
| [Vite](https://vitejs.dev/)                                                                          | Library build (ESM + CJS, bundled CSS)            |
| [Storybook 8](https://storybook.js.org/)                                                             | Component development environment and visual docs |

The theming system follows the [shadcn/ui](https://ui.shadcn.com/) convention: design tokens are declared as CSS custom properties (HSL values) in a `@layer base` block, then referenced by Tailwind via `@theme`. This means callers can override the full palette simply by redefining the CSS variables in their own stylesheet.

---

## Installation

```bash
pnpm add @overture-stack/lyric-ui
```
