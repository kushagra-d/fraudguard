CREATE TABLE model_versions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version VARCHAR(255),
  precision_score FLOAT,
  recall_score FLOAT,
  is_active BOOLEAN DEFAULT TRUE,
  trained_at TIMESTAMP
);
