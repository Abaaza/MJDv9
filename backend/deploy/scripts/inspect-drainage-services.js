"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const exceljs_1 = __importDefault(require("exceljs"));
const path_1 = __importDefault(require("path"));
async function inspectProblematicSheets() {
    try {
        const filePath = path_1.default.join(process.cwd(), '..', 'MJD-PRICELIST.xlsx');
        const workbook = new exceljs_1.default.Workbook();
        await workbook.xlsx.readFile(filePath);
        const sheets = ['Drainage', 'Services', 'External Works'];
        for (const sheetName of sheets) {
            const worksheet = workbook.getWorksheet(sheetName);
            if (!worksheet)
                continue;
            console.log(`\n\n===== ${sheetName} Sheet Analysis =====`);
            console.log(`Rows: ${worksheet.rowCount}, Columns: ${worksheet.columnCount}`);
            // Find rows with data
            let rowsWithData = 0;
            let rowsWithRates = 0;
            console.log('\nRows with potential price data (showing first 50):');
            for (let i = 1; i <= Math.min(worksheet.rowCount, 200); i++) {
                const row = worksheet.getRow(i);
                const values = [];
                let hasData = false;
                let rateValue = null;
                for (let j = 1; j <= Math.min(worksheet.columnCount, 10); j++) {
                    const cell = row.getCell(j);
                    const value = cell.value;
                    if (value) {
                        hasData = true;
                        let displayValue = '';
                        if (typeof value === 'object' && 'result' in value) {
                            displayValue = `${value.result}`;
                            // Check if this looks like a rate
                            const numVal = parseFloat(value.result);
                            if (!isNaN(numVal) && numVal > 0 && j >= 5 && j <= 8) {
                                rateValue = numVal;
                            }
                        }
                        else if (typeof value === 'object') {
                            displayValue = '[object]';
                        }
                        else {
                            displayValue = value.toString().substring(0, 30);
                            // Check if this looks like a rate
                            const numVal = parseFloat(value.toString());
                            if (!isNaN(numVal) && numVal > 0 && j >= 5 && j <= 8) {
                                rateValue = numVal;
                            }
                        }
                        if (displayValue) {
                            values.push(`[${j}]: ${displayValue}`);
                        }
                    }
                }
                if (hasData) {
                    rowsWithData++;
                    if (rateValue) {
                        rowsWithRates++;
                        if (rowsWithRates <= 50) {
                            console.log(`Row ${i}: ${values.join(' | ')}`);
                        }
                    }
                }
            }
            console.log(`\nSummary: ${rowsWithData} rows with data, ${rowsWithRates} rows with rate values`);
        }
    }
    catch (error) {
        console.error('Error:', error);
    }
}
inspectProblematicSheets();
//# sourceMappingURL=inspect-drainage-services.js.map