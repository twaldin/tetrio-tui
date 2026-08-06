import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Integration tests that hit the live server are gated behind env var so CI/local
    // unit runs stay hermetic: RUN_LIVE=1 npm test
    env: { RUN_LIVE: process.env.RUN_LIVE ?? '0' },
  },
});
