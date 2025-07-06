module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
    testRegex: '.*\\.spec\\.ts$',
    transform: {
        '^.+\\.(t|j)s$': 'ts-jest',
    },
    collectCoverageFrom: [
        'src/**/*.(t|j)s',
        '!src/**/*.spec.ts',
    ],
    coverageDirectory: './coverage',
    moduleNameMapper: {
        '^src/(.*)$': '<rootDir>/src/$1',
        '^generated/(.*)$': '<rootDir>/generated/$1',
    },
};