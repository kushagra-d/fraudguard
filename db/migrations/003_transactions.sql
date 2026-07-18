CREATE TABLE transactions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id BIGINT NOT NULL,
  merchant_id BIGINT NOT NULL,
  amount DECIMAL(10, 2),
  currency VARCHAR(255),
  txn_timestamp TIMESTAMP,
  device_fingerprint VARCHAR(255),
  geo_country VARCHAR(255),
  status VARCHAR(255) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_transactions_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT fk_transactions_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);
