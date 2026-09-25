# Agentic UI

A minimal full-stack generative UI demo built as a single Next.js project.

## Stack

- Next.js App Router
- LangChain TypeScript
- Google Gemini via `@langchain/google`
- AG-UI events over SSE
- A2UI v0.9 protocol with the React renderer
- Vercel-ready API Route

## Architecture

```text
Browser
  -> POST /api/agent
  -> Next.js Route Handler
  -> LangChain + Gemini
  -> AG-UI event stream
  -> TEXT_MESSAGE_* -> chat
  -> CUSTOM:a2ui -> A2UI MessageProcessor -> React surface
```

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set these values in `.env.local`:

```env
GOOGLE_API_KEY=your_google_api_key
GOOGLE_MODEL=gemini-2.5-flash
GOOGLE_TEMPERATURE=0.3
```

## Vercel

Import this GitHub repository into Vercel and add the same environment variables in Project Settings -> Environment Variables.

## Try it

Plain text:

```text
What is AG-UI?
```

Generative UI:

```text
Create a three-day Tokyo itinerary with three sections.
```

## MVP scope

This first version intentionally keeps orchestration small: Gemini uses normal LangChain tool calling, while the HTTP response is streamed as AG-UI events. The next iteration can add token-level model streaming, A2UI actions, and AG-UI state updates.
