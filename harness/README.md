# DeepSeek Harness Runtime

The main application launches `sdk-runtime.mjs` on demand. Copilot talks to DeepSeek Harness: DSH skills (`harness/skills/`) hold tool playbooks; `dj-crate-plugin.mjs` registers the restricted tools. Bash, filesystem, web search, and subagents stay disabled. The runtime cannot access the Electron login cookie or arbitrary network URLs.

Install the application dependencies and configure `DEEPSEEK_API_KEY` before starting YesMusic:

~~~sh
npm install
npm start
~~~

The SDK runtime stores its generated profile in `harness/.sdk-home/`, which is ignored by Git. The bridge defaults to `http://127.0.0.1:4178`; Electron updates `YESMUSIC_AGENT_BRIDGE_URL` automatically when it selects a fallback port. For an externally started service, set it only to another loopback address.

`npm run harness:web` remains an optional developer UI. It needs an additional `npm --prefix harness install` and keeps its separate state in `harness/.dsh-home/`.

The runtime is pinned to `@deepseek-ai/dsh@0.1.0-rc.6`. DeepSeek Harness is currently a developer preview, so update it only through an explicit compatibility review.
