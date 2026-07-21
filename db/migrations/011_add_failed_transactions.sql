CREATE TABLE failed_transactions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  idempotency_key VARCHAR(255),
  payload_json JSON,
  error_message TEXT,
  attempts_made INT,
  failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
