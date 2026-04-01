import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/analytics'],
          dnd: ['@dnd-kit/core', '@dnd-kit/utilities'],
          exports: ['docx', 'html2canvas', 'jspdf', 'xlsx'],
          visualFx: ['three', 'postprocessing'],
        },
      },
    },
  },
});
