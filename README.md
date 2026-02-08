# Parlae Starter

This is a starter template for building AI-powered voice agent applications using Parlae.

## Features

- 🤖 **AI Voice Agents** - Powered by Vapi.ai with Twilio integration
- 📞 **Phone Management** - Purchase, configure, and manage phone numbers
- 🧠 **Knowledge Base** - Train AI with your business documents (RAG)
- 🔧 **Tool Calls** - Let AI execute actions during calls
- 👥 **Squad Routing** - Multi-assistant workflows with intelligent routing
- 🎨 **Modern UI** - Built with Next.js 14, React, and Tailwind CSS
- 🔐 **Authentication** - NextAuth.js with multiple providers
- 📊 **Admin Dashboard** - Manage users, accounts, and agent templates
- 🔗 **CRM Integration** - GoHighLevel integration for contact management
- 📈 **Analytics** - Track call metrics and performance
- 🗄️ **Database** - PostgreSQL with Prisma ORM
- 🐳 **Docker Support** - Easy deployment with Docker Compose

## Quick Start

### Prerequisites

- Node.js 18+ or pnpm 8+
- PostgreSQL database
- Vapi.ai account ([Sign up](https://dashboard.vapi.ai/))
- Twilio account ([Sign up](https://console.twilio.com/))

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Dentia-AI/parlae-starter.git
cd parlae-starter
```

2. Install dependencies:
```bash
pnpm install
# or
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your credentials:
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/parlae

# Vapi.ai
VAPI_API_KEY=your-vapi-private-key
NEXT_PUBLIC_VAPI_PUBLIC_KEY=your-vapi-public-key
VAPI_SERVER_SECRET=your-random-secret-string

# Twilio
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret

# App
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
```

4. Run database migrations:
```bash
cd packages/prisma
npx prisma migrate deploy
npx prisma db seed
```

5. Start the development server:
```bash
npm run dev
# or
pnpm dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Using Docker

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Documentation

Comprehensive documentation is available in the `/docs` directory:

- **[Getting Started](GETTING_STARTED.md)** - Complete setup guide
- **[Vapi Integration](docs/VAPI_IMPLEMENTATION_SUMMARY.md)** - AI voice agent setup
- **[Testing Guide](docs/VAPI_TESTING_GUIDE.md)** - How to test voice agents
- **[Agent Templates](docs/AGENT_TEMPLATE_SYSTEM.md)** - Create reusable agent configurations
- **[Admin Console](docs/ADMIN_CONSOLE_ENHANCEMENT.md)** - Admin dashboard features
- **[Phone Integration](docs/PHONE_INTEGRATION_COMPLETE.md)** - Phone number management

## Key Technologies

- **Frontend**: Next.js 14, React 18, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL
- **Authentication**: NextAuth.js
- **AI Voice**: Vapi.ai
- **Telephony**: Twilio
- **CRM**: GoHighLevel (optional)
- **Deployment**: Docker, Vercel, Railway

## Project Structure

```
parlae-starter/
├── apps/
│   └── frontend/
│       ├── apps/web/          # Main Next.js application
│       └── packages/shared/   # Shared utilities and services
├── packages/
│   └── prisma/                # Database schema and migrations
├── docs/                      # Documentation
├── scripts/                   # Utility scripts
└── docker-compose.yml         # Docker configuration
```

## Features in Detail

### AI Voice Agents

Create intelligent voice agents that can:
- Answer questions using your knowledge base
- Book appointments and execute actions
- Transfer calls between specialized assistants
- Extract structured data from conversations
- Integrate with your CRM

### Admin Dashboard

Manage your application through a comprehensive admin console:
- User and account management
- Agent template creation and assignment
- Phone number management
- Call history and analytics
- System configuration

### Agent Templates

Create reusable agent configurations:
- Pre-configured prompts and settings
- Industry-specific templates (dental, sales, support)
- Easy deployment to new accounts
- Centralized management

## Configuration

### Environment Variables

All configuration is managed through environment variables. See `.env.example` for a complete list of available options.

### Database

The application uses PostgreSQL with Prisma ORM. Migrations are located in `packages/prisma/migrations/`.

### Authentication

NextAuth.js is configured with multiple authentication providers. Add your provider credentials in `.env.local`.

## Deployment

### Vercel

The easiest way to deploy is using [Vercel](https://vercel.com):

1. Push your code to GitHub
2. Import your repository in Vercel
3. Configure environment variables
4. Deploy!

### Docker

Deploy using Docker Compose:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Railway/Render

Deploy to Railway or Render using their platform-specific guides. Make sure to:
1. Set all environment variables
2. Configure PostgreSQL database
3. Run migrations on startup

## Development

### Running Tests

```bash
npm test
# or
pnpm test
```

### Linting

```bash
npm run lint
# or
pnpm lint
```

### Database Management

```bash
# Generate Prisma Client
cd packages/prisma
npx prisma generate

# Create a new migration
npx prisma migrate dev --name your_migration_name

# View database in Prisma Studio
npx prisma studio
```

## Support

For questions, issues, or feature requests:

- 📖 Check the [documentation](docs/)
- 🐛 Open an [issue](https://github.com/Dentia-AI/parlae-starter/issues)
- 💬 Start a [discussion](https://github.com/Dentia-AI/parlae-starter/discussions)

## License

See [LICENSE](LICENSE) for details.

## Acknowledgments

- [Vapi.ai](https://vapi.ai/) - AI voice platform
- [Twilio](https://www.twilio.com/) - Telephony infrastructure
- [Next.js](https://nextjs.org/) - React framework
- [Prisma](https://www.prisma.io/) - Database ORM
- [shadcn/ui](https://ui.shadcn.com/) - UI components

---

Built with ❤️ by the Parlae team
