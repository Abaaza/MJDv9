import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ClientPriceListController } from '../controllers/clientPriceList.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new ClientPriceListController();

// Ensure temp_uploads directory exists
const uploadDir = path.join(process.cwd(), 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for Excel file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `client-price-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are allowed'));
    }
  }
});

// All routes require authentication
router.use(authenticate);

// Create a new price list
router.post('/price-lists', controller.createPriceList.bind(controller));

// Upload and sync Excel file with client price list
router.post(
  '/price-lists/upload-sync',
  upload.single('file'),
  controller.uploadAndSyncExcel.bind(controller)
);

// Get all price lists for a client
router.get('/clients/:clientId/price-lists', controller.getClientPriceLists.bind(controller));

// Get effective prices for items for a specific client
router.post('/clients/:clientId/effective-prices', controller.getEffectivePrices.bind(controller));

// Update a price list
router.patch('/price-lists/:id', controller.updatePriceList.bind(controller));

// Get mapping statistics for a price list
router.get('/price-lists/:priceListId/mapping-stats', controller.getMappingStats.bind(controller));

// Verify or update a mapping
router.patch('/mappings/:mappingId/verify', controller.verifyMapping.bind(controller));

export default router;