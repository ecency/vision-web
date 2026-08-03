'use client';

import { UilPlay, UilPause, UilStopCircle } from '@tooni/iconscout-unicons-react';
import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { InstanceConfigManager, t } from '@/core';
import { stripHtmlAndMarkdown } from '../utils/strip-markdown';

interface Props {
  text: string;
  title?: string;
  className?: string;
}

type TTSStatus = 'idle' | 'playing' | 'paused';

export function TextToSpeechButton({ text, title, className }: Props) {
  const [status, setStatus] = useState<TTSStatus>('idle');
  const [isSupported, setIsSupported] = useState(false);

  const isEnabled = InstanceConfigManager.getConfigValue(
    ({ configuration }) =>
      configuration.instanceConfiguration.features.post?.text2Speech?.enabled ?? false,
  );

  const language = InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.general.language || 'en',
  );

  useEffect(() => {
    setIsSupported('speechSynthesis' in window);
  }, []);

  useEffect(() => {
    // Clean up speech on unmount
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handlePlay = useCallback(() => {
    if (!isSupported) return;

    if (status === 'paused') {
      window.speechSynthesis.resume();
      setStatus('playing');
      return;
    }

    // Cancel any existing speech
    window.speechSynthesis.cancel();

    // `text` is the raw post body: markdown, not rendered HTML. Stripping tags
    // alone left image URLs, link targets and `#`/`*` markers in the string,
    // and the speech synthesiser read every one of them out loud.
    const cleanText = stripHtmlAndMarkdown(text);

    const fullText = title ? `${title}. ${cleanText}` : cleanText;

    // Split into chunks (browsers have character limits)
    const chunks = splitIntoChunks(fullText, 200);
    let currentChunk = 0;

    const speakChunk = () => {
      if (currentChunk >= chunks.length) {
        setStatus('idle');
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[currentChunk]);
      utterance.lang = language;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onend = () => {
        currentChunk++;
        speakChunk();
      };

      utterance.onerror = () => {
        setStatus('idle');
      };

      window.speechSynthesis.speak(utterance);
    };

    setStatus('playing');
    speakChunk();
  }, [text, title, language, status, isSupported]);

  const handlePause = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.pause();
    setStatus('paused');
  }, [isSupported]);

  const handleStop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setStatus('idle');
  }, [isSupported]);

  if (!isEnabled || !isSupported) {
    return null;
  }

  return (
    <div className={clsx('flex items-center gap-1', className)}>
      {status === 'idle' && (
        <button
          type="button"
          onClick={handlePlay}
          className="flex items-center gap-1 px-2 py-1 text-xs text-theme-muted hover:text-theme-primary transition-colors rounded hover:bg-theme-hover"
          title={t('listen')}
        >
          <UilPlay className="size-4" />
          <span>{t('listen')}</span>
        </button>
      )}

      {status === 'playing' && (
        <>
          <button
            type="button"
            onClick={handlePause}
            className="flex items-center gap-1 px-2 py-1 text-xs text-blue-500 hover:text-blue-600 transition-colors rounded hover:bg-theme-hover"
            title={t('pause')}
          >
            <UilPause className="size-4" />
            <span>{t('pause')}</span>
          </button>
          <button
            type="button"
            onClick={handleStop}
            className="p-1 text-theme-muted hover:text-red-500 transition-colors rounded"
            title={t('stop')}
            aria-label={t('stop')}
          >
            <UilStopCircle className="size-4" />
          </button>
        </>
      )}

      {status === 'paused' && (
        <>
          <button
            type="button"
            onClick={handlePlay}
            className="flex items-center gap-1 px-2 py-1 text-xs text-theme-muted hover:text-theme-primary transition-colors rounded hover:bg-theme-hover"
            title={t('resume')}
          >
            <UilPlay className="size-4" />
            <span>{t('resume')}</span>
          </button>
          <button
            type="button"
            onClick={handleStop}
            className="p-1 text-theme-muted hover:text-red-500 transition-colors rounded"
            title={t('stop')}
            aria-label={t('stop')}
          >
            <UilStopCircle className="size-4" />
          </button>
        </>
      )}
    </div>
  );
}

// Helper to split text into chunks for speech synthesis
function splitIntoChunks(text: string, maxLength: number): string[] {
  // Match sentences with punctuation, and also capture trailing text without punctuation
  const sentenceRegex = /[^.!?]+[.!?]+|[^.!?]+$/g;
  const sentences = text.match(sentenceRegex) || [text];
  const chunks: string[] = [];
  let currentChunk = '';

  // Helper to split a long sentence into word-boundary chunks
  const splitLongSentence = (sentence: string): string[] => {
    const words = sentence.split(/\s+/);
    const subChunks: string[] = [];
    let subChunk = '';

    for (const word of words) {
      if (subChunk.length + word.length + 1 > maxLength) {
        if (subChunk) {
          subChunks.push(subChunk.trim());
        }
        // If a single word is longer than maxLength, add it anyway
        subChunk = word;
      } else {
        subChunk += (subChunk ? ' ' : '') + word;
      }
    }

    if (subChunk) {
      subChunks.push(subChunk.trim());
    }

    return subChunks;
  };

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    // If the sentence itself is too long, split it at word boundaries
    if (trimmedSentence.length > maxLength) {
      // First, flush the current chunk if any
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      // Split the long sentence and add sub-chunks
      const subChunks = splitLongSentence(trimmedSentence);
      for (const subChunk of subChunks) {
        chunks.push(subChunk);
      }
    } else if ((currentChunk + ' ' + trimmedSentence).length > maxLength) {
      // Adding this sentence would exceed the limit
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = trimmedSentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }
  }

  // Always push the final chunk
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(chunk => chunk.length > 0);
}
