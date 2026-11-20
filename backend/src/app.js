const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/requisitions', require('./routes/requisitions.routes'));
app.use('/api/items', require('./routes/items.routes'));
app.use('/api/suppliers', require('./routes/suppliers.routes'));
app.use('/api/purchase-orders', require('./routes/purchaseOrders.routes'));
app.use('/api/inventory', require('./routes/inventory.routes'));
app.use('/api/audit-log', require('./routes/audit.routes'));
app.use('/api/reports', require('./routes/reports.routes'));
app.use('/api/audit-log', require('./routes/audit.routes'));
app.use('/api', require('./routes/lookup.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
