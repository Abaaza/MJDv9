"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const clients_controller_1 = require("../controllers/clients.controller");
const router = (0, express_1.Router)();
// All client routes require authentication
router.use(auth_1.authenticate);
// Get all clients
router.get('/', clients_controller_1.getAllClients);
// Get active clients only
router.get('/active', clients_controller_1.getActiveClients);
// Create new client
router.post('/', clients_controller_1.createClient);
// Update client
router.put('/:id', clients_controller_1.updateClient);
router.patch('/:id', clients_controller_1.updateClient);
// Delete client
router.delete('/:id', clients_controller_1.deleteClient);
exports.default = router;
