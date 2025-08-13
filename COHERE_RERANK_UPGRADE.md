# Cohere Rerank v3.5 Integration - Complete

## Summary
Successfully upgraded the BOQ matching system from Cohere embeddings (embed-v4.0) to **Cohere Rerank v3.5** for superior matching accuracy.

## What Changed

### 1. Backend Updates (`backend/src/services/matching.service.ts`)

#### Imports
- Changed from `CohereClient` to `CohereClientV2` for v2 API support

#### New Features Added
- **Rerank Cache**: Added LRU cache specifically for rerank results (30-minute TTL)
- **Pre-filtering Method**: Added `preFilterCandidates()` to reduce API calls by pre-filtering top 150-200 candidates using fuzzy matching
- **Clean Description Helper**: Added `cleanDescription()` for text normalization

#### Core Algorithm Change
The `cohereMatch()` method now:
1. Pre-filters candidates using fuzzy matching (top 150 items)
2. Formats candidates with rich context (description, category, unit, code)
3. Calls Cohere Rerank v3.5 API with the query and candidates
4. Returns the highest-ranked result with confidence score
5. Falls back to LOCAL matching if API fails

### 2. Key Improvements

#### Before (Embeddings-based):
- Generated embeddings for query and all items
- Calculated cosine similarity
- Selected highest similarity as best match
- Less context-aware, more prone to errors

#### After (Rerank v3.5):
- Uses advanced transformer models
- Understands context and relationships better
- More accurate for construction terminology
- Better unit matching (m2, sqm, etc.)
- Better category/subcategory awareness

### 3. Performance Optimizations
- **Pre-filtering**: Only sends top 150 candidates to Rerank API (reduces costs)
- **Caching**: Results cached for 30 minutes
- **Batch limit**: Max 1000 documents per request (Cohere limit)
- **Token limit**: 512 tokens per document to optimize performance

## How to Use

### 1. Set API Key
Go to Admin Settings in the application and add your `COHERE_API_KEY`

### 2. Select COHERE Method
When processing BOQ files, select "COHERE" as the matching method. It will automatically use Rerank v3.5 internally.

### 3. Testing
Run the test script to verify the integration:
```bash
cd backend
node test-rerank-final.js
```

## API Key Required
Get your Cohere API key from: https://dashboard.cohere.com/api-keys

## Backward Compatibility
- Frontend continues to see method as "COHERE" for compatibility
- No frontend changes required
- Existing workflows remain unchanged

## Expected Results
- **Higher accuracy**: Rerank v3.5 provides more accurate matches than embeddings
- **Better context understanding**: Handles construction terminology better
- **Improved unit matching**: Better at matching items with correct units
- **Category awareness**: Uses category/subcategory information more effectively

## Fallback Behavior
If Rerank API fails (rate limit, network issues, etc.), the system automatically falls back to LOCAL fuzzy matching to ensure continuity.

## Cost Considerations
- Rerank API is more cost-effective than embeddings for matching
- Pre-filtering reduces API calls significantly
- Caching further reduces repeated API calls

## Technical Details
- Model: `rerank-v3.5`
- Max context: 4096 tokens
- Max documents per request: 1000 (we use 150)
- Returns relevance scores normalized 0-1

## Next Steps
1. Add API key in Admin Settings
2. Test with sample BOQ files
3. Monitor confidence scores
4. Adjust pre-filtering threshold if needed (currently 150 candidates)