import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    // Ensures assets are linked relatively, which is required for GitHub Pages 
    // (e.g. username.github.io/repo-name/)
    base: './', 
    define: {
      // Prioritize process.env.API_KEY (System var) over .env file var
      'process.env.API_KEY': JSON.stringify(process.env.API_KEY || env.API_KEY),
    },
    build: {
      // Increases the warning limit to 1600kb to suppress warnings about large dependencies
      chunkSizeWarningLimit: 1600,
    },
  };
});