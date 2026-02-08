# Frontend Testing Guide

This document provides comprehensive information about the testing infrastructure for the Dentia Next.js frontend application.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [API Route Tests](#api-route-tests)
- [Test Utilities](#test-utilities)
- [Writing Tests](#writing-tests)
- [Coverage](#coverage)
- [Best Practices](#best-practices)

## Overview

The frontend uses **Jest** with **Next.js** testing utilities for comprehensive API route and component testing. The test suite covers:

- **API Route Tests**: Server-side Next.js API endpoints
- **Component Tests**: React components (future)
- **Integration Tests**: Complete user flows (future)

## Test Structure

```
apps/frontend/apps/web/
├── app/
│   └── api/
│       ├── health/
│       │   ├── __tests__/
│       │   │   └── route.test.ts       # Health endpoint tests
│       │   └── route.ts
│       ├── test/
│       │   ├── echo/
│       │   │   ├── __tests__/
│       │   │   │   └── route.test.ts   # Echo endpoint tests
│       │   │   └── route.ts
│       │   └── backend-status/
│       │       ├── __tests__/
│       │       │   └── route.test.ts   # Backend status tests
│       │       └── route.ts
│       └── auth/
│           └── session/
│               ├── __tests__/
│               │   └── route.test.ts   # Session endpoint tests
│               └── route.ts
├── test/
│   ├── setup.ts                        # Jest setup file
│   └── mocks/
│       ├── next-auth.mock.ts          # NextAuth mocking utilities
│       └── fetch.mock.ts              # Fetch mocking utilities
└── jest.config.ts                     # Jest configuration
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
pnpm test:coverage
```

### Specific Test File

```bash
pnpm test app/api/health/__tests__/route.test.ts
```

## API Route Tests

API route tests verify the behavior of Next.js API endpoints.

### Available API Route Tests

#### Health Endpoint (`/api/health`)
- Tests basic health check response
- Validates JSON format
- Ensures consistent responses

#### Echo Endpoint (`/api/test/echo`)
- Tests message echoing functionality
- Validates timestamp handling
- Tests error cases (invalid JSON, empty body)
- Validates ISO timestamp format

#### Session Endpoint (`/api/auth/session`)
- Tests authentication status checking
- Validates CORS headers
- Tests authenticated and unauthenticated states
- Tests error handling
- Validates user data exposure

#### Backend Status Endpoint (`/api/test/backend-status`)
- Tests backend connectivity checking
- Validates error handling
- Tests different error types
- Validates response structure

### Example API Route Test

```typescript
import { GET } from '../route';

describe('/api/my-endpoint', () => {
  it('should return expected data', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('expectedField');
  });
});
```

## Test Utilities

### NextAuth Mock (`test/mocks/next-auth.mock.ts`)

Utilities for mocking authentication:

```typescript
import { createMockSession, mockAuth } from '~/test/mocks/next-auth.mock';

// Create a mock session
const session = createMockSession({
  user: {
    id: 'custom-id',
    email: 'custom@example.com',
  },
});

// Mock the auth function
mockAuth(session);
```

### Fetch Mock (`test/mocks/fetch.mock.ts`)

Utilities for mocking fetch requests:

```typescript
import { mockFetch, mockFetchError } from '~/test/mocks/fetch.mock';

// Mock successful fetch
mockFetch({ data: 'success' }, { status: 200 });

// Mock fetch error
mockFetchError('Network error');
```

## Writing Tests

### Testing API Routes

API routes in Next.js export functions like `GET`, `POST`, etc. Test them directly:

```typescript
import { GET, POST } from '../route';

describe('/api/my-route', () => {
  it('should handle GET requests', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('should handle POST requests', async () => {
    const request = new Request('http://localhost:3000/api/my-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'test' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data).toHaveProperty('success', true);
  });
});
```

### Mocking Dependencies

Mock external dependencies to isolate your tests:

```typescript
// Mock external module
jest.mock('@kit/shared/auth', () => ({
  auth: jest.fn(),
}));

import { auth } from '@kit/shared/auth';

describe('My Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should use mocked auth', async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: '123' } });
    
    // Your test code
  });
});
```

### Testing with Authentication

Use the NextAuth mock utilities:

```typescript
import { createMockSession } from '~/test/mocks/next-auth.mock';

jest.mock('@kit/shared/auth', () => ({
  auth: jest.fn(),
}));

import { auth } from '@kit/shared/auth';
import { GET } from '../route';

describe('Protected Route', () => {
  it('should return data for authenticated user', async () => {
    const mockSession = createMockSession();
    (auth as jest.Mock).mockResolvedValue(mockSession);

    const response = await GET();
    const data = await response.json();

    expect(data.isAuthenticated).toBe(true);
  });

  it('should return 401 for unauthenticated user', async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const response = await GET();
    
    expect(response.status).toBe(401);
  });
});
```

### Testing CORS Headers

Validate CORS configuration:

```typescript
it('should include correct CORS headers', async () => {
  const response = await GET();

  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('expected-origin');
  expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST');
});
```

### Testing Error Handling

Test both success and failure cases:

```typescript
it('should handle errors gracefully', async () => {
  // Mock a failure
  mockFetchError('Connection failed');

  const response = await GET();
  const data = await response.json();

  expect(response.status).toBe(500);
  expect(data).toHaveProperty('error');
  expect(data.success).toBe(false);
});
```

## Coverage

Generate and view coverage reports:

```bash
# Generate coverage report
pnpm test:coverage

# Coverage files will be generated in coverage/
# Open coverage/lcov-report/index.html to view detailed report
```

### Coverage Goals

- **API Routes**: > 80%
- **Critical Paths**: > 90% (auth, payments)
- **Utility Functions**: > 85%

## Best Practices

### 1. Test Organization

- Co-locate tests with their source files in `__tests__` directories
- Use descriptive test names that explain what is being tested
- Group related tests with `describe` blocks
- Keep tests focused and independent

### 2. Mocking

- Mock external dependencies (auth, database, APIs)
- Reset mocks between tests with `beforeEach(() => jest.clearAllMocks())`
- Use type-safe mocks when possible
- Avoid mocking the code under test

### 3. Assertions

- Use specific matchers (`toEqual`, `toHaveProperty`, `toContain`)
- Test both success and error cases
- Validate response structure and types
- Test edge cases and boundary conditions

### 4. Request Creation

- Create proper Request objects for POST/PUT/PATCH tests
- Include necessary headers
- Test with various body formats

```typescript
const request = new Request('http://localhost:3000/api/endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ data: 'test' }),
});
```

### 5. Async Testing

- Always use `async/await` for async tests
- Handle promise rejections properly
- Use `expect().rejects.toThrow()` for error testing

### 6. Test Data

- Use factories/fixtures for consistent test data
- Generate unique IDs for each test to avoid conflicts
- Don't rely on test execution order

### 7. Performance

- Keep tests fast (< 100ms for unit tests)
- Use `beforeAll` for expensive setup when safe
- Avoid unnecessary async operations
- Mock time-dependent code when needed

### 8. Maintainability

- Update tests when requirements change
- Refactor tests alongside code
- Remove obsolete tests
- Keep test code clean and DRY

## Common Patterns

### Testing Next.js API Routes

```typescript
import { NextResponse } from 'next/server';
import { GET } from '../route';

describe('My API Route', () => {
  it('should return JSON response', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);
    expect(data).toBeDefined();
  });
});
```

### Testing with Request Body

```typescript
it('should process request body', async () => {
  const requestBody = { name: 'Test', value: 123 };
  
  const request = new Request('http://localhost:3000/api/endpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const response = await POST(request);
  const data = await response.json();

  expect(data).toHaveProperty('processed', true);
});
```

### Testing Response Headers

```typescript
it('should set correct headers', async () => {
  const response = await GET();

  expect(response.headers.get('Content-Type')).toContain('application/json');
  expect(response.headers.get('Cache-Control')).toBeDefined();
});
```

## Troubleshooting

### Tests Timeout

Increase timeout for slow tests:

```typescript
it('slow operation', async () => {
  // Test code
}, 10000); // 10 second timeout
```

### Mock Not Working

Ensure mocks are properly set up:

```typescript
// Mock before importing the module under test
jest.mock('@kit/shared/auth');

import { auth } from '@kit/shared/auth';
import { GET } from '../route';

// Reset mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});
```

### Module Resolution Issues

Check your `jest.config.ts` for correct path mappings:

```typescript
moduleNameMapper: {
  '^~/(.*)$': '<rootDir>/$1',
  '^@/(.*)$': '<rootDir>/$1',
}
```

### Request Object Issues

Make sure to create valid Request objects:

```typescript
// Good
const request = new Request('http://localhost:3000/api/endpoint', {
  method: 'POST',
  body: JSON.stringify(data),
});

// Bad - missing URL
const request = new Request('POST', { body: data });
```

## Next Steps

### Planned Test Coverage

1. **Component Tests**: Test React components
2. **Integration Tests**: Test complete user flows
3. **E2E Tests**: Full application testing with Playwright/Cypress
4. **Performance Tests**: Load and response time testing

## Additional Resources

- [Next.js Testing Documentation](https://nextjs.org/docs/testing)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library Documentation](https://testing-library.com/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

## Contributing

When adding new features:

1. Write tests alongside new code
2. Ensure all tests pass
3. Maintain or improve coverage
4. Update this documentation if needed

For questions or issues, please contact the development team.

