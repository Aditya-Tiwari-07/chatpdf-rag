import PDFViewer from '@/components/PDFViewer';
import ChatSideBar from '@/components/ChatSideBar';
import { db } from '@/lib/db';
import { chats } from '@/lib/db/schema';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import React from 'react'
import ChatComponent from '@/components/ChatComponent';
import MobileSidebar from '@/components/MobileSidebar';

type Props = {
  params: {
    chatId: string
  }
}

const ChatPage = async ({params: {chatId}}: Props) => {
  const { userId } = await auth();
  if (!userId) {
    return redirect('/sign-in')
  }
  const _chats = await db.select().from(chats).where(eq(chats.userId, userId))
  if(!_chats) {
    return redirect('/');
  }
  if (!_chats.find(chat => chat.id === parseInt(chatId))) {
    return redirect('/');
  }

  const currentChat = _chats.find(chat => chat.id === parseInt(chatId));

  return (
    <div className="flex flex-col md:flex-row max-h-screen overflow-hidden">
      {/* Mobile sidebar toggle button */}
      <MobileSidebar />

      {/* chat sidebar */}
      <div className="fixed md:relative md:flex w-[300px] md:w-[300px] h-screen 
        transition-transform duration-300 ease-in-out -translate-x-full md:translate-x-0
        z-40 bg-gray-900" 
        id="chat-sidebar">
        <ChatSideBar chats={_chats} chatId={parseInt(chatId)} />
      </div>

      {/* Add overlay for mobile */}
      <div className="fixed inset-0 bg-black/50 z-30 md:hidden hidden" id="sidebar-overlay"></div>

      {/* main content area */}
      <div className="flex flex-col lg:flex-row flex-1 h-screen">
        {/* pdf viewer - full width on mobile, half on larger screens */}
        <div className="h-[45vh] lg:h-screen lg:flex-1 p-4 overflow-scroll">
          <PDFViewer pdf_url={currentChat?.pdfUrl || ''} />
        </div>
        {/* chat component - full width on mobile, fixed width on larger screens */}
        <div className="h-[55vh] lg:h-screen lg:w-[500px] border-l border-l-slate-200">
          <ChatComponent chatId={parseInt(chatId)} />
        </div>
      </div>
    </div>
  )
};

export default ChatPage;
