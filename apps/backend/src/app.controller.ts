import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { CognitoAuthGuard } from './auth/cognito-auth.guard';
import type { CognitoJwtPayload } from './auth/cognito-jwt-verifier.service';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async status() {
    let database = 'unknown';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'reachable';
    } catch (error) {
      database = `unreachable: ${error instanceof Error ? error.message : error}`;
    }

    return {
      message: 'Dentia backend ready',
      database,
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(CognitoAuthGuard)
  @Get('me')
  me(@Req() request: Request & { user?: CognitoJwtPayload }) {
    return {
      user: request.user,
    };
  }

  /**
   * TEST ENDPOINT: Echo test for frontend-backend communication
   * Can be called without authentication for testing connectivity
   */
  @Post('test/echo')
  echo(@Body() body: { message: string; timestamp?: string }) {
    return {
      success: true,
      echo: body.message,
      receivedAt: new Date().toISOString(),
      sentAt: body.timestamp,
      backend: 'NestJS',
    };
  }

  /**
   * TEST ENDPOINT: Authenticated database test
   * Requires authentication and tests full stack
   */
  @UseGuards(CognitoAuthGuard)
  @Post('test/db')
  async testDatabase(@Req() request: Request & { user?: CognitoJwtPayload }) {
    try {
      // Test database read
      const userCount = await this.prisma.user.count();
      const accountCount = await this.prisma.account.count();
      
      // Test database write (find or create a test record)
      const testUser = await this.prisma.user.findUnique({
        where: { id: request.user?.sub },
        select: { id: true, email: true, displayName: true, role: true },
      });

      return {
        success: true,
        database: 'connected',
        authenticated: true,
        user: {
          cognitoId: request.user?.sub,
          email: request.user?.email,
          dbRecord: testUser,
        },
        stats: {
          totalUsers: userCount,
          totalAccounts: accountCount,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        database: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
