# Importing Fencing Price List Data

## Overview
Two CSV files have been created with comprehensive fencing price list data for testing:

1. **fencing_pricelist_mockup.csv** - Core fencing items (45 items)
2. **fencing_pricelist_extended.csv** - Extended catalog (45 additional items)

## CSV Structure
The CSV files include the following columns:
- **code**: Unique product code (e.g., POST-T100, GATE-S900)
- **description**: Full product description
- **unit**: Unit of measurement (nr, m, m2, set, bag, etc.)
- **rate**: Combined supply + installation rate
- **supplyOnlyRate**: Material cost only
- **installationRate**: Labor cost only
- **category**: Main category (always "Fencing")
- **subcategory**: Product subcategory (Posts, Rails, Panels, Gates, etc.)
- **productType**: Type identifier (post, rail, panel, gate, fence, accessory)
- **height**: Height in mm (where applicable)
- **width**: Width in mm (where applicable)
- **length**: Length in mm (where applicable)
- **material_type**: Material (timber, steel, concrete, aluminum, composite)
- **material_finish**: Finish type (galvanized, powder-coated, pressure-treated, etc.)
- **panelType**: Panel type for panels (closeboard, hit-and-miss, etc.)
- **meshSize**: Mesh aperture size (for mesh products)
- **perMeterRate**: Rate per linear meter (for continuous fencing)

## Product Categories Included

### 1. Posts
- Timber posts (various sizes)
- Concrete posts (slotted)
- Steel posts (galvanized, painted, stainless)
- Aluminum posts

### 2. Rails
- Timber rails (arris, cant)
- Steel rails
- Aluminum rails

### 3. Panels
- Timber panels (closeboard, hit & miss, waney edge, picket)
- Concrete panels and gravel boards
- Composite panels
- Acoustic panels

### 4. Mesh & Wire
- Chain link mesh (various heights)
- Welded mesh panels
- 358 prison mesh
- Euro fence panels
- V-mesh panels

### 5. Gates
- Single pedestrian gates
- Double vehicle gates
- Fire exit gates
- Automatic barrier gates
- Sliding gates
- Gate automation kits

### 6. Complete Systems
- BT spec systems
- Post & rail systems
- Chain link systems
- Security fencing

### 7. Agricultural
- Stock fencing rolls
- Deer fencing
- Electric fence components

### 8. Accessories
- Fixings and clips
- Wire products
- Concrete and postcrete
- Privacy screens
- Anti-climb products
- Foundation items

## Import Instructions

### Using the Price List Import Feature
1. Navigate to **Admin Settings** → **Price List Management**
2. Click **Import Price List**
3. Select either CSV file
4. Map columns if needed (should auto-detect)
5. Click **Import**

### Using the Backend Script
```bash
cd backend
npx tsx scripts/import-fencing-prices.ts ../fencing_pricelist_mockup.csv
```

### Direct Database Import
You can also use the Convex dashboard to import the data directly:
1. Go to your Convex dashboard
2. Navigate to the `priceItems` table
3. Use the import feature with the CSV

## Testing Scenarios

### 1. Quote Builder Testing
- Create quotes for common scenarios:
  - 50m garden fence (timber post & rail)
  - 100m security fence (chain link with gates)
  - 200m commercial boundary (concrete posts & panels)

### 2. BOQ Matching Testing
Create test BOQ files with descriptions like:
- "Supply and install 1.8m high timber fence"
- "Chain link fencing 2m high with double gates"
- "Concrete post and panel system BT-B-R spec"

### 3. Search Testing
Test the search functionality with:
- Material types: "galvanized", "timber", "concrete"
- Heights: "1800mm", "2m", "2400"
- Product types: "gate", "post", "panel"

## Sample BOQ Format
```
Item | Description | Unit | Quantity
-----|-------------|------|----------
1 | Timber fence posts 100x100x2400mm pressure treated | nr | 25
2 | Timber closeboard panels 1800x1800mm | nr | 20
3 | Single pedestrian gate 900mm galvanized | nr | 1
4 | Postcrete fast setting concrete 20kg | bag | 25
```

## Notes
- All prices are in EUR (€)
- VAT is calculated separately (23% Irish VAT rate)
- Installation rates are estimates and may vary by location
- Per-meter rates are calculated for continuous fencing systems
- Some items like paint and concrete are supply-only