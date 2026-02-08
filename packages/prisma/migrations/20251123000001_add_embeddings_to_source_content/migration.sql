-- Add embedding column to source_content table
-- Using 1536 dimensions (OpenAI text-embedding-3-small default)
-- Adjust dimensions based on your embedding model
ALTER TABLE source_content 
ADD COLUMN embedding vector(1536);

-- Create an index for fast similarity search using cosine distance
-- IVFFlat is faster for large datasets, but requires some data first
-- For smaller datasets or initial setup, you can use this simpler index:
CREATE INDEX source_content_embedding_idx ON source_content 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Alternative: For smaller datasets or if IVFFlat doesn't work yet:
-- CREATE INDEX source_content_embedding_idx ON source_content 
-- USING hnsw (embedding vector_cosine_ops);

-- Example: Add embeddings to ads table as well
ALTER TABLE ads 
ADD COLUMN embedding vector(1536);

CREATE INDEX ads_embedding_idx ON ads 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

