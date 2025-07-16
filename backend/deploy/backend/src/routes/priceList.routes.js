"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const priceList_controller_1 = require("../controllers/priceList.controller");
const router = (0, express_1.Router)();
// All price list routes require authentication
router.use(auth_1.authenticate);
// Get all price items
router.get('/', priceList_controller_1.getAllPriceItems);
// Get price list stats
router.get('/stats', priceList_controller_1.getPriceListStats);
// Export to CSV
router.get('/export', priceList_controller_1.exportCSV);
// Search price items
router.post('/search', priceList_controller_1.searchPriceItems);
// Create new price item (admin only)
router.post('/', auth_1.requireAdmin, priceList_controller_1.createPriceItem);
// Update price item (admin only)
router.patch('/:id', auth_1.requireAdmin, priceList_controller_1.updatePriceItem);
// Import from CSV (admin only)
router.post('/import', auth_1.requireAdmin, upload_1.uploadCSV, priceList_controller_1.importCSV);
// Get import status
router.get('/import/:jobId', priceList_controller_1.getImportStatus);
// Delete all price items (admin only)
router.delete('/all', auth_1.requireAdmin, priceList_controller_1.deleteAllPriceItems);
// Deactivate price item (admin only)
router.delete('/:id', auth_1.requireAdmin, priceList_controller_1.deactivatePriceItem);
exports.default = router;
