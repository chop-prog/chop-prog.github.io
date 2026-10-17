# chop-prog: portfolio

**[chop-prog.github.io](https://chop-prog.github.io)**: the portfolio of a frontend developer, in English and Russian.

![Portfolio preview](docs/preview.jpg)

## Projects featured

| | Project | Stack |
|---|---|---|
| 01 | [**Flowboard**](https://github.com/chop-prog/flowboard): keyboard-first kanban app | React 19 · TypeScript · dnd-kit · Vitest |
| 02 | [**Aurora**](https://github.com/chop-prog/aurora): real-time GPU fluid simulation | WebGL2 · GLSL |
| 03 | [**VOID PULSE**](https://github.com/chop-prog/void-pulse): twin-stick roguelite with a custom engine | Canvas 2D · Web Audio · PWA |

## About this site

- Plain HTML, CSS and ES modules, with no framework and no build step.
- **Bilingual (EN/RU).** The HTML ships in English so it works without JavaScript and is easy for crawlers to read. The language is picked from the browser, can be switched, and the choice is remembered. A test checks that both dictionaries stay in sync with the markup.
- **Animated flow-field background.** It is rendered at half resolution, pauses when the tab is hidden, and is static under `prefers-reduced-motion`.
- **Progressive enhancement.** The reveal animations hide content only once JavaScript is running.
- **Accessibility:** a skip link, visible focus states, `aria-pressed` on the language toggle, and semantic sections.
- **Deployment:** GitHub Actions runs the tests and deploys to Pages.

```bash
npm start   # http://localhost:5173
npm test
```

## License

[MIT](LICENSE)
