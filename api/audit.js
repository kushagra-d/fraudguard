const pool = require('./db');

async function logAudit(actorId, action, entityType, entityId, metadata) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata_json) VALUES (?, ?, ?, ?, ?)',
      [actorId, action, entityType, entityId, JSON.stringify(metadata || {})]
    );
  } catch (err) {
    // The primary action already succeeded by the time this runs - a logging
    // failure shouldn't undo it or fail the response, just be visible.
    console.error(`Audit log write failed (action=${action}, entity_id=${entityId}):`, err.message);
  }
}

module.exports = { logAudit };
