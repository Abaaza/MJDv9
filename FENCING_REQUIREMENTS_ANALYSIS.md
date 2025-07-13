# The Fencing People - Requirements Analysis

## Executive Summary

Based on the email and sample files provided, The Fencing People needs a comprehensive quotation system that can:
1. Process various types of customer inquiries (B2B detailed BOQs and simple end-user requests)
2. Provide instant quotations during live customer calls
3. Generate Bills of Materials (BOM) with per-meter rates
4. Integrate with Odoo for quote management
5. Prepare and email professional quotes

## Customer Inquiry Types

### Type 1: B2B Detailed BOQ Files
- **Format**: Excel files with structured data
- **Contains**: Reference codes, descriptions, quantities, units
- **Example**: "Fencing Pricing Document" with items like:
  - BT-B-R: 2000mm high post and concrete panel (283 lin.m)
  - BT-A: Concrete post with timber hit and miss fencing (550 lin.m)
  - Gates: Various specifications (G1, G2, G3)

### Type 2: End-User Simple Requests
- **Format**: Email/phone inquiries with basic requirements
- **Contains**: Basic specifications without detailed measurements
- **Example**: Glenswilly GAA Club request:
  - 2.4m high fence
  - 5mm 4 crimp panel
  - 60 x 60 x 2mm galvanized posts
  - 2 x 4m wide gates
  - Single fire exit gate
  - 70m long

## Key System Requirements

### 1. Interactive Quotation Builder
- **Dynamic questioning**: Next question prompted by previous answer
- **Real-time calculation**: Instant pricing as information is entered
- **Guided workflow**: Help users provide all necessary details

### 2. Product Database Structure
Based on the analyzed files, the system needs to handle:

#### Fencing Types:
- Concrete post and panel systems
- Timber post and rail fencing
- Galvanized wire fencing
- Mesh fencing (powder coated)
- Hit and miss fencing

#### Components:
- Posts (various materials and dimensions)
- Panels (concrete, timber, mesh)
- Gates (single, double, fire exit, barrier)
- Fixings and accessories

#### Specifications:
- Height (above ground)
- Materials (concrete, timber, galvanized steel)
- Finishes (powder coated, galvanized)
- Dimensions (post sizes, panel heights)

### 3. Calculation Requirements
- **Linear meter rates**: Most fencing priced per linear meter
- **Component pricing**: Gates and special items by unit
- **Installation costs**: Supply and installation combined
- **VAT calculation**: Include/exclude VAT options

### 4. BOM Generation
- List all components needed for the job
- Calculate quantities based on fence length
- Include posts, panels, gates, fixings
- Generate material takeoff

### 5. Quote Output Requirements
- Professional quote format
- Customer details
- Itemized pricing
- Total job cost
- Per meter rate breakdown
- Terms and conditions
- Validity period

## Implementation Approach

### Phase 1: Core System Updates
1. Update data model for fencing products
2. Create fencing-specific matching algorithms
3. Build product catalog with standard items

### Phase 2: Interactive Quotation Builder
1. Design conversational UI flow
2. Implement dynamic question logic
3. Build real-time calculation engine

### Phase 3: BOM and Quote Generation
1. Create BOM generation logic
2. Design quote templates
3. Implement email functionality

### Phase 4: Integration and Enhancement
1. Odoo integration for quote management
2. Advanced pricing rules
3. Mobile-friendly interface for field use

## Data Model Requirements

### Products Table
- Product code
- Description
- Category (fence type, gate, accessory)
- Unit (lin.m, nr, m2)
- Base price
- Installation price
- Material specifications
- Height/dimensions
- Finish options

### Quote Items
- Product reference
- Quantity
- Unit price
- Installation price
- Total price
- Special requirements

### Customer Quotes
- Customer details
- Project location
- Quote items
- Total value
- Status
- Validity period

## Success Criteria
1. Reduce quote preparation time from hours to minutes
2. Enable instant pricing during customer calls
3. Standardize pricing across all quotes
4. Improve quote accuracy and completeness
5. Streamline the quote-to-order process