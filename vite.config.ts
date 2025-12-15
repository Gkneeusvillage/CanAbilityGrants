import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Increases the warning limit to 1600kb to suppress warnings about large dependencies
    // like the Google GenAI SDK or Lucide React icons.
    chunkSizeWarningLimit: 1600,
  },
});