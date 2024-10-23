import { Configuration, OpenAIApi } from "openai-edge";
import { Message, OpenAIStream, StreamingTextResponse } from 'ai';
import { getContext } from "@/lib/context";
import { db } from "@/lib/db";
import { chats, messages as _messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = 'edge';

const config = new Configuration({
  apiKey: process.env.TOGETHER_API_KEY,
  basePath: 'https://api.together.xyz/v1',
})

const openai = new OpenAIApi(config);

export async function POST(req: Request) {
  try {
    console.log("Received POST request");
    const { messages, chatId } = await req.json();
    console.log("Parsed request body:", { messages, chatId });

    const _chats = await db.select().from(chats).where(eq(chats.id, chatId));
    console.log("Retrieved chats:", _chats);

    if (_chats.length != 1) {
      console.log("Chat not found");
      return NextResponse.json({'error': 'chat not found'}, {status: 404})
    }

    const fileKey = _chats[0].fileKey;
    console.log("File key:", fileKey);

    const lastMessage = messages[messages.length - 1];
    console.log("Last message:", lastMessage);

    const context = await getContext(lastMessage.content, fileKey);
    console.log("Retrieved context:", context);

    const prompt = {
      role: 'system',
      content: `You are a helpful AI assistant. Use the following context to answer the user's latest question:
      START CONTEXT BLOCK
      ${context}
      END OF CONTEXT BLOCK
      Answer concisely and accurately based on the given context. Focus only on answering the latest question, but keep in mind the conversation history for context.`
    };
    console.log("Created prompt:", prompt);

    const conversationHistory = messages.slice(0, -1).map((message: Message) => ({
      role: message.role,
      content: message.content
    }));

    console.log("Sending request to Meta Llama");
    const response = await openai.createChatCompletion({
      model: "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
      messages: [
        prompt,
        ...conversationHistory,
        { role: "user", content: lastMessage.content }
      ],
      stream: true,
    });
    console.log("Received response from OpenAI");

    const stream = OpenAIStream(response, {
      onStart: async () => {
        // save user message into db
        await db.insert(_messages).values({
          chatId,
          content: lastMessage.content,
          role: "user",
        });
      },
      onCompletion: async (completion) => {
        // save ai message into db
        await db.insert(_messages).values({
          chatId,
          content: completion,
          role: "system",
        });
      },
    });
    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error("Error in POST request:", error);
    return NextResponse.json({'error': 'Internal server error'}, {status: 500});
  } 
}