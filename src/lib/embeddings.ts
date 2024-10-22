import { OpenAIApi, Configuration } from 'openai-edge';
import Bottleneck from 'bottleneck';

const config = new Configuration({
  apiKey: process.env.TOGETHER_API_KEY,
  basePath: 'https://api.together.xyz/v1',
});

const openai = new OpenAIApi(config);

// Create a Bottleneck instance to limit concurrent requests
const limiter = new Bottleneck({
  maxConcurrent: 10,
});

export async function getEmbeddings(text: string) {
  if (!text.trim()) {
    text = ' ';
  }
  
  console.log('Requesting embeddings for text:', text); // Log the input text for debugging
  try {
    const response = await limiter.schedule(() => 
      openai.createEmbedding({
        model: 'WhereIsAI/UAE-Large-V1',
        input: text.replace(/\n/g, ' '),
      })
    );
    const result = await response.json();
    console.log('Received embeddings response:', result); // Log the response for debugging
    return result.data[0].embedding as number[];
  } catch (error) {
    console.log('Error calling OpenAI embeddings API:', error); // Improved error logging
    throw error;
  }
}