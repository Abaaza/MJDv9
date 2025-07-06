# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MJD Price Matcher is an AI-powered BOQ (Bill of Quantities) matching system for construction projects. It uses fuzzy matching and AI embeddings (Cohere/OpenAI) to match items from uploaded BOQ files against a master price list.

## Development Commands

### Full Stack Development
```bash
# Install all dependencies (root, backend, and frontend)
npm run install:all

# Run all services in development (Convex, Backend, Frontend)
npm run dev

# Build all services
npm run build:all
```

### Backend Development
```bash
cd backend

# Development mode with hot reload
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Run Convex admin script to create admin user
npx tsx scripts/create-abaza-admin.ts
```

### Frontend Development
```bash
cd frontend

# Development server
npm run dev

# Build for production
npm run build

# Run ESLint
npm run lint

# Preview production build
npm run preview
```

### Convex Database
```bash
# Development mode
npm run dev:convex

# Deploy to production
npm run build:convex
```

### Testing
```bash
# Run comprehensive matching test
cd backend
npx tsx src/tests/comprehensive-test.ts
```

## Architecture Overview

### Technology Stack
- **Frontend**: React 19 + TypeScript + Vite + TanStack Query + Zustand
- **Backend**: Express.js + TypeScript + Node.js
- **Database**: Convex (serverless database)
- **Matching Engines**: LOCAL, LOCAL_UNIT, COHERE, OPENAI, HYBRID, HYBRID_CATEGORY, ADVANCED

### Key Services and Patterns

#### Backend Service Architecture
- **Singleton Services**: MatchingService, JobProcessor, PriceListCache use singleton pattern
- **Job Queue**: Sequential processing with configurable batch sizes
- **Caching Strategy**: LRU cache for embeddings and match results
- **Error Handling**: Resilient Convex client with automatic retries

#### Authentication Flow
- JWT-based authentication with access (15min) and refresh (7 days) tokens
- Token refresh handled automatically by frontend interceptor
- Role-based access control (User/Admin)

#### Matching Process
1. **Excel Upload**: Parsed with ExcelJS, supports multiple header formats
2. **Job Creation**: Stored in Convex with unique job ID
3. **Batch Processing**: Items processed in configurable batches (default: 10)
4. **Matching Methods**:
   - LOCAL: Multi-strategy fuzzy matching with keyword extraction
   - LOCAL_UNIT: Unit-focused matching with compatibility checks
   - COHERE: Technical semantic understanding with embeddings
   - OPENAI: Natural language understanding with work type extraction
   - HYBRID: Intelligent ensemble voting across all methods
   - HYBRID_CATEGORY: Category-aware matching with auto-detection
   - ADVANCED: Multi-stage pattern matching with code recognition
5. **Result Storage**: Matches stored with confidence scores and manual override support

### API Endpoints

#### Core Endpoints
- **Auth**: `/api/auth/*` - Registration, login, token refresh
- **Price Matching**: `/api/price-matching/*` - Upload, status polling, results, export
- **Price List**: `/api/price-list/*` - CRUD operations, bulk import
- **Projects**: `/api/projects/*` - Project management
- **Admin**: `/api/admin/*` - User management, settings
- **Jobs**: `/api/jobs/*` - Job status polling

#### Request/Response Patterns
- All endpoints return consistent error format: `{ success: false, error: string }`
- Successful responses: `{ success: true, data: any }`
- File uploads use multipart/form-data
- Job polling returns progress updates

### Database Schema (Convex)

Key tables:
- `users`: Authentication with hashed passwords
- `priceItems`: Master price list with optional embeddings
- `aiMatchingJobs`: Job queue with status tracking
- `matchResults`: Individual match results with confidence scores
- `activityLogs`: User activity tracking
- `applicationSettings`: Global configuration
- `clients`: Client management
- `projects`: Project tracking
- `jobLogs`: Detailed job processing logs

### Configuration

#### Environment Variables
Backend `.env`:
```
PORT=5003
JWT_SECRET=your-secret
CONVEX_URL=https://your-instance.convex.cloud
COHERE_API_KEY=your-key
OPENAI_API_KEY=your-key
```

Frontend uses Vite's import.meta.env with VITE_ prefix.

#### Matching Configuration
See `backend/src/config/matching.config.ts`:
- Batch sizes, timeouts, confidence thresholds
- Method-specific settings (embedding models, cache TTL)
- Text preprocessing options

### Common Development Tasks

#### Adding New API Endpoint
1. Create controller in `backend/src/controllers/`
2. Add routes in `backend/src/routes/`
3. Register routes in `backend/src/server.ts`
4. Update frontend API client in `frontend/src/lib/api.ts`

#### Modifying Matching Algorithm
1. Main logic in `backend/src/services/matching.service.ts`
2. Enhanced version in `enhancedMatching.service.ts`
3. Configuration in `matching.config.ts`

#### Working with Convex
1. Schema changes in `convex/schema.ts`
2. Functions in respective files (e.g., `convex/priceItems.ts`)
3. Run `npx convex dev` to sync schema changes

### Performance Considerations

- **Caching**: Price items cached in memory (5-minute TTL), embeddings in LRU cache
- **Batch Processing**: Prevents API rate limits and memory issues
- **Virtual Scrolling**: Frontend uses @tanstack/react-virtual for large lists
- **Connection Pooling**: Reused Convex client instances
- **Lazy Loading**: AI clients initialized only when needed
- **Parallel Processing**: HYBRID methods execute all matching strategies concurrently

### Enhanced Matching Features

The system now includes advanced matching capabilities (see `backend/src/services/MATCHING_ENHANCEMENTS.md`):

- **No Fallback Logic**: AI methods no longer fall back to LOCAL on failure
- **Full Price List Matching**: All methods match against entire database
- **Multi-Factor Scoring**: Each method uses multiple scoring factors with detailed breakdowns
- **Technical Extraction**: Extracts specifications, materials, work types, and patterns
- **Smart Unit Handling**: Recognizes compatible units (M/M1/LM, M2/SQM, etc.)
- **Category Detection**: Automatic category inference from descriptions

### Logging and Debugging

- Backend logs to `backend/logs/` with Winston
- Frontend errors caught by ErrorBoundary component
- Job processing logs stored in Convex `jobLogs` table
- Debug logging available via `debugLogger.js` utility