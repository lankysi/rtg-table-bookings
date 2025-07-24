const express = require('express');
const router = express.Router();

router.get('/:date', (req, res) => {
  // Example protected route
  res.json({ message: `Booking data for ${req.params.date}` });
});

module.exports = router;