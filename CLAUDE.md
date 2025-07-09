# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Install all dependencies
npm run install:all

# Run full stack (Convex + Backend + Frontend)
npm run dev

# Run individual services
npm run dev:convex    # Database
npm run dev:backend   # API server
npm run dev:frontend  # React app

# Build for production
npm run build:all
npm run build:azure   # Azure-specific build
```

### Testing & Validation
```bash
# Run comprehensive matching test
cd backend && npx tsx src/tests/comprehensive-test.ts

# Run linting
cd frontend && npm run lint

# TypeScript type checking
cd backend && npm run build
cd frontend && npm run build
```

### Database Operations
```bash
# Create admin user
cd backend && npx tsx scripts/create-abaza-admin.ts

# Deploy Convex schema changes
npm run build:convex
```

## Architecture

### System Overview
MJD Price Matcher is a three-tier AI-powered BOQ matching system:
- **Frontend**: React SPA with real-time updates
- **Backend**: Express API with job queue processing
- **Database**: Convex serverless database

### Core Matching Flow
1. User uploads Excel BOQ → Parsed by `ExcelService`
2. Job created in Convex → Processed by `JobProcessor` singleton
3. Items batched (default: 10) → Sent to `MatchingService`
4. Results stored → Exported via `exportService`

### Matching Methods Architecture
Each method in `backend/src/services/matching.service.ts` follows this pattern:
- Extract features from input text
- Query/compare against price list items
- Calculate multi-factor confidence scores
- Return top matches with detailed scoring breakdowns

**Method Characteristics**:
- LOCAL/LOCAL_UNIT: Fuzzy string matching, no AI required
- COHERE/OPENAI: Require API keys, use embeddings
- HYBRID/HYBRID_CATEGORY: Execute all methods in parallel, vote on results
- ADVANCED: Multi-stage pattern recognition

### Key Design Patterns
- **Singleton Services**: `MatchingService.getInstance()`, `JobProcessor.getInstance()`
- **Repository Pattern**: All data access through Convex functions
- **Factory Pattern**: AI client initialization in matching service
- **Observer Pattern**: Job status polling/WebSocket updates

### Authentication Architecture
JWT-based with automatic token refresh:
- Access tokens: 15 minutes
- Refresh tokens: 7 days
- Frontend interceptor handles refresh automatically
- Roles: 'User' | 'Admin'

### Caching Strategy
- **Price Items**: 5-minute in-memory cache
- **Embeddings**: LRU cache (100 items max)
- **Match Results**: Cached per job until completion

### Error Handling
- Resilient Convex client with exponential backoff
- Graceful degradation for AI services
- Comprehensive error logging to Winston

## Key Files & Locations

### Backend Structure
```
backend/
├── src/
│   ├── server.ts                 # Express app entry point
│   ├── services/
│   │   ├── matching.service.ts   # Core matching logic
│   │   ├── enhancedMatching.service.ts  # Enhanced methods
│   │   └── jobProcessor.ts       # Job queue processor
│   ├── controllers/              # Route handlers
│   ├── routes/                   # API route definitions
│   └── config/
│       └── matching.config.ts    # Matching parameters
```

### Frontend Structure
```
frontend/
├── src/
│   ├── App.tsx                   # Main app component
│   ├── pages/                    # Route components
│   ├── components/               # Reusable UI components
│   ├── lib/
│   │   ├── api.ts               # API client
│   │   └── convex.ts            # Convex client setup
│   └── stores/                   # Zustand state management
```

### Convex Schema
```
convex/
├── schema.ts                     # Database schema
├── priceItems.ts                # Price list operations
├── aiMatchingJobs.ts            # Job management
└── matchResults.ts              # Match result operations
```

## Performance Optimizations

### Batch Processing
- Items processed in configurable batches (see `matching.config.ts`)
- Prevents API rate limits and memory issues
- Progress updates after each batch

### Parallel Execution
- HYBRID methods run all matchers concurrently
- Promise.allSettled ensures partial failures don't block
- Results aggregated with weighted voting

### Virtual Scrolling
- Large lists use @tanstack/react-virtual
- Only renders visible items
- Significantly improves UI performance

### Connection Reuse
- Singleton pattern for service instances
- Convex client connection pooling
- AI clients lazy-loaded and cached

## Common Tasks

### Add New Matching Method
1. Add method type to `MatchingMethod` enum
2. Implement in `matching.service.ts` following existing patterns
3. Add configuration in `matching.config.ts`
4. Update frontend method selector

### Modify Matching Weights
Edit `backend/src/config/matching.config.ts`:
- Adjust confidence thresholds
- Change scoring weights
- Modify text preprocessing options

### Add New API Endpoint
1. Create controller in `backend/src/controllers/`
2. Define routes in `backend/src/routes/`
3. Register in `backend/src/server.ts`
4. Add to frontend API client

### Debug Matching Issues
1. Check `backend/logs/` for detailed logs
2. Use comprehensive test script with specific items
3. Review job logs in Convex dashboard
4. Enable debug logging in `matching.service.ts`

## Deployment Considerations

### Environment Variables
Backend requires:
- `CONVEX_URL`: Database connection
- `JWT_SECRET`, `JWT_REFRESH_SECRET`: Auth tokens
- `COHERE_API_KEY`, `OPENAI_API_KEY`: AI services (optional)

Frontend requires:
- `VITE_API_URL`: Backend API endpoint
- `VITE_CONVEX_URL`: Database connection

### Deployment Targets
- **Vercel**: Uses `/api` serverless functions
- **Azure**: Traditional Node.js deployment
- **Local**: Full stack with hot reload

### Production Checklist
1. Set NODE_ENV=production
2. Configure proper CORS origins
3. Use secure JWT secrets
4. Enable HTTPS
5. Set up proper logging
6. Configure rate limiting