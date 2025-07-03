# Fix Context Headers - Quick Guide

## Issue Fixed
The compiled JavaScript files in the convex directory were causing conflicts. They have been removed.

## Steps to Complete the Fix

### 1. Deploy Convex (Required)
Run this command from the project root:
```bash
npx convex dev
```

The deployment should now work without the "Two output files share the same path" errors.

### 2. Restore Context Headers Feature
After Convex is successfully deployed, uncomment the following lines:

#### In `/backend/src/services/jobProcessor.service.ts`:

Line 362:
```typescript
contextHeaders: item.contextHeaders || [], // Remove this field until Convex is updated
```
Should become:
```typescript
contextHeaders: item.contextHeaders || [],
```

Line 415:
```typescript
// contextHeaders: item.contextHeaders || [], // Remove this field until Convex is updated
```
Should become:
```typescript
contextHeaders: item.contextHeaders || [],
```

Line 444:
```typescript
// contextHeaders: item.contextHeaders || [], // Remove this field until Convex is updated
```
Should become:
```typescript
contextHeaders: item.contextHeaders || [],
```

#### In `/convex/priceMatching.ts`:

Line 169:
```typescript
// contextHeaders: v.optional(v.array(v.string())), // Temporarily removed until schema is synced
```
Should become:
```typescript
contextHeaders: v.optional(v.array(v.string())),
```

Line 170:
```typescript
matchedItemId: v.optional(v.string()), // Keep as string for now to match deployed schema
```
Should become:
```typescript
matchedItemId: v.optional(v.id("priceItems")),
```

Line 195:
```typescript
matchedItemId: v.optional(v.string()), // Keep as string for now to match deployed schema
```
Should become:
```typescript
matchedItemId: v.optional(v.id("priceItems")),
```

### 3. Test the Fix
1. Upload a new Excel file with context headers (items without quantities)
2. Verify that all items appear in the results (both with and without quantities)
3. Check that context headers show with `matchMethod: 'CONTEXT'`
4. Export to Excel and verify all items are included

## What Was Fixed
- Removed compiled JS files that were conflicting with TypeScript files
- Temporarily disabled contextHeaders field to allow results to save
- All items (with and without quantities) are now processed and saved
- Context headers are marked with special matchMethod for identification