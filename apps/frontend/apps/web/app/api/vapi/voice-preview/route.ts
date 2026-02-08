import { NextResponse } from 'next/server';
import { getLogger } from '@kit/shared/logger';

/**
 * POST /api/vapi/voice-preview
 * Generate a voice preview using the TTS provider
 */
export async function POST(request: Request) {
  const logger = await getLogger();

  try {
    const { provider, voiceId, text } = await request.json();

    if (!provider || !voiceId) {
      return NextResponse.json(
        { error: 'Provider and voiceId are required' },
        { status: 400 }
      );
    }

    const previewText = text || 'Hi, welcome to your clinic! How can I help you today?';

    // Handle different providers
    if (provider === '11labs') {
      // Use 11Labs Text-to-Speech API
      const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

      if (!elevenLabsApiKey) {
        logger.warn('[Voice Preview] 11Labs API key not configured');
        return NextResponse.json(
          { error: '11Labs API key not configured' },
          { status: 500 }
        );
      }

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': elevenLabsApiKey,
          },
          body: JSON.stringify({
            text: previewText,
            model_id: 'eleven_turbo_v2',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        logger.error({ error, voiceId }, '[Voice Preview] 11Labs API error');
        return NextResponse.json(
          { error: 'Failed to generate voice preview' },
          { status: 500 }
        );
      }

      // Return audio as base64 or stream
      const audioBuffer = await response.arrayBuffer();
      const audioBase64 = Buffer.from(audioBuffer).toString('base64');

      logger.info({ voiceId, provider }, '[Voice Preview] Generated 11Labs preview');

      return NextResponse.json({
        success: true,
        audio: `data:audio/mpeg;base64,${audioBase64}`,
        provider: '11labs',
      });
    } 
    
    else if (provider === 'openai') {
      // Use OpenAI Text-to-Speech API
      const openaiApiKey = process.env.OPENAI_API_KEY;

      if (!openaiApiKey) {
        logger.warn('[Voice Preview] OpenAI API key not configured');
        return NextResponse.json(
          { error: 'OpenAI API key not configured' },
          { status: 500 }
        );
      }

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          voice: voiceId, // alloy, echo, fable, onyx, nova, shimmer
          input: previewText,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ error, voiceId }, '[Voice Preview] OpenAI API error');
        return NextResponse.json(
          { error: 'Failed to generate voice preview' },
          { status: 500 }
        );
      }

      const audioBuffer = await response.arrayBuffer();
      const audioBase64 = Buffer.from(audioBuffer).toString('base64');

      logger.info({ voiceId, provider }, '[Voice Preview] Generated OpenAI preview');

      return NextResponse.json({
        success: true,
        audio: `data:audio/mpeg;base64,${audioBase64}`,
        provider: 'openai',
      });
    }

    return NextResponse.json(
      { error: `Unsupported provider: ${provider}` },
      { status: 400 }
    );
  } catch (error) {
    logger.error({ error }, '[Voice Preview] Unexpected error');
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
