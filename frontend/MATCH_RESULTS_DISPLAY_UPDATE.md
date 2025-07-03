# Match Results Display Update - Section Headers as Dividers

## Summary
Updated the match results display to show context headers (sections) as visual dividers between groups of BOQ items, rather than displaying them inline within each item or in a separate section.

## Changes Made

### 1. Grouping Logic
Added a new function `groupResultsBySection()` that:
- Sorts all results by row number
- Groups items based on their sections
- Creates an array of groups, each with an optional header and its items

### 2. Desktop Table Display
- Section headers now appear as distinct separator rows with:
  - Gray background (`bg-gray-100 dark:bg-gray-800`)
  - Thicker top border (`border-t-2`)
  - Row number in first column
  - Header text spanning all other columns with decorative lines
  - Uppercase text with wide letter spacing for emphasis

### 3. Mobile Card Display
- Section headers appear as separate cards with:
  - Gray background
  - Left border accent (`border-l-4`)
  - Clear visual separation from item cards
  - Compact row number and header text display

### 4. Visual Improvements
- Removed inline context headers from individual items (yellow warning boxes)
- Headers now create clear visual sections in the document flow
- Better hierarchy and organization of BOQ items
- Maintains the original Excel document structure

## Before vs After

### Before:
```
Document Structure & Headers
Row 10: BILL NR 2005 - SUBSTRUCTURES...
Row 16: Extra over excavation...
...

Matched Items (10 items)
Row | Description | [Section: BILL NR 2005 > Extra over...] | ...
14  | 0.25 m maximum depth... | ... |
```

### After:
```
Match Results (10 items, 4 sections)

Row | Description | Matched Item | ...
----|-------------|--------------|----
10  | ——— BILL NR 2005 - SUBSTRUCTURES - PILING ——————————————
14  | 0.25 m maximum depth... | Piling mat design | ...
16  | ——— EXTRA OVER EXCAVATION IRRESPECTIVE OF DEPTH ————————
20  | Below ground water level... | Dispose ground water | ...
```

## Benefits
1. **Clearer Structure**: Section headers now visually separate groups of related items
2. **Better Readability**: Easy to see which items belong to which section
3. **Preserved Context**: Headers still show the document structure but don't clutter item rows
4. **Consistent Experience**: Both desktop and mobile views have the same logical grouping

## Technical Details
- Used `React.Fragment` to group header and item rows in the table
- Filtered items maintain their section grouping
- Search functionality works within grouped structure
- Total calculation still based on actual items only