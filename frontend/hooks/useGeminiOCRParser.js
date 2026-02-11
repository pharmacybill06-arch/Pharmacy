import { useCallback, useState } from 'react';

export function useGeminiOCRParser(backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000') {
  const [state, setState] = useState({
    loading: false,
    data: null,
    error: null,
    confidence: null,
  });

  const parse = useCallback(
    async (ocrText) => {
      try {
        setState({
          loading: true,
          data: null,
          error: null,
          confidence: null,
        });

        const response = await fetch(`${backendUrl}/ai/parse-ocr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ocrText }),
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to parse OCR text');
        }

        setState({
          loading: false,
          data: data.data,
          error: null,
          confidence: data.confidence,
        });

        return data.data;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Parsing failed';

        setState({
          loading: false,
          data: null,
          error: errorMessage,
          confidence: null,
        });

        throw new Error(errorMessage);
      }
    },
    [backendUrl]
  );

  const reset = useCallback(() => {
    setState({
      loading: false,
      data: null,
      error: null,
      confidence: null,
    });
  }, []);

  return {
    ...state,
    parse,
    reset,
  };
}

export default useGeminiOCRParser;
