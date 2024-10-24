import { Pinecone } from '@pinecone-database/pinecone';
import { downloadFromS3 } from './s3-server';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { Document, RecursiveCharacterTextSplitter } from '@pinecone-database/doc-splitter';
import { getEmbeddings } from './embeddings';
import md5 from 'md5';

let pinecone: Pinecone | null = null;

export const getPineconeClient = () => {
  if (!pinecone) {
    pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
    console.log('Pinecone client initialized');
  }
  return pinecone;
}

type PDFPage = {
  pageContent: string;
  metadata: {
    loc: {pageNumber:number}
  }
}

export async function loadS3IntoPinecone(fileKey: string) {
  console.log('Starting to download PDF from S3:', fileKey);
  const file_name = await downloadFromS3(fileKey);
  if (!file_name) {
    console.error('Failed to download from S3');
    throw new Error('could not download from s3');
  }
  console.log('Downloaded file:', file_name);

  const loader = new PDFLoader(file_name);
  const pages = (await loader.load()) as PDFPage[];
  console.log(`Loaded ${pages.length} pages from the PDF`);

  const documents = await Promise.all(pages.map(prepareDocument));
  console.log(`Prepared ${documents.flat().length} documents from pages`);

  const vectors = await Promise.all(documents.flat().map(embedDocument));
  console.log(`Generated ${vectors.length} vectors from documents`);

  const client = await getPineconeClient();
  const pineconeIndex = client.index('chatpdf-rag');

  console.log('Uploading vectors into Pinecone');
  const batchSize = 10;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    console.log(`Uploading batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(vectors.length / batchSize)}`);
    await pineconeIndex.namespace(fileKey).upsert(batch);
  }
  
  console.log('Upload complete');
  return documents[0];
}

async function embedDocument(doc: Document) {
  try {
    console.log('Embedding document with page number:', doc.metadata.pageNumber);
    const embeddings = await getEmbeddings(doc.pageContent);
    const hash = md5(doc.pageContent);

    return {
      id: hash,
      values: embeddings,
      metadata: {
        text: String(doc.metadata.text),
        pageNumber: Number(doc.metadata.pageNumber),
      }
    };
  } catch (error) {
    console.error('Error embedding document:', error);
    throw error;
  }
}

export const truncateStringByBytes = (str: string, bytes: number) => {
  const enc = new TextEncoder();
  return new TextDecoder('utf-8').decode(enc.encode(str).slice(0, bytes));
}

async function prepareDocument(page: PDFPage) {
  let { pageContent } = page;
  const { metadata } = page;
  pageContent = pageContent.replace(/\n/g, '');
  const splitter = new RecursiveCharacterTextSplitter();
  const docs = await splitter.splitDocuments([
    new Document({
      pageContent,
      metadata: {
        pageNumber: metadata.loc.pageNumber,
        text: truncateStringByBytes(pageContent, 36000)
      }
    })
  ]);
  console.log(`Prepared document for page number: ${metadata.loc.pageNumber}`);
  return docs;
}