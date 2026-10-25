interface LighthouseCiConfig {
  ci?: {
    collect?: Record<string, unknown>;
    assert?: Record<string, unknown>;
    upload?: Record<string, unknown>;
  };
}

const config: LighthouseCiConfig = {
  ci: {
    collect: {
      staticDistDir: '.next',
      numberOfRuns: 3,
      url: ['http://localhost:3000'],
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['warn', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};

export default config;
