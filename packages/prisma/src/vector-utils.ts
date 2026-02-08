/**
 * Utility functions for working with vector embeddings in PostgreSQL with pgvector
 * 
 * Since Prisma doesn't natively support the vector type, we use raw SQL queries
 * for vector operations like similarity search.
 */

import { PrismaClient } from '@prisma/client';

export interface VectorSearchResult {
  id: string;
  distance: number;
  [key: string]: any;
}

/**
 * Perform cosine similarity search on embeddings
 * 
 * @param prisma - Prisma client instance
 * @param table - Table name to search in
 * @param embedding - The query embedding vector (as array of numbers)
 * @param limit - Maximum number of results to return
 * @param threshold - Optional similarity threshold (0-1, where 1 is identical)
 * @returns Array of results with similarity scores
 */
export async function searchSimilarEmbeddings(
  prisma: PrismaClient,
  table: string,
  embedding: number[],
  limit: number = 10,
  threshold?: number
): Promise<VectorSearchResult[]> {
  // Convert embedding array to PostgreSQL vector format
  const embeddingStr = `[${embedding.join(',')}]`;
  
  // Build the query
  const thresholdClause = threshold 
    ? `AND (1 - (embedding <=> '${embeddingStr}'::vector)) >= ${threshold}`
    : '';
  
  const query = `
    SELECT 
      id,
      1 - (embedding <=> '${embeddingStr}'::vector) as similarity,
      embedding <=> '${embeddingStr}'::vector as distance
    FROM ${table}
    WHERE embedding IS NOT NULL
    ${thresholdClause}
    ORDER BY embedding <=> '${embeddingStr}'::vector
    LIMIT ${limit}
  `;
  
  const results = await prisma.$queryRawUnsafe<VectorSearchResult[]>(query);
  return results;
}

/**
 * Store an embedding vector for a record
 * 
 * @param prisma - Prisma client instance
 * @param table - Table name
 * @param id - Record ID
 * @param embedding - The embedding vector (as array of numbers)
 */
export async function storeEmbedding(
  prisma: PrismaClient,
  table: string,
  id: string,
  embedding: number[]
): Promise<void> {
  const embeddingStr = `[${embedding.join(',')}]`;
  
  await prisma.$executeRawUnsafe(
    `UPDATE ${table} SET embedding = '${embeddingStr}'::vector WHERE id = $1`,
    id
  );
}

/**
 * Example: Search for similar source content
 */
export async function searchSimilarSourceContent(
  prisma: PrismaClient,
  queryEmbedding: number[],
  userId: string,
  limit: number = 10
): Promise<any[]> {
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  
  const results = await prisma.$queryRaw<any[]>`
    SELECT 
      id,
      user_id,
      file_id,
      status,
      created_at,
      1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM source_content
    WHERE 
      embedding IS NOT NULL
      AND user_id = ${userId}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;
  
  return results;
}

/**
 * Example: Search for similar ads
 */
export async function searchSimilarAds(
  prisma: PrismaClient,
  queryEmbedding: number[],
  accountId?: string,
  limit: number = 10
): Promise<any[]> {
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  
  const accountFilter = accountId ? `AND account_id = '${accountId}'` : '';
  
  const results = await prisma.$queryRaw<any[]>`
    SELECT 
      id,
      title,
      message,
      status,
      account_id,
      1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM ads
    WHERE 
      embedding IS NOT NULL
      ${accountFilter}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${limit}
  `;
  
  return results;
}

/**
 * Get embedding dimensions for a table
 */
export async function getEmbeddingDimensions(
  prisma: PrismaClient,
  table: string
): Promise<number | null> {
  const result = await prisma.$queryRawUnsafe<{ dims: number }[]>(`
    SELECT 
      atttypmod as dims
    FROM pg_attribute
    WHERE 
      attrelid = '${table}'::regclass
      AND attname = 'embedding'
  `);
  
  return result[0]?.dims || null;
}

/**
 * Distance metrics available in pgvector:
 * 
 * - <-> : L2 distance (Euclidean)
 * - <#> : Inner product (negative, so smaller is more similar)
 * - <=> : Cosine distance (most common for semantic similarity)
 * 
 * To convert distance to similarity (0-1 scale):
 * - Cosine: similarity = 1 - distance
 * - L2: similarity = 1 / (1 + distance)
 * - Inner product: similarity = -distance (if vectors are normalized)
 */

export const DistanceMetric = {
  COSINE: '<=>',
  L2: '<->',
  INNER_PRODUCT: '<#>',
} as const;

