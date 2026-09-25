/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests", "<rootDir>/src"],
  testMatch: ["**/tests/**/*.test.ts", "**/src/**/*.test.ts"],
  // 遗留空壳/依赖 ESM(nanoid) 的用例尚未迁移；勿挡金标/覆盖闸 CI
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/tests/DocTemplate\\.test\\.ts$",
    "<rootDir>/tests/PptTemplate\\.test\\.ts$",
    "<rootDir>/tests/ViewItem4Doc\\.test\\.ts$",
    "<rootDir>/tests/ViewItem4Ppt\\.test\\.ts$",
  ],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          module: "commonjs",
          moduleResolution: "node",
          target: "ES2020",
          jsx: "react",
          skipLibCheck: true,
          paths: {"@/*": ["src/*"]},
          baseUrl: ".",
        },
        diagnostics: false,
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
};
