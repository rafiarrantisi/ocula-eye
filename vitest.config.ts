import { defineConfig } from 'vitest/config';

// Minimal config: pure domain tests only. Deliberately does NOT load the
// root vite.config.ts (Cloudflare/miniflare plugins break vitest startup).
export default defineConfig({
  test: {
    include: ['tests/domain/**/*.test.ts', 'tests/imaging/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/learning/**/*.test.ts'],
    environment: 'node',
  },
});
