# Vector Embeddings with pgvector

This directory contains utilities for working with vector embeddings in PostgreSQL using the pgvector extension.

## Setup

### 1. Install pgvector Extension

The extension is enabled via migration. Choose your deployment method:

#### For Local Development:
```bash
# Make sure your .env has DATABASE_URL set
cd packages/prisma
pnpm migrate:deploy
```

#### For Production:

**Option A: Via Bastion (Recommended)**
```bash
# Terminal 1: Start port forwarding
./scripts/connect-production-db.sh

# Terminal 2: Deploy migrations
./scripts/deploy-production-migrations-via-bastion.sh
```

**Option B: Direct via SSM**
```bash
./scripts/deploy-migrations.sh --env prod
```

**Interactive Setup Script**
```bash
# This will guide you through the deployment options
./scripts/setup-vector-embeddings.sh
```

### 2. Choose Embedding Model

Common embedding models and their dimensions:
- **OpenAI text-embedding-3-small**: 1536 dimensions (default in our migrations)
- **OpenAI text-embedding-3-large**: 3072 dimensions
- **OpenAI text-embedding-ada-002**: 1536 dimensions (legacy)
- **Cohere embed-english-v3.0**: 1024 dimensions
- **Anthropic Claude**: Varies by model

If you need different dimensions, update the migration files before running them.

### 3. Install Dependencies (if needed)

For working with embeddings in your application:
```bash
pnpm add openai  # For OpenAI embeddings
# or
pnpm add @anthropic-ai/sdk  # For Anthropic embeddings
# or
pnpm add cohere-ai  # For Cohere embeddings
```

## Usage Examples

### Creating Embeddings

```typescript
import { OpenAI } from 'openai';
import { prisma } from '@kit/prisma';
import { storeEmbedding } from '@kit/prisma/vector-utils';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Generate embedding for source content
async function embedSourceContent(sourceId: string, text: string) {
  // Get embedding from OpenAI
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  
  const embedding = response.data[0].embedding;
  
  // Store in database
  await storeEmbedding(prisma, 'source_content', sourceId, embedding);
}
```

### Searching Similar Content

```typescript
import { searchSimilarSourceContent } from '@kit/prisma/vector-utils';

async function findSimilarContent(queryText: string, userId: string) {
  // Generate embedding for the query
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: queryText,
  });
  
  const queryEmbedding = response.data[0].embedding;
  
  // Search for similar content
  const results = await searchSimilarSourceContent(
    prisma,
    queryEmbedding,
    userId,
    10 // limit
  );
  
  return results;
}
```

### Bulk Embedding Update

```typescript
async function embedAllSourceContent() {
  const sourceContents = await prisma.sourceContent.findMany({
    where: {
      embedding: null,
      status: 'RETRIEVED'
    }
  });
  
  for (const content of sourceContents) {
    // Get text from file or other source
    const text = await getTextContent(content.id);
    
    // Generate embedding
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    
    const embedding = response.data[0].embedding;
    
    // Store embedding
    await storeEmbedding(prisma, 'source_content', content.id, embedding);
    
    // Add delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
```

## Index Types

pgvector supports two index types:

### IVFFlat (Inverted File with Flat Compression)
- **Best for**: Large datasets (>10k vectors)
- **Trade-off**: Fast queries, approximate results
- **Memory**: Less memory intensive
- **Build time**: Slower to build, requires some data

```sql
CREATE INDEX embedding_idx ON table_name 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### HNSW (Hierarchical Navigable Small World)
- **Best for**: High accuracy requirements
- **Trade-off**: Slower queries, better recall
- **Memory**: More memory intensive
- **Build time**: Faster to build

```sql
CREATE INDEX embedding_idx ON table_name 
USING hnsw (embedding vector_cosine_ops);
```

## Distance Metrics

### Cosine Distance (Recommended for semantic similarity)
```sql
ORDER BY embedding <=> query_vector
```
- Range: 0-2 (0 = identical, 2 = opposite)
- Similarity: `1 - distance`
- Use case: Text embeddings, semantic search

### L2 Distance (Euclidean)
```sql
ORDER BY embedding <-> query_vector
```
- Range: 0-∞ (0 = identical)
- Similarity: `1 / (1 + distance)`
- Use case: When magnitude matters

### Inner Product (Dot product)
```sql
ORDER BY embedding <#> query_vector
```
- Range: -∞ to +∞
- Note: Returns negative value, so smaller is more similar
- Use case: When vectors are normalized

## Performance Tips

1. **Batch Operations**: Create embeddings in batches to reduce API costs
2. **Index After Bulk Load**: Build indexes after loading large amounts of data
3. **Dimension Reduction**: Consider using smaller embedding models for faster queries
4. **Cache Embeddings**: Cache frequently used query embeddings
5. **Async Processing**: Generate embeddings asynchronously (e.g., background jobs)

## Cost Optimization

OpenAI pricing (as of Nov 2023):
- text-embedding-3-small: $0.00002 / 1K tokens
- text-embedding-3-large: $0.00013 / 1K tokens

For 10,000 documents averaging 500 tokens each:
- Small model: ~$0.10
- Large model: ~$0.65

## Security Considerations

- Store embeddings but keep original sensitive text separate
- Embeddings can potentially leak information about the original text
- Consider encryption at rest for highly sensitive data
- Implement proper access controls (RLS) on tables with embeddings

## Troubleshooting

### "extension does not exist"
Run the extension migration first:
```bash
pnpm --filter @kit/prisma migrate:deploy
```

### "lists parameter must be between 1 and [number]"
IVFFlat requires sufficient data. Either:
- Add more data before creating index
- Reduce lists parameter
- Use HNSW index instead temporarily

### "dimension mismatch"
Ensure all embeddings use the same model and dimensions.

