# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a BOQ (Bill of Quantities) Matching System for the construction industry. It uses AI-powered matching to map items from construction BOQ Excel files to an internal price list database.

## Key Commands

### Development
```bash
# Install all dependencies
npm run install:all

# Start development servers (Convex + Backend + Frontend)
npm run dev

# Individual dev servers
npm run dev:convex    # Convex database
npm run dev:backend   # Express API server
npm run dev:frontend  # React frontend
```

### Build & Deploy
```bash
# Build all components
npm run build

# Production build
npm run build:production

# Azure deployment
npm run build:azure
```

### Testing
```bash
# Run comprehensive test suite
cd backend && npx tsx src/tests/comprehensive-test.ts

# Test matching logic
cd backend && npx tsx src/tests/test-improved-matching.ts

# Test Excel parsing
cd backend && npx tsx src/tests/test-excel-parsing-improvements.ts
```

### Frontend Commands
```bash
cd frontend
npm run lint     # Run ESLint
npm run build    # Build for production
```

## Architecture Overview

### Three-Layer Architecture

1. **Frontend (React + TypeScript)**
   - Located in `/frontend`
   - Uses React 19, React Router, Tailwind CSS
   - State management with Zustand
   - Real-time updates via Socket.io
   - Form handling with React Hook Form + Zod

2. **Backend (Express + TypeScript)**
   - Located in `/backend`
   - RESTful API with Express 5
   - Authentication using JWT (access + refresh tokens)
   - File uploads handled via Multer
   - Supports AWS S3 or local file storage
   - Can be deployed as Lambda functions or standalone server

3. **Database (Convex)**
   - Schema defined in `/convex/schema.ts`
   - Real-time database with TypeScript-first API
   - Handles all data persistence and queries

### Core Services

**Matching Service** (`backend/src/services/matching.service.ts`)
- Implements multi-method matching: LOCAL (fuzzy), COHERE (embeddings), OPENAI (embeddings)
- LRU cache for embeddings
- Construction-specific pattern matching
- Handles Excel file parsing with dynamic header detection

**Job Processing** (`backend/src/services/jobProcessor.service.ts`)
- Async job processing for BOQ matching
- Progress tracking and error handling
- Excel file parsing with multiple format support

**File Storage** (`backend/src/services/fileStorage.service.ts`)
- Abstraction over S3 and local storage
- Handles file uploads and downloads

### Key Data Models

- **Users**: Authentication and authorization
- **PriceItems**: Master price list with construction-specific fields
- **AIMatchingJobs**: Async job tracking for BOQ processing
- **MatchResults**: Individual row matching results
- **Clients/Projects**: Business entity management

### API Routes

- `/api/auth/*` - Authentication endpoints
- `/api/price-matching/*` - BOQ upload and matching
- `/api/price-list/*` - Price item management
- `/api/dashboard/*` - Analytics and metrics
- `/api/admin/*` - Admin operations
- `/api/clients/*` - Client management
- `/api/projects/*` - Project management

### Security Features

- JWT-based authentication with refresh tokens
- Rate limiting on all endpoints
- Input validation using Joi/Zod
- Helmet.js for security headers
- CORS configuration for cross-origin requests

## Development Tips

- The system supports multiple Excel formats - test files are in `backend/src/tests/`
- Matching accuracy depends on price item data quality - ensure descriptions are detailed
- The construction pattern service (`constructionPatterns.service.ts`) contains domain-specific logic
- Environment variables are loaded from `.env` files (not committed)
- Convex functions are in both `/convex` and duplicated in frontend/backend for type safety

## Deployment Considerations

- Can deploy to AWS Lambda, Azure App Service, or Vercel
- Frontend can be served statically or from the backend
- Ensure Convex environment variables are set
- File storage requires either S3 bucket or persistent local storage
- Set appropriate CORS origins for production