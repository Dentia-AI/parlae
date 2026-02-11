# Backend Testing Guide

This document provides comprehensive information about the testing infrastructure for the Dentia backend application.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Unit Tests](#unit-tests)
- [E2E Tests](#e2e-tests)
- [Test Utilities](#test-utilities)
- [Writing Tests](#writing-tests)
- [Coverage](#coverage)
- [Best Practices](#best-practices)

## Overview

The backend uses **Jest** as the testing framework along with **NestJS Testing utilities** for comprehensive unit and end-to-end testing. The test suite covers:

- **Unit Tests**: Individual components, services, controllers, guards, filters, and interceptors
- **E2E Tests**: Full application flow testing with HTTP requests
- **Integration Tests**: Database interactions and external service integrations

## Test Structure

```
apps/backend/
├── src/
│   ├── **/*.spec.ts          # Unit tests (co-located with source files)
│   └── test/
│       ├── fixtures/          # Test data and fixtures
│       │   ├── jwt.fixture.ts
│       │   └── user.fixture.ts
│       └── mocks/             # Mock implementations
│           ├── config.mock.ts
│           └── prisma.mock.ts
└── test/
    ├── **/*.e2e-spec.ts      # E2E tests
    └── jest-e2e.json          # E2E Jest configuration
```

## Running Tests

### All Tests

```bash
pnpm test
```

### Watch Mode (for development)

```bash
pnpm test:watch
```

### Coverage Report

```bash
pnpm test:cov
```

### E2E Tests Only

```bash
pnpm test:e2e
```

### Debug Mode

```bash
pnpm test:debug
```

Then attach your debugger to the Node process.

## Unit Tests

Unit tests are located alongside their source files with the `.spec.ts` extension.

### Available Unit Tests

#### Services

- **HealthService** (`src/health/health.service.spec.ts`)
  - Tests status endpoint functionality
  - Validates timestamp format

- **PrismaService** (`src/prisma/prisma.service.spec.ts`)
  - Tests database connection lifecycle
  - Validates Prisma client accessors

- **CognitoJwtVerifierService** (`src/auth/cognito-jwt-verifier.service.spec.ts`)
  - Tests JWT token verification
  - Validates token claims (issuer, audience, expiration)
  - Tests JWKS caching
  - Handles malformed tokens and errors

#### Controllers

- **HealthController** (`src/health/health.controller.spec.ts`)
  - Tests health check endpoint

- **AppController** (`src/app.controller.spec.ts`)
  - Tests main application endpoints
  - Tests authenticated endpoints
  - Tests database connectivity checks

#### Guards

- **CognitoAuthGuard** (`src/auth/cognito-auth.guard.spec.ts`)
  - Tests JWT authentication
  - Tests authorization header parsing
  - Tests bearer token validation

#### Filters & Interceptors

- **GlobalHttpExceptionFilter** (`src/common/filters/http-exception.filter.spec.ts`)
  - Tests error handling and formatting
  - Tests sensitive data sanitization
  - Tests logging for different status codes

- **LoggingInterceptor** (`src/common/interceptors/logging.interceptor.spec.ts`)
  - Tests request/response logging
  - Tests duration measurement
  - Tests error logging

### Running Specific Test Files

```bash
# Run a specific test file
pnpm test src/health/health.service.spec.ts

# Run tests matching a pattern
pnpm test --testPathPattern=health

# Run tests in a specific directory
pnpm test src/auth
```

## E2E Tests

E2E tests are located in the `test/` directory and test the full application flow.

### Available E2E Tests

- **App E2E** (`test/app.e2e-spec.ts`)
  - Tests main application endpoints
  - Tests authentication flow
  - Tests database operations
  - Tests error handling

- **Health E2E** (`test/health.e2e-spec.ts`)
  - Tests health check endpoint
  - Validates response structure

### E2E Test Features

- Full application bootstrap
- Real HTTP requests using `supertest`
- Mocked external dependencies (Cognito JWKS)
- Isolated test database (configurable)

## Test Utilities

### Fixtures

#### JWT Fixture (`src/test/fixtures/jwt.fixture.ts`)

Utilities for creating and managing test JWT tokens:

```typescript
import { generateKeyPair, createTestJwt } from './test/fixtures/jwt.fixture';

// Generate RSA key pair
const { publicKey, privateKey } = generateKeyPair();

// Create valid JWT token
const token = createTestJwt(
  {
    sub: 'user-123',
    email: 'test@example.com',
  },
  privateKey,
  'test-key-id'
);

// Create expired token
const expiredToken = createExpiredJwt(privateKey);

// Create malformed token
const malformedToken = createMalformedJwt();
```

#### User Fixture (`src/test/fixtures/user.fixture.ts`)

Utilities for creating mock user data:

```typescript
import { createMockUser, createMockAccount } from './test/fixtures/user.fixture';

const user = createMockUser({ email: 'custom@example.com' });
const account = createMockAccount({ name: 'Custom Account' });
```

### Mocks

#### Config Mock (`src/test/mocks/config.mock.ts`)

Mock ConfigService for testing:

```typescript
import { createMockConfigService } from './test/mocks/config.mock';

const configService = createMockConfigService({
  CUSTOM_VAR: 'custom-value',
});
```

#### Prisma Mock (`src/test/mocks/prisma.mock.ts`)

Mock PrismaService using `jest-mock-extended`:

```typescript
import { createMockPrismaService, prismaMock } from './test/mocks/prisma.mock';

const prismaService = createMockPrismaService();

// Mock Prisma operations
prismaMock.user.findUnique.mockResolvedValue(mockUser);
```

## Writing Tests

### Unit Test Example

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MyService } from './my.service';

describe('MyService', () => {
  let service: MyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MyService],
    }).compile();

    service = module.get<MyService>(MyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should perform operation', () => {
    const result = service.doSomething();
    expect(result).toBe(expectedValue);
  });
});
```

### E2E Test Example

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('MyController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/endpoint (GET)', () => {
    return request(app.getHttpServer())
      .get('/endpoint')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('data');
      });
  });
});
```

### Testing with Authentication

```typescript
import { createTestJwt, generateKeyPair } from './test/fixtures/jwt.fixture';

// Generate key pair
const keyPair = generateKeyPair();

// Create valid token
const token = createTestJwt(
  { sub: 'user-123', email: 'test@example.com' },
  keyPair.privateKey
);

// Use in request
return request(app.getHttpServer())
  .get('/protected-endpoint')
  .set('Authorization', `Bearer ${token}`)
  .expect(200);
```

## Coverage

Generate and view coverage reports:

```bash
# Generate coverage report
pnpm test:cov

# Coverage files will be generated in coverage/
# Open coverage/lcov-report/index.html to view detailed report
```

### Coverage Goals

- **Overall Coverage**: > 80%
- **Critical Paths**: > 90% (auth, database operations)
- **Controllers**: > 85%
- **Services**: > 90%
- **Guards/Filters/Interceptors**: > 85%

## Best Practices

### 1. Test Organization

- Co-locate unit tests with source files
- Use descriptive test names
- Group related tests with `describe` blocks
- Keep tests focused and isolated

### 2. Mocking

- Mock external dependencies (databases, APIs)
- Use `jest-mock-extended` for deep mocking
- Reset mocks between tests
- Avoid mocking the system under test

### 3. Assertions

- Use specific matchers (`toBe`, `toEqual`, `toHaveProperty`)
- Test both success and error cases
- Validate response structure and types
- Test edge cases and boundary conditions

### 4. Test Data

- Use fixtures for consistent test data
- Generate unique IDs for each test
- Clean up test data after tests
- Don't rely on test execution order

### 5. Async Testing

- Always use `async/await` or return promises
- Handle promise rejections
- Use `expect().rejects.toThrow()` for error testing

### 6. Performance

- Keep tests fast (< 100ms for unit tests)
- Use `beforeAll` for expensive setup
- Avoid unnecessary database operations
- Mock time-dependent code

### 7. Maintenance

- Update tests when requirements change
- Refactor tests alongside code
- Remove obsolete tests
- Keep test code clean and DRY

## Continuous Integration

Tests should run automatically in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: pnpm test

- name: Run E2E tests
  run: pnpm test:e2e

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## Troubleshooting

### Tests Timeout

Increase timeout for slow tests:

```typescript
it('slow operation', async () => {
  // Test code
}, 10000); // 10 second timeout
```

### Database Connection Issues

Ensure your database is running and accessible:

```bash
# Check DATABASE_URL environment variable
echo $DATABASE_URL

# Run database migrations
pnpm prisma:migrate
```

### Mock Not Working

Ensure mocks are reset between tests:

```typescript
afterEach(() => {
  jest.clearAllMocks();
  // or
  jest.resetAllMocks();
});
```

### E2E Tests Failing

1. Check if all dependencies are installed
2. Verify environment variables are set
3. Ensure database is accessible
4. Check for port conflicts

## Additional Resources

- [NestJS Testing Documentation](https://docs.nestjs.com/fundamentals/testing)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://testingjavascript.com/)

## Contributing

When adding new features:

1. Write tests first (TDD approach)
2. Ensure all tests pass
3. Maintain or improve coverage
4. Update this documentation if needed

For questions or issues, please contact the development team.

