# Match Type Switching Behavior

## For AI Jobs (COHERE/OPENAI)

### Initial State
- **Default**: Shows AI match
- **AI Radio**: Enabled and selected
- **Local Radio**: Enabled
- **Manual Radio**: Enabled

### Switching Flow

1. **AI → Local**
   - If local match already exists: Apply stored local match
   - If no local match: Run local test automatically, then apply
   - User can switch back to AI (stored AI match is preserved)

2. **Local → AI**
   - Apply stored AI match (always available for AI jobs)
   - No data loss

3. **Any → Manual**
   - Opens manual search modal
   - User selects and applies
   - Stored as manual match

4. **Manual → AI/Local**
   - Can switch back to stored AI or Local matches
   - Manual selection is preserved

## For LOCAL Jobs

### Initial State
- **Default**: Shows LOCAL match
- **AI Radio**: Hidden (not applicable)
- **Local Radio**: Enabled and selected
- **Manual Radio**: Enabled

### Switching Flow

1. **Local → Manual**
   - Opens manual search modal
   - User selects and applies

2. **Manual → Local**
   - Reverts to original LOCAL match
   - No re-running needed (already stored)

## Key Features

1. **No State Loss**: All match types are stored separately
2. **No Crashes**: Proper error handling and state management
3. **Auto-apply**: LOCAL tests auto-apply when complete
4. **Seamless Switching**: Can switch between any stored match types
5. **Visual Feedback**: Loading spinners, color coding, disabled states

## Color Coding

- **AI Match**: Blue gradient
- **LOCAL Match**: Green gradient  
- **Manual Match**: Purple gradient