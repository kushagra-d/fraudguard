CREATE TABLE analyst_reviews (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  transaction_id BIGINT NOT NULL,
  analyst_id BIGINT NOT NULL,
  decision VARCHAR(255),
  notes TEXT,
  reviewed_at TIMESTAMP,
  CONSTRAINT fk_analyst_reviews_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  CONSTRAINT fk_analyst_reviews_analyst FOREIGN KEY (analyst_id) REFERENCES users(id)
);
