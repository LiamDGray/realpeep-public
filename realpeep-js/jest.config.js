export default {
  collectCoverage: true,
  collectCoverageFrom: ["src/**/*.js", "!src/ReedSolomon.js"],
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  testEnvironment: "node"
};
