# Complete BOQ Matching System - 6 Methods

## Overview
Your BOQ matching system now has **6 advanced matching methods**, providing maximum flexibility and accuracy for different use cases.

## The 6 Methods

### 1. LOCAL - Fast Fuzzy Matching
- **Technology**: Fuzzy string matching (fuzzball library)
- **Speed**: Fastest
- **Accuracy**: Basic
- **API Required**: No
- **Context Headers**: ✅ Uses for category/subcategory matching bonus

### 2. COHERE - Hybrid (Embeddings + Rerank v3.5)
- **Technology**: 
  - Step 1: Cohere embed-v4.0 to find top 50 candidates
  - Step 2: Cohere Rerank v3.5 to precisely rank them
- **Speed**: Medium
- **Accuracy**: Excellent
- **API Required**: COHERE_API_KEY
- **Context Headers**: ✅ Includes in query: `Context: [headers] | Item: [desc]`

### 3. COHERE_RERANK - Pure Cohere Rerank
- **Technology**: Cohere Rerank v3.5 only
- **Process**: Fuzzy pre-filter (150 items) → Rerank
- **Speed**: Fast
- **Accuracy**: Very Good
- **API Required**: COHERE_API_KEY
- **Context Headers**: ✅ Includes in query formatting

### 4. QWEN - Hybrid (Cohere Embeddings + Qwen3-8B)
- **Technology**: 
  - Step 1: Cohere embed-v4.0 to find top 50 candidates
  - Step 2: Qwen3-Reranker-8B via DeepInfra API
- **Speed**: Medium
- **Accuracy**: Excellent (different model perspective)
- **API Required**: COHERE_API_KEY + DEEPINFRA_API_KEY
- **Context Headers**: ✅ Full context: `Context: [headers] | Item: [desc] | Unit: [unit]`

### 5. QWEN_RERANK - Pure Qwen3-8B Rerank
- **Technology**: Qwen3-Reranker-8B only via DeepInfra
- **Process**: Fuzzy pre-filter (200 items) → Qwen Rerank
- **Speed**: Fast
- **Accuracy**: Very Good
- **API Required**: DEEPINFRA_API_KEY
- **Context Headers**: ✅ Full hierarchical context included

### 6. OPENAI - GPT Embeddings
- **Technology**: OpenAI text-embedding-3-large
- **Speed**: Medium
- **Accuracy**: Good
- **API Required**: OPENAI_API_KEY
- **Context Headers**: ✅ Uses in embedding generation

## Context Headers Usage

All methods now properly use section headers (context headers) for better matching:

```typescript
// Example with headers: ["Concrete Works", "Foundation", "Reinforcement"]
// The query becomes:
"Context: Concrete Works > Foundation > Reinforcement | Item: Supply concrete m3"
```

This ensures that items are matched not just by description but also by their category context.

## API Configuration

### Admin Settings Page
Go to Admin Settings and configure:
1. **COHERE_API_KEY** - For COHERE and COHERE_RERANK methods
2. **OPENAI_API_KEY** - For OPENAI method
3. **DEEPINFRA_API_KEY** - For QWEN and QWEN_RERANK methods

### Getting API Keys
- **Cohere**: https://dashboard.cohere.com/api-keys
- **OpenAI**: https://platform.openai.com/api-keys
- **DeepInfra**: https://deepinfra.com/dash/api_keys

## Implementation Details

### Backend Changes
1. **matching.service.ts**:
   - Added `qwenHybridMatch()` method
   - Added `qwenRerankMatch()` method
   - Added DeepInfra API key support
   - All methods include context headers in queries

2. **Qwen API Integration**:
   - URL: `https://api.deepinfra.com/v1/inference/Qwen/Qwen3-Reranker-8B`
   - Supports up to 500 documents per request
   - Automatic chunking for larger batches
   - Bearer token authentication

### Frontend Changes
1. **Method Selection**: All 6 methods available in dropdowns
2. **Admin Settings**: New DEEPINFRA_API_KEY field
3. **Job Processing**: All methods recognized as AI methods

## Performance Comparison

| Method | Pre-filter | Semantic Search | Final Ranking | API Calls | Best For |
|--------|-----------|----------------|---------------|-----------|----------|
| LOCAL | Fuzzy (all) | ❌ | Fuzzy score | 0 | Testing/Offline |
| COHERE | Embeddings (top 50) | ✅ | Rerank v3.5 | 2 | High accuracy |
| COHERE_RERANK | Fuzzy (top 150) | ❌ | Rerank v3.5 | 1 | Fast + accurate |
| QWEN | Embeddings (top 50) | ✅ | Qwen3-8B | 2 | Alternative AI |
| QWEN_RERANK | Fuzzy (top 200) | ❌ | Qwen3-8B | 1 | Fast Qwen |
| OPENAI | Embeddings (all) | ✅ | Cosine similarity | 1 | GPT matching |

## Caching Strategy
- **Embeddings**: Cached for 2 hours
- **Rerank Results**: Cached for 30 minutes
- **Price Items**: Cached for 5 minutes
- Reduces API calls and improves performance

## Context Headers Example

When processing a BOQ item with headers:
```
Headers: ["Civil Works", "Concrete", "Foundation"]
Description: "Supply and pour concrete grade 30"
```

Each method formats it appropriately:
- **Query Text**: `Context: Civil Works > Concrete > Foundation | Item: Supply and pour concrete grade 30`
- **Documents**: Include category/subcategory from price items
- **Result**: Better matching accuracy due to context awareness

## Recommendations

### For Best Overall Accuracy
**COHERE** or **QWEN** (Hybrid methods)
- Combine semantic search with precise reranking
- Best for production use

### For Speed with Good Accuracy
**COHERE_RERANK** or **QWEN_RERANK**
- Skip embeddings, go straight to reranking
- Good balance of speed and accuracy

### For Testing Different AI Models
Try both Cohere and Qwen variants to see which works better for your specific data

### For Offline/Testing
**LOCAL** - No API needed, instant results

## Testing the Methods

```typescript
// All methods support the same interface:
const result = await matchingService.matchItem(
  description,        // Item description
  method,            // 'LOCAL' | 'COHERE' | 'COHERE_RERANK' | 'QWEN' | 'QWEN_RERANK' | 'OPENAI'
  priceItems,        // Optional: provide price items
  contextHeaders     // Optional: category headers for context
);
```

## Summary

Your system now offers:
- **6 distinct matching methods**
- **2 reranking models** (Cohere v3.5 and Qwen3-8B)
- **Full context header support** across all methods
- **Smart caching** to reduce API costs
- **Automatic fallback** to LOCAL on API failures
- **No hardcoded API keys** - all from Convex database

The implementation ensures that section headers are properly used as context in all methods, improving matching accuracy especially for items that depend on their category context.