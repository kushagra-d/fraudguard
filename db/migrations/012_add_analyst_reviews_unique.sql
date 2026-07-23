ALTER TABLE analyst_reviews ADD CONSTRAINT uq_analyst_reviews_transaction UNIQUE (transaction_id);
