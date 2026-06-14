import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function resolveManualChunk(id) {
  if (!id.includes('node_modules')) return undefined;
  if (id.includes('/firebase/') || id.includes('\\firebase\\')) return 'firebase';
  if (id.includes('/@dnd-kit/') || id.includes('\\@dnd-kit\\')) return 'dnd';
  if (
    id.includes('/docx/') ||
    id.includes('\\docx\\') ||
    id.includes('/html2canvas/') ||
    id.includes('\\html2canvas\\') ||
    id.includes('/jspdf/') ||
    id.includes('\\jspdf\\') ||
    id.includes('/@e965/xlsx/') ||
    id.includes('\\@e965\\xlsx\\')
  ) {
    return 'exports';
  }
  if (
    id.includes('/three/') ||
    id.includes('\\three\\') ||
    id.includes('/postprocessing/') ||
    id.includes('\\postprocessing\\')
  ) {
    return 'visualFx';
  }
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: resolveManualChunk,
      },
    },
  },
});
