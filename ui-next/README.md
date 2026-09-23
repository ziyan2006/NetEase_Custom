# YesMusic · DJ Analysis OS visual prototype

This is an isolated visual prototype for the YesMusic renderer. It does not call
the production APIs or modify the existing `public/` UI. The Copilot and playlist
screens use clearly labeled sample data to test layout and interactions.

```sh
npm --prefix ui-next install
npm --prefix ui-next run dev
```

Open the URL printed by Vite, usually `http://127.0.0.1:5173`. Use the left rail
to switch between the two prototype screens. `npm --prefix ui-next run build`
checks the TypeScript bundle.

The archive model is adapted from
[LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI) at commit
`6185da2b1891aa9484e90ef233d360cdae655b89`. Its MIT license is in
`third-party/RhineLabUI-LICENSE`. Original project branding on the model is
hidden, and a YesMusic label is drawn onto the prototype model at runtime.
The interface uses original YesMusic copy and controls. The reference project's
third-party fonts, music, and original work's branding are not included.

Review captures are in `previews/`: Copilot and playlist layouts at 1440×900 and
1080×780, plus a dark Copilot variant. These are visual decisions for review,
not evidence of production feature integration. The existing Electron renderer
remains the live UI until its modules are migrated.
