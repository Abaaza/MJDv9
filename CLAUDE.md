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
npm run dev:backend   # API server (tsx watch src/server.ts)
npm run dev:frontend  # React app (vite)

# Build for production
npm run build:all
npm run build:azure   # Azure-specific build with asset copying
npm run build:production   # Build Convex + all services
```

### Testing & Validation
```bash
# Run comprehensive matching test
cd backend && npx tsx src/tests/comprehensive-test.ts

# Test specific matching scenarios
cd backend && npx tsx src/tests/test-improved-matching.ts
cd backend && npx tsx src/tests/test-construction-matching.ts
cd backend && npx tsx src/tests/test-unit-matching.ts

# Run linting
cd frontend && npm run lint

# TypeScript type checking
cd backend && npm run build    # Uses tsconfig.build.json
cd frontend && npm run build   # tsc && vite build
```

### Database Operations
```bash
# Create admin user
cd backend && npx tsx scripts/create-abaza-admin.ts

# Deploy Convex schema changes
npm run build:convex

# Extract price list from Excel
cd backend && npx tsx src/scripts/extract-pricelist.ts
cd backend && npx tsx src/scripts/extract-consolidated-pricelist.ts
```

## Architecture

### System Overview
MJD Price Matcher is a three-tier AI-powered BOQ matching system:
- **Frontend**: React SPA with real-time updates, React Query for state management
- **Backend**: Express API with job queue processing, Winston logging
- **Database**: Convex serverless database with real-time subscriptions

### Core Matching Flow
1. User uploads Excel BOQ → Parsed by `ExcelService` with header detection
2. Job created in Convex → Processed by `JobProcessor` singleton  
3. Items batched (adaptive 5-20) → Sent to `MatchingService`
4. Results stored with detailed scoring → Exported via Excel/CSV

### Matching Methods Architecture
Each method in `backend/src/services/matching.service.ts` follows this pattern:
- Normalize and extract features from input text
- Apply method-specific matching logic
- Calculate multi-factor confidence scores
- Return top 5 matches with detailed scoring breakdowns

**Method Characteristics**:
- **LOCAL**: Fuzzy string matching with Fuzzball library
- **LOCAL_UNIT**: LOCAL + strict unit matching requirement
- **COHERE**: Semantic embeddings via Cohere API
- **OPENAI**: Semantic embeddings via OpenAI API
- **HYBRID**: Runs all methods in parallel, weighted voting
- **HYBRID_CATEGORY**: HYBRID + category context awareness
- **ADVANCED**: Multi-stage pattern recognition with construction terms
- **ADVANCED_CONSTRUCTION**: Enhanced construction pattern matching

### Key Design Patterns
- **Singleton Services**: `MatchingService.getInstance()`, `JobProcessor.getInstance()`
- **Repository Pattern**: All data access through Convex functions
- **Factory Pattern**: AI client initialization in matching service
- **Observer Pattern**: Job status polling via `useJobPolling` hook
- **Retry Pattern**: Resilient Convex client with exponential backoff

### Authentication Architecture
JWT-based with automatic token refresh:
- Access tokens: 15 minutes (httpOnly cookie)
- Refresh tokens: 7 days (httpOnly cookie)
- Frontend interceptor handles refresh automatically
- Roles: 'User' | 'Admin'
- Auth middleware validates all protected routes

### Caching Strategy
- **Price Items**: 5-minute in-memory cache in MatchingService
- **Embeddings**: LRU cache (1000 items, 1-hour TTL)
- **Match Results**: Stored in Convex per job
- **API Responses**: React Query caching with stale-while-revalidate

### Error Handling
- Resilient Convex client with exponential backoff (3 attempts)
- Graceful degradation for AI services
- Comprehensive error logging to Winston (combined.log, error.log)
- User-friendly error messages via toast notifications

## Key Files & Locations

### Backend Structure
```
backend/
├── src/
│   ├── server.ts                        # Express app entry point
│   ├── lambda.ts                        # AWS Lambda handler
│   ├── services/
│   │   ├── matching.service.ts          # Core matching logic (all methods)
│   │   ├── enhancedMatching.service.ts  # Advanced matching methods
│   │   ├── constructionPatterns.service.ts # Construction-specific patterns
│   │   ├── jobProcessor.service.ts      # Job queue processor singleton
│   │   ├── excel.service.ts             # Excel parsing with header detection
│   │   └── blobStorage.service.ts       # Azure/S3 file storage
│   ├── controllers/                     # Route handlers
│   ├── routes/                          # API route definitions
│   ├── middleware/
│   │   ├── auth.ts                      # JWT validation
│   │   └── upload.ts                    # Multer file upload config
│   └── config/
│       ├── matching.config.ts           # Matching parameters & thresholds
│       └── security.ts                  # CORS, rate limiting config
```

### Frontend Structure
```
frontend/
├── src/
│   ├── App.tsx                          # Main app with routing
│   ├── pages/
│   │   ├── PriceMatching.tsx           # Main matching interface
│   │   ├── PriceList.tsx               # Price list management
│   │   ├── Dashboard.tsx               # Analytics dashboard
│   │   └── Login.tsx                   # Auth forms
│   ├── components/
│   │   ├── LocalMatchResultsModal.tsx  # Match results display
│   │   ├── JobStatusIndicator.tsx      # Real-time job status
│   │   └── VirtualizedTable.tsx        # Performance table rendering
│   ├── lib/
│   │   ├── api.ts                      # Axios API client with interceptors
│   │   └── query-config.ts             # React Query configuration
│   ├── hooks/
│   │   └── useJobPolling.ts            # Real-time job status updates
│   └── stores/
│       └── auth.store.ts               # Zustand auth state management
```

### Convex Schema
```
convex/
├── schema.ts                            # Database schema definitions
├── priceItems.ts                        # Price list CRUD operations
├── aiMatchingJobs.ts                    # Job management & status updates
├── projects.ts                          # Project/client management
└── activityLogs.ts                      # User activity tracking
```

## Performance Optimizations

### Batch Processing
- Adaptive batch sizing (5-20 items) based on processing speed
- Prevents API rate limits and memory issues
- Progress updates after each batch completion
- Configurable via `matching.config.ts`

### Parallel Execution
- HYBRID methods run all matchers concurrently using Promise.allSettled
- Partial failures don't block other methods
- Results aggregated with weighted voting
- Maximum 10 concurrent matches per batch

### Virtual Scrolling
- Large tables use @tanstack/react-virtual
- Only renders visible rows (viewport + buffer)
- Significantly improves UI performance for 1000+ items
- Smooth scrolling with dynamic row heights

### Connection Reuse
- Singleton pattern for service instances
- Convex client connection pooling
- AI clients lazy-loaded and cached
- Database connection kept warm

## Common Tasks

### Add New Matching Method
1. Add method type to `MatchingMethod` enum in types
2. Implement method in `matching.service.ts` following existing patterns
3. Add configuration in `matching.config.ts` (thresholds, weights)
4. Update frontend method selector dropdown
5. Add tests in `backend/src/tests/`

### Modify Matching Weights
Edit `backend/src/config/matching.config.ts`:
- `thresholds.minConfidence`: Minimum confidence per method
- `weights`: Method weight in hybrid voting
- `thresholds.*Bonus`: Score bonuses for specific matches
- `performance.maxBatchSize`: Batch size limits

### Add New API Endpoint
1. Create controller method in `backend/src/controllers/`
2. Define route in `backend/src/routes/`
3. Register route in `backend/src/server.ts`
4. Add API method in `frontend/src/lib/api.ts`
5. Create React Query hook if needed

### Debug Matching Issues
1. Check `backend/logs/combined.log` for detailed matching logs
2. Use `backend/src/tests/comprehensive-test.ts` with specific items
3. Review job logs in Convex dashboard
4. Enable `enableDetailedLogging` in matching config
5. Check match confidence scores and factors in results

### Handle Excel Format Issues
1. Test with `backend/src/tests/analyze-excel-formats.ts`
2. Check header detection in `excel.service.ts`
3. Verify column mappings in parsing logic
4. Use `debug-header-detection.ts` for troubleshooting

## Deployment Considerations

### Environment Variables
Backend requires:
- `CONVEX_URL`: Database connection string
- `CONVEX_DEPLOY_KEY`: Deployment authentication
- `JWT_SECRET`, `JWT_REFRESH_SECRET`: Auth token secrets
- `COHERE_API_KEY`, `OPENAI_API_KEY`: AI services (optional)
- `AZURE_STORAGE_CONNECTION_STRING`: File storage (Azure)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: File storage (AWS)

Frontend requires:
- `VITE_API_URL`: Backend API endpoint
- `VITE_CONVEX_URL`: Database connection

### Deployment Targets
- **Vercel**: Serverless functions in `/api` directory
- **Azure**: App Service with Node.js 20.x runtime
- **AWS Lambda**: Using serverless framework
- **Local**: Full stack with hot reload

### Production Checklist
1. Set NODE_ENV=production
2. Configure CORS origins in `backend/src/config/security.ts`
3. Use strong JWT secrets (32+ characters)
4. Enable HTTPS on all endpoints
5. Configure Winston log levels and transports
6. Set up rate limiting for API endpoints
7. Configure blob storage (Azure or S3)
8. Set proper file upload limits
9. Enable Convex production deployment
10. Configure monitoring and alerts