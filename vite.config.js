import { defineConfig } from 'vite';

// Static build deployable to GitHub Pages / Netlify as one folder.
// base './' keeps asset URLs relative so it works from any sub-path.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    open: false, // the Browser pane / your own tab opens it; no surprise windows
  },
});
