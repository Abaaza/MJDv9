# Deployment Notes

## Context Headers Issue (2025-07-02)

The `contextHeaders` field was added to the schema but the deployed Convex functions don't recognize it yet. 

To fix this issue:

1. **Deploy Convex Functions**: Run `npx convex deploy` from the root directory to sync the schema changes
2. **After deployment**, uncomment the `contextHeaders` field in:
   - `/backend/src/services/jobProcessor.service.ts` (3 places)
   - `/convex/priceMatching.ts` (1 place in createMatchResult mutation)

The code has been temporarily modified to work without `contextHeaders` until the Convex functions are redeployed.

### What was changed:
- Commented out `contextHeaders` field in job processor when creating match results
- Removed `contextHeaders` from the createMatchResult mutation args
- All items (with and without quantities) are still being processed
- Context headers are marked with `matchMethod: 'CONTEXT'` and `notes: 'Context header (no quantity)'`

### To restore full functionality:
```bash
# 1. Deploy Convex
npx convex deploy

# 2. Uncomment contextHeaders fields in the code
# 3. Test with a new Excel upload
```