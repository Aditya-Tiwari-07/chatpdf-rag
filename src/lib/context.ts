import { Pinecone } from "@pinecone-database/pinecone";
import { getEmbeddings } from "./embeddings";

export async function getMatchesFromEmbeddings(
  embeddings: number[],
  fileKey: string
) {
  try {
    console.log("Starting getMatchesFromEmbeddings with fileKey:", fileKey);
    const client = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
    console.log("Pinecone client initialized");
    const pineconeIndex = await client.index("chatpdf-rag");
    console.log("Pinecone index accessed");
    const namespace = pineconeIndex.namespace(fileKey);
    console.log("Namespace created for fileKey:", fileKey);
    const queryResult = await namespace.query({
      topK: 5,
      vector: embeddings,
      includeMetadata: true,
    });
    console.log("Query result:", queryResult);
    return queryResult.matches || [];
  } catch (error) {
    console.error("Error querying embeddings:", error);
    throw error;
  }
}

export async function getContext(query: string, fileKey: string) {
  console.log("Starting getContext with query:", query, "and fileKey:", fileKey);
  const queryEmbeddings = await getEmbeddings(query);
  console.log("Query embeddings generated");
  const matches = await getMatchesFromEmbeddings(queryEmbeddings, fileKey);
  console.log("Matches retrieved:", matches);

  const qualifyingDocs = matches.filter(
    (match) => match.score && match.score > 0.3
  );
  console.log("Qualifying docs:", qualifyingDocs);

  type Metadata = {
    text: string;
    pageNumber: number;
  };

  const docs = qualifyingDocs.map((match) => (match.metadata as Metadata).text);
  console.log("Extracted text from qualifying docs");
  // 5 vectors
  const context = docs.join("\n").substring(0, 5000);
  console.log("Final context (truncated):", context.substring(0, 100) + "...");
  return context;
}