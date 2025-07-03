# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The MJD Price Matcher is a construction industry application that uses AI to match Bill of Quantities (BOQ) items from Excel files with prices from a master database. The system provides multiple matching algorithms and real-time progress tracking via WebSocket connections.

## Key Commands

### Development
```bash
# Install all dependencies (run from root)
npm run install:all

# Start all services concurrently (Convex, Backend, Frontend)
npm run dev

# Individual services
npm run dev:convex    # Convex database
npm run dev:backend   # Express API (port 5000)
npm run dev:frontend  # React app (port 5173)
```

### Backend Development
```bash
cd backend
npm run dev       # Development with hot reload (tsx watch)
npm run build     # TypeScript compilation
npm run start     # Production server
```

### Frontend Development  
```bash
cd frontend
npm run dev      # Vite dev server
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

### Convex Database
```bash
npx convex dev     # Development mode (auto-sync schema)
npx convex deploy  # Deploy to production
```

## Architecture & Key Patterns

### Three-Layer Architecture
1. **Frontend (React SPA)**: 
   - Zustand for auth state management
   - React Query for server state with optimistic updates
   - Socket.io-client for real-time job progress
   - TailwindCSS with shadcn/ui components

2. **Backend (Express API)**: 
   - Service layer pattern for business logic
   - JWT auth with httpOnly refresh tokens
   - WebSocket server for job progress broadcasting
   - Event-driven job processing with EventEmitter

3. **Database (Convex)**: 
   - Serverless database with automatic TypeScript types
   - Real-time subscriptions (not currently used)
   - Transactional consistency

### Authentication Flow
- JWT access tokens (15 minutes) + refresh tokens (7 days)  
- Refresh tokens in httpOnly cookies
- New users require admin approval: `isApproved: true`
- Role-based access: `role: "user" | "admin"`

### Matching System Architecture
```
1. Excel Upload → ExcelService parses with ExcelJS
2. Extract BOQ items → Separate items with/without quantities
3. Context headers (section titles) preserved for display
4. JobProcessor queues job → Process in configurable batches
5. MatchingService runs algorithm → Multiple methods available
6. Results stored in Convex → Real-time WebSocket updates
7. Export results → Original Excel format preserved
```

### Matching Algorithms

**LOCAL**: Fast fuzzy string matching using fuzzball library
**LOCAL_UNIT**: Prioritizes unit compatibility (50% weight to unit match)
**COHERE**: Cohere Embed v4.0 neural embeddings
**OPENAI**: OpenAI text-embedding-3-large embeddings  
**HYBRID**: Runs all AI methods, picks highest confidence
**HYBRID_CATEGORY**: AI with category filtering (30% confidence bonus)
**ADVANCED**: Multi-stage: exact match → code match → fuzzy match

### Key Services

**MatchingService** (`backend/src/services/matching.service.ts`)
- Singleton with lazy AI client initialization
- LRU cache for embeddings (1000 items, 1 hour TTL)
- Resilient error handling with retries
- Supports context headers for better matching

**JobProcessor** (`backend/src/services/jobProcessor.service.ts`)
- Processes jobs sequentially in queue
- Configurable batch size (default 20 items)
- WebSocket progress updates via EventEmitter
- Handles context headers (items without quantities)
- Graceful cancellation support

**ExcelService** (`backend/src/services/excel.service.ts`)
- Auto-detects header rows and columns
- Preserves formatting and row heights
- Extracts context headers (section titles)
- Multi-sheet support
- 50MB file size limit

### Database Schema (Convex)

Key tables:
- `users`: Authentication and authorization
- `aiMatchingJobs`: Job metadata and status
- `matchResults`: Individual match results with context headers
- `priceItems`: Master price database with embeddings
- `clients`: Client management
- `projects`: Project grouping (optional)
- `applicationSettings`: API keys and config

Relationships:
- User → Jobs (one-to-many)
- Job → Results (one-to-many)  
- Client → Projects (one-to-many)
- Project → Jobs (one-to-many)

### Important UI Features

**Context Headers Display**
- Section headers from Excel (e.g., "Groundwork") shown in results
- Yellow highlighted boxes for visual hierarchy
- Preserved throughout matching and export process

**AI Method Restrictions**
- LOCAL, LOCAL_UNIT, ADVANCED methods disable AI re-matching
- Only LOCAL and MANUAL options available in modals
- Automatic fallback to LOCAL when AI disabled

**Real-time Updates**
- WebSocket connection status indicator
- Live progress bars and match counts
- Processing logs with timestamps
- Automatic reconnection on disconnect

### Error Handling Patterns

1. **Resilient Convex Wrapper**: Retry with exponential backoff
2. **React Error Boundary**: Global error UI fallback
3. **WebSocket Cleanup**: Proper listener removal
4. **HTTP Client**: Connection pooling, automatic retries
5. **Rate Limiting**: Intelligent backoff for status polling

### Performance Optimizations

1. **Embeddings Cache**: LRU cache reduces API calls
2. **Batch Processing**: 20 items per batch by default
3. **Virtual Scrolling**: Large result sets (if implemented)
4. **Connection Pooling**: Reuse HTTP connections
5. **Selective Updates**: Only save changed fields

### Environment Configuration

Backend `.env`:
```bash
JWT_ACCESS_SECRET=<random-string>
JWT_REFRESH_SECRET=<random-string>
CONVEX_URL=<from-convex-dashboard>
PORT=5000
```

Frontend `.env`:
```bash
VITE_API_URL=http://localhost:5000/api
```

API Keys: Store in Convex `applicationSettings` table:
- `COHERE_API_KEY`
- `OPENAI_API_KEY`

### Common Issues & Solutions

**Schema Sync Issues**
- Temporary remove new fields from mutations
- Deploy schema changes separately
- Use optional fields during migration

**WebSocket Memory Leaks**
- Always cleanup listeners in useEffect
- Check for duplicate event handlers
- Monitor browser memory usage

**Rate Limiting (429 errors)**
- Implement exponential backoff
- Use WebSocket updates instead of polling
- Batch Convex operations

**Excel Parsing Issues**
- Check for hidden rows/columns
- Verify header detection logic
- Test with various Excel formats

### Testing Approach

**Manual Testing Flow**
1. Create test Excel with known items
2. Upload with different matching methods
3. Verify context headers display
4. Test re-matching functionality
5. Export and verify Excel format

**API Testing**
- Use `/api/test/match` endpoint
- Test individual matching methods
- Verify embeddings cache hit rate
- Monitor processing performance

### Deployment Checklist

1. Set all environment variables in Vercel
2. Deploy Convex schema first: `npx convex deploy`
3. Verify API keys in applicationSettings
4. Test file upload size limits
5. Monitor initial job processing
6. Check WebSocket connectivity

### Recent Updates

- Added context headers (section titles) throughout system
- Implemented AI method restrictions based on job type
- Enhanced Excel parsing with better error handling
- Added re-matching functionality with method selection
- Improved job processing with context header support