CREATE TABLE risk_scores (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  transaction_id BIGINT NOT NULL,
  model_version_id BIGINT NOT NULL,
  score FLOAT,
  decision VARCHAR(255),
  features_json JSON,
  shap_values_json JSON,
  scored_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_risk_scores_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  CONSTRAINT fk_risk_scores_model_version FOREIGN KEY (model_version_id) REFERENCES model_versions(id),
  CONSTRAINT uq_risk_scores_transaction UNIQUE (transaction_id)
);
